"use client";

// ============================================================
// Noor Agent loop - what turns Agent from a chat tier into an
// executor (Claude Cowork / Manus style):
//
//   1. plan    -> model emits a numbered plan
//   2. act     -> ORLEIA_ACTION lines stream through the existing
//                 interceptor (executed for real, confirmations shown)
//   3. observe -> tool results (web_search, read_url, workspace_*) and
//                 the executed action results go back into the model's
//                 context as a synthetic user turn
//   4. repeat  -> the model continues the job or emits ORLEIA_DONE
//
// Two text channels per turn: RAW (with ORLEIA_TOOL/ORLEIA_DONE plumbing,
// used for parsing) and CLEAN (plumbing scrubbed, shown to the user and
// stored in the transcript). Parsing the CLEAN text was the bug that made
// tools never run - the scrubber removed the lines before the parser saw
// them.
// Hard caps: 5 turns, ~3 min total, abort-signal aware. Errors degrade
// gracefully to the last good reply (never a stuck UI).
// ============================================================

import { AIMessage, AIModel, AISource } from "@/types";
import { chatStream, NoorCapError } from "./ai-stream";
import { webSearch } from "./web-search";
import {
  describeWorkspace,
  readWorkspaceFile,
  readWorkspaceBulk,
  writeWorkspaceFile,
  deleteWorkspaceFile,
} from "./agent-device";

const MAX_TURNS = 5;
const TOTAL_BUDGET_MS = 180_000;

const LOOP_PREAMBLE = `You are running in AGENT EXECUTION MODE for this job. Work like an autonomous agent:

TURN 1 - Reply with ONLY a short numbered plan (max 5 steps, one line each). No actions yet, no preamble.
TURN 2+ - Execute your plan step by step: emit ORLEIA_ACTION lines for each step and act on the OBSERVATION results you receive. The user pre-approved this job, so do NOT ask for permission again - just execute. If you need live facts for a step, call ORLEIA_TOOL {"action":"web_search","params":{"query":"..."}} on its own line; if you need the contents of a specific web page, call ORLEIA_TOOL {"action":"read_url","params":{"url":"https://..."}} on its own line; if a workspace folder was granted to you (see your context), call ORLEIA_TOOL {"action":"workspace_list"} or {"action":"workspace_read","params":{"path":"file.txt"}} or {"action":"workspace_read_all"} or {"action":"workspace_write","params":{"path":"file.txt","content":"..."}} or {"action":"workspace_delete","params":{"path":"file.txt"}} on its own line - real results are returned to you next turn. NEVER write "Call workspace_list" or describe the tool in words - EMIT the ORLEIA_TOOL line itself.
FINISH - When every step is done, reply with a tight summary of what you did, then a final line ORLEIA_DONE. If the job is genuinely impossible, say why in one line, then ORLEIA_DONE.
Never re-plan from scratch. Never repeat a step that already succeeded. Never emit ORLEIA_TOOL lines for tools that returned errors twice - adapt instead.

WORD RULE: "my workspace", "my folder", "my files", "on my computer/device/disk" refer to the DEVICE FOLDER granted to you (see your context) - use ORLEIA_TOOL workspace_* tools for those. The Orleia app's own data (habits, tasks, journal) is separate; only use it when the user clearly means the app itself.`;

const DONE_RE = /\bORLEIA_DONE\b/;

/** Remove plumbing lines (ORLEIA_TOOL / ORLEIA_DONE) from a finished reply. */
function scrubPlumbing(text: string): string {
  return text
    .split("\n")
    .filter((l) => !/^\s*ORLEIA_(TOOL|DONE)\b/.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Streaming scrubber: hides ORLEIA_TOOL / ORLEIA_DONE lines from the live
 * token stream. Buffers until a line is complete, then emits or drops it.
 */
function makeScrubber(onToken: (d: string) => void) {
  let buf = "";
  const emit = (t: string) => {
    if (t) onToken(t);
  };
  return {
    feed(delta: string) {
      buf += delta;
      for (;;) {
        const nl = buf.indexOf("\n");
        if (nl < 0) break;
        const line = buf.slice(0, nl + 1);
        buf = buf.slice(nl + 1);
        if (!/^\s*ORLEIA_(TOOL|DONE)\b/.test(line)) emit(line);
      }
    },
    flush() {
      const rest = buf;
      buf = "";
      if (rest && !/^\s*ORLEIA_(TOOL|DONE)\b/.test(rest)) emit(rest);
    },
  };
}

/** Run one tool call, returning an observation string (or null if unknown). */
async function runTool(
  callItem: { action?: string; params?: Record<string, unknown> },
  fallbackQuery: string,
  webSources: AISource[]
): Promise<string | null> {
  if (callItem.action === "web_search") {
    const q = String(callItem.params?.query || fallbackQuery);
    try {
      const results = await webSearch(q, 5);
      const lines = [`WEB RESULTS for "${q}":`];
      if (!results.length) lines.push("- (no results)");
      for (const r of results) {
        lines.push(`- ${r.title}: ${r.snippet} (${r.url})`);
        webSources.push({ kind: "web", title: r.title, url: r.url, snippet: r.snippet });
      }
      return lines.join("\n");
    } catch {
      return `WEB RESULTS for "${q}": search failed this turn - continue without it.`;
    }
  }
  if (callItem.action === "read_url") {
    const u = String(callItem.params?.url || "");
    try {
      const res = await fetch("/api/agent/read-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      const data = (await res.json()) as { title?: string; text?: string; error?: string };
      if (data.error) return `PAGE ${u}: error - ${data.error}`;
      return `PAGE "${data.title || u}" (${u}) content:\n${(data.text || "").slice(0, 4000)}`;
    } catch {
      return `PAGE ${u}: could not fetch.`;
    }
  }
  if (callItem.action === "workspace_list") {
    const d = await describeWorkspace();
    return d
      ? `WORKSPACE LIST:\n${d}`
      : "WORKSPACE LIST: no folder connected this session - the user must reconnect it. Skip workspace steps.";
  }
  if (callItem.action === "workspace_read") {
    return readWorkspaceFile(String(callItem.params?.path || ""));
  }
  if (callItem.action === "workspace_read_all") {
    return readWorkspaceBulk();
  }
  if (callItem.action === "workspace_write") {
    return writeWorkspaceFile(String(callItem.params?.path || ""), String(callItem.params?.content ?? ""));
  }
  if (callItem.action === "workspace_delete") {
    return deleteWorkspaceFile(String(callItem.params?.path || ""));
  }
  return null;
}

/** Short human label for a tool call, shown as a status chip in the chat. */
function toolLabel(callItem: { action?: string; params?: Record<string, unknown> }): string | null {
  switch (callItem.action) {
    case "web_search":
      return `Searching the web for "${String(callItem.params?.query || "").slice(0, 40)}"...`;
    case "read_url":
      return "Reading the page...";
    case "workspace_list":
      return "Listing workspace files...";
    case "workspace_read":
      return `Reading ${String(callItem.params?.path || "file")}...`;
    case "workspace_read_all":
      return "Reading all workspace files...";
    case "workspace_write":
      return `Writing ${String(callItem.params?.path || "file")}...`;
    case "workspace_delete":
      return `Deleting ${String(callItem.params?.path || "file")}...`;
    default:
      return null;
  }
}

/** Run an autonomous multi-turn agent job, streaming every turn into the chat. */
export async function runAgentLoop(
  query: string,
  history: AIMessage[],
  modelId: AIModel,
  opts: StreamLikeOpts,
  agentContext = "",
  webSources: AISource[] = []
): Promise<string> {
  const started = Date.now();
  const transcript: AIMessage[] = [...history];

  // One LLM turn: streams (scrubbed) into the chat, returns both channels.
  const call = async (q: string): Promise<{ raw: string; clean: string }> => {
    const scrub = makeScrubber(opts.onToken);
    let out = "";
    try {
      out =
        (await chatStream(
          q,
          transcript,
          modelId,
          {
            ...opts,
            onToken: (delta) => scrub.feed(delta),
          },
          agentContext
        )) || "";
    } finally {
      scrub.flush();
    }
    return { raw: out, clean: scrubPlumbing(out) };
  };

  // If a device folder is granted and the job sounds like it's about the
  // user's files, pin the interpretation explicitly - "workspace" must
  // never silently mean the Orleia app's own data instead.
  const hasWorkspace = /granted you a workspace folder/.test(agentContext);
  const wantsFiles = /\b(workspace|folder|files?|computer|device|disk)\b/i.test(query);
  const jobPrefix =
    hasWorkspace && wantsFiles
      ? LOOP_PREAMBLE +
        '\n\nNOTE: The user granted you a device workspace folder (described in your context). This job is about THAT folder - start by calling ORLEIA_TOOL {"action":"workspace_list"}.'
      : LOOP_PREAMBLE;

  // Turn 1: the plan (streams into the chat like any other reply).
  const plan = await call(jobPrefix + "\n\nJOB: " + query);
  transcript.push({ id: "agent-u1", role: "user", content: query, timestamp: new Date().toISOString() });
  transcript.push({ id: "agent-a1", role: "assistant", content: plan.clean, timestamp: new Date().toISOString() });

  let lastRaw = plan.raw;
  let lastClean = plan.clean;
  let sawAction = false;
  let timedOut = false;
  // Everything the user saw, in order (plan, chips, replies, notes) - the
  // loop's return value, so the stored transcript matches the live stream.
  let fullVisible = plan.clean;
  // Last turn's observation text - the honest fallback if the model fails
  // to verbalize results.
  let lastObs = "";

  for (let turn = 2; turn <= MAX_TURNS; turn++) {
    if (DONE_RE.test(lastRaw)) break;
    if (Date.now() - started > TOTAL_BUDGET_MS) {
      timedOut = true;
      break;
    }
    if (opts.signal?.aborted) break;

    // Observation: run any ORLEIA_TOOL calls from the RAW reply (the scrubbed
    // copy has the lines removed - parsing must always use raw).
    const observation: string[] = [];
    const toolRe = /ORLEIA_TOOL\s*(\{[^\n]*\})/g;
    const calls: { action?: string; params?: Record<string, unknown> }[] = [];
    let tm: RegExpExecArray | null;
    while ((tm = toolRe.exec(lastRaw)) !== null) {
      try {
        calls.push(JSON.parse(tm[1]));
      } catch {
        /* malformed tool call - skip */
      }
    }
    for (const callItem of calls.slice(0, 3)) {
      // Visible status chip - tool activity must never look like a freeze.
      const label = toolLabel(callItem);
      if (label) {
        const chip = `\n\n_[${label}]_\n`;
        opts.onToken(chip);
        fullVisible += chip;
      }
      const result = await runTool(callItem, query, webSources);
      if (result !== null) observation.push(result);
    }
    lastObs = observation.join("\n");

    const executed = /✅|I tried to do that/.test(lastClean);
    if (executed) sawAction = true;
    if (executed) {
      // The interceptor's confirmations ARE the ground truth of what ran.
      observation.push("LAST TURN RESULT (executed for real): " + lastClean.replace(/\s+/g, " ").slice(0, 600));
    }
    if (!observation.length) {
      observation.push(
        hasWorkspace && wantsFiles
          ? 'STATUS: Your plan is approved. Execute it now - start with ORLEIA_TOOL {"action":"workspace_list"}, then continue step by step.'
          : "STATUS: Your plan is approved. Execute it now - emit the ORLEIA_ACTION line(s) for step 1, then continue step by step."
      );
    }

    const obsBlock =
      "\n\n[OBSERVATION - real results from your last turn]\n" +
      observation.join("\n") +
      "\n\nContinue the job. When finished, summarize and end with ORLEIA_DONE.";

    // The provider is flaky (503 windows, cold starts) - one retry rescues
    // most verbalization failures. Two empty/failing attempts -> degrade.
    let reply: { raw: string; clean: string } | null = null;
    for (let attempt = 0; attempt < 2 && !reply; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
      try {
        const r = await call("PROCEED" + obsBlock);
        if (r.clean.trim() || r.raw.trim()) reply = r;
      } catch (e) {
        // The cap must surface as the upgrade message, never be swallowed.
        if (e instanceof NoorCapError) throw e;
        /* retry */
      }
    }
    if (!reply) break;

    lastRaw = reply.raw;
    lastClean = reply.clean;
    fullVisible += reply.clean;
    transcript.push({
      id: `agent-u${turn}`,
      role: "user",
      content: "PROCEED" + obsBlock,
      timestamp: new Date().toISOString(),
    });
    transcript.push({ id: `agent-a${turn}`, role: "assistant", content: reply.clean, timestamp: new Date().toISOString() });
  }

  // Never end on a dangling mid-job instruction - if we ran out of budget
  // (or turns) before ORLEIA_DONE, say so honestly.
  if (!DONE_RE.test(lastRaw) && (timedOut || sawAction || lastRaw.length > 0)) {
    const note =
      "\n\n_(I paused here - multi-step jobs have a working time budget. Ask me to **continue** and I'll pick up exactly where I left off.)_";
    if (!lastClean.includes("paused here")) {
      opts.onToken(note);
      lastClean += note;
      fullVisible += note;
    }
  }

  // Never end a job with nothing conversational: if the model executed the
  // tools but failed to verbalize (provider flake), synthesize an honest
  // summary straight from the observations the user already paid for.
  if (!lastClean.trim()) {
    const useful = lastObs
      .split("\n")
      .filter((l) => l.trim().startsWith("- "))
      .slice(0, 30)
      .join("\n");
    const fallback = useful
      ? `\n\nHere's what I found:\n\n${useful}`
      : "\n\nI hit a model error mid-job and couldn't finish the summary - please try again in a moment.";
    opts.onToken(fallback);
    fullVisible += fallback;
  }

  return fullVisible.trim() || lastClean || plan.clean || "";
}

// Local structural type - avoids importing StreamOpts (which lives with
// chatStream) and keeps the loop decoupled from its evolution.
interface StreamLikeOpts {
  onToken: (delta: string) => void;
  onThinking?: (delta: string) => void;
  signal?: AbortSignal;
  sources?: AISource[];
}
