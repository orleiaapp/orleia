"use client";

import { AIMessage, AIModel, AISource } from "@/types";
import { chat, buildStatsBlock, buildProfileBlock, buildNoorBlock, ChatOpts, withAttachmentContext } from "./ai";
import { getToday } from "./utils";

// Effort tiers pick their own primary model (see ai-models EFFORT_KNOBS).
// If an endpoint is cold or retired — the 120b primary hit EOL in Oct
// 2026 — a live Nemotron sibling answers instead of leaving the user
// hanging. Every primary we ever send has an entry here.
const FALLBACK_MODELS: Record<string, string[]> = {
  "nvidia/nemotron-3-super-120b-a12b": [
    "nvidia/nemotron-3-ultra-550b-a55b",
    "nvidia/nemotron-3.5-lightning-30b-a3b",
  ],
  // Live model first on retry: super-120b is EOL'd/flapping (2026-10),
  // so it's the LAST resort, not the first hop after a 503.
  "nvidia/nemotron-3-ultra-550b-a55b": ["nvidia/nemotron-3.5-lightning-30b-a3b", "nvidia/nemotron-3-super-120b-a12b"],
  "nvidia/nemotron-3.5-lightning-30b-a3b": ["nvidia/nemotron-3-ultra-550b-a55b", "nvidia/nemotron-3-super-120b-a12b"],
};
import { buildSearchBlock, isLiveQuery } from "./web-search";
import { getSituationPayload } from "@/lib/graph/engine";
import { getDeviceId } from "./device-id";
import { slurSpellReplacement } from "./safety-guard";
import { setNoorUsage, usageLine } from "./noor-usage";
import { buildSkillsBlock } from "./noor-skills";

// Re-export the shared cap error so existing imports keep working.
export { NoorCapError } from "./noor-cap";
import { NoorCapError } from "./noor-cap";
import { MODEL_PROFILES, DEFAULT_MODEL } from "./ai-models";
import { isLocalModel, localModelById, probeOllama, streamOllama, isModelInstalled, ollamaSetupHint } from "./local-ai";
import { buildNoorSystemPrompt } from "./noor-system";
import { countFactInstruction } from "./count-guard";
import { jailbreakOverride, jailbreakQueryReplacement } from "./jailbreak-guard";
import {
  detectAction,
  executeAction,
  tryExecuteJsonAction,
  parseActionPayload,
  processActionReply,
  stripActionRemnants,
  ACTION_MARKER_VARIANTS,
} from "./ai-actions";

/**
 * Stream tokens from the LLM over SSE (proxied through /api/chat).
 * Returns the full reply text, or null on any failure.
 */
async function streamLLM(
  query: string,
  conversationHistory: AIMessage[],
  modelId: AIModel,
  signal: AbortSignal | undefined,
  onToken: (delta: string) => void,
  opts?: ChatOpts,
  /** Agent-only extra context (device environment + screen description). */
  agentContext = ""
): Promise<string | null> {
  // ---- Local AI (Ollama) ----
  // Runs entirely on the user's machine: same Noor prompt + guards, but no
  // /api/chat round-trip, no NVIDIA dependency and no daily cap. Falls back
  // to the cloud path only when this device has no reachable Ollama install
  // (so the picker's local selection can never silently brick the chat).
  if (isLocalModel(modelId)) {
    const def = localModelById(modelId);
    if (!def) return null;
    const status = await probeOllama();
    if (!status.reachable || !isModelInstalled(status, def)) {
      const missing = !status.reachable
        ? `${ollamaSetupHint()}`
        : `Model not downloaded yet. Run: ollama pull ${def.ollamaTag}`;
      return `**Local AI isn't ready.** ${missing}\n\nOnce it's running, pick **${def.name}** again — it runs on this computer, free and offline.`;
    }
    const localSystem = buildNoorSystemPrompt(modelId, opts);
    const localMessages = conversationHistory
      .slice(-12)
      .filter((m) => (m as { kind?: string }).kind !== "usage-warning")
      .map((m) => ({ role: m.role, content: withAttachmentContext(m) }));
    const reply = await streamOllama(
      def,
      localSystem,
      localMessages,
      (delta) => {
        // Local models emit plain text; route through the same visible-text
        // interceptor so ORLEIA_ACTION lines still execute for real.
        onToken(delta);
      },
      opts?.onThinking,
      signal
    );
    return reply;
  }
  const model = MODEL_PROFILES[modelId];
  if (!model) return null;

  const stats = buildStatsBlock(model.analysisDepth);
  const profileBlock = buildProfileBlock();
  const noorBlock = buildNoorBlock();
  const searchBlock = buildSearchBlock(opts?.sources || []);
  const extraContext = opts?.extraSystem ? `\n\n${opts.extraSystem}` : "";
  // Server-truth usage for Noor's own self-knowledge (answers billing
  // questions with real numbers instead of inventing them).
  const usageBlock = usageLine();
  // Skills: user-authored standing instructions (local-only). Injected for
  // every Noor surface that streams through here (main chat, projects, research).
  const skillsBlock = buildSkillsBlock();
  const systemPrompt = `${model.systemPrompt}\n\nToday is ${getToday()}.\n\n${stats}${profileBlock}${noorBlock}${searchBlock}${usageBlock}${skillsBlock}${extraContext}${agentContext}`;

  // Never feed JSON-looking assistant replies back to the model.
  const history = conversationHistory
    .slice(-model.maxContextMessages)
    .filter((m) => {
      if ((m as { kind?: string }).kind === "usage-warning") return false; // banner, not a real reply
      if (m.role !== "assistant") return true;
      const t = (m.content || "").trim();
      return !/^\{\s*["']/.test(t) && !/^```(?:json)?/i.test(t);
    });
  const payloadMessages = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: withAttachmentContext(m) })),
    { role: "user", content: query },
  ];
  // Deterministic letter-count guard: if the user asks "how many X's in Y",
  // inject the exact count so the model never guesses (see count-guard.ts).
  const countFact = countFactInstruction(query);
  if (countFact) {
    payloadMessages.push({ role: "system", content: countFact });
  }
  // Jailbreak guard: if the message is an identity-change/override attempt,
  // inject a hard override so even small models cannot comply.
  const jailbreakNote = jailbreakOverride(query);
  if (jailbreakNote) {
    payloadMessages.push({ role: "system", content: jailbreakNote });
  }
  // Reveal/repeat attacks: swap the user query for a safe instruction so the
  // model has nothing to leak even on small models.
  const safeQuery = jailbreakQueryReplacement(query);
  if (safeQuery) {
    const last = payloadMessages[payloadMessages.length - 1];
    if (last && last.role === "user") {
      payloadMessages[payloadMessages.length - 1] = { role: "user", content: safeQuery };
    }
  }
  // Slur end-runs ("spell X backwards"): same technique - the model gets a
  // safe instruction instead, so even small models cannot comply.
  const slurSafe = slurSpellReplacement(query);
  if (slurSafe && !safeQuery) {
    const last = payloadMessages[payloadMessages.length - 1];
    if (last && last.role === "user") {
      payloadMessages[payloadMessages.length - 1] = { role: "user", content: slurSafe };
    }
  }
  // TTFB/stall timer handles - declared outside try/catch so the catch can
  // also clean them up.
  let clearStreamTimers: () => void = () => {};
  try {    // Try primary model, then fallbacks
    let res: Response | null = null;
    let triedModel = model.nvidiaModelId;
    const fallbacks = FALLBACK_MODELS[model.nvidiaModelId] || [];
    const modelsToTry = [model.nvidiaModelId, ...fallbacks];
    
    // Hard per-attempt budget: a slow or hung endpoint must never hold the
    // request hostage. TTFB only - once streaming, the stall guard takes over.
    const attemptTimeoutMs = 25000;
    // Time-to-first-byte guard (replaces the old whole-stream timeout, which
    // killed healthy long streams - Agent's deep model legitimately streams
    // past 25s - and dumped users into the offline fallback mid-answer).
    // TTFB: abort only while NOTHING has arrived. Once streaming, a stall
    // guard aborts only if the stream goes silent for 45s. No total cap.
    let bumpStreamStall: () => void = () => {};
    for (const tryModel of modelsToTry) {
      let gotResponse = false;
      const attemptAbort = new AbortController();
      const ttfbTimer = setTimeout(() => {
        if (!gotResponse) attemptAbort.abort();
      }, attemptTimeoutMs);
      let stallTimer: ReturnType<typeof setTimeout> | null = null;
      clearStreamTimers = () => {
        clearTimeout(ttfbTimer);
        if (stallTimer) clearTimeout(stallTimer);
      };
      bumpStreamStall = () => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => attemptAbort.abort(), 45_000);
      };
      try {
        const attempt = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-orleia-device": getDeviceId() },
      body: JSON.stringify({
        model: tryModel,
        messages: payloadMessages,
        temperature: model.temperature,
        maxTokens: opts?.maxTokens ?? model.maxTokens,
        stream: true,
        ...(model.disableThinking ? { chatTemplateKwargs: { enable_thinking: false } } : {}),
        situation: getSituationPayload(),
        lang: (typeof document !== "undefined" ? document.documentElement.lang : "") || undefined,
      }),
      // Caller's abort + our TTFB/stall guards combined.
      ...(typeof AbortSignal.any === "function"
        ? { signal: AbortSignal.any([signal, attemptAbort.signal].filter((x): x is AbortSignal => Boolean(x))) }
        : {}),
    });
    if (attempt.ok && attempt.body) {
      res = attempt; triedModel = tryModel;
      // Headers arrived: TTFB satisfied. The stall guard takes over from here.
      gotResponse = true;
      clearTimeout(ttfbTimer);
      bumpStreamStall();
      // Server-truth usage -> UI warning + Noor's own self-knowledge.
      const usageRaw = attempt.headers.get("x-orleia-usage");
      if (usageRaw) {
        try {
          const u = JSON.parse(usageRaw) as { used?: number; limit?: number | null };
          if (typeof u.used === "number") {
            setNoorUsage(u.used, u.limit ?? null);
            window.dispatchEvent(new CustomEvent("orleia:noor-usage", { detail: { used: u.used, limit: u.limit ?? null } }));
          }
        } catch { /* malformed header - ignore */ }
      }
      break;
    }
      if (attempt.status === 402) {
        // Daily Noor cap reached — do not fall back to other models; surface
        // the upgrade state so the UI can respond (throws NoorCapError).
        clearStreamTimers();
        throw new NoorCapError();
      }
      clearStreamTimers(); // failed attempt - kill its timers before retrying
      } catch (e) {
        clearStreamTimers();
        if (e instanceof NoorCapError) throw e;
        /* try next */
      }
    }
    if (!res || !res.body) {
      clearStreamTimers();
      return null;
  }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    // ---- Thinking separation ----
    // Reasoning models surface their thinking in two ways: a dedicated
    // delta.reasoning_content field, or inline <think>...</think> tags inside
    // content. Both are routed to onThinking so the visible reply stays clean
    // and the UI can show the thought process in a collapsible block.
    // Thinking never passes through the action interceptor or the voice
    // pipeline (it goes to onThinking, not onToken).
    const onThinking = opts?.onThinking;
    let inThink = false; // inside an inline <think> block
    let wbuf = "";       // held-back text (may end with a partial tag)
    const flushHeld = () => {
      if (!wbuf) return;
      if (inThink) onThinking?.(wbuf);
      else { full += wbuf; onToken(wbuf); }
      wbuf = "";
    };
    // Route one content delta through the <think> state machine.
    const routeContent = (delta: string) => {
      wbuf += delta;
      for (;;) {
        if (inThink) {
          const close = wbuf.indexOf("</think>");
          if (close === -1) {
            // Hold back a tail that could be a partial closing tag.
            const lt = wbuf.lastIndexOf("<");
            const keep = lt !== -1 && wbuf.length - lt < 9 ? lt : wbuf.length;
            if (keep > 0) { onThinking?.(wbuf.slice(0, keep)); wbuf = wbuf.slice(keep); }
            return;
          }
          if (close > 0) onThinking?.(wbuf.slice(0, close));
          wbuf = wbuf.slice(close + 8);
          inThink = false;
        } else {
          const open = wbuf.indexOf("<think>");
          if (open === -1) {
            const lt = wbuf.lastIndexOf("<");
            const keep = lt !== -1 && wbuf.length - lt < 8 ? lt : wbuf.length;
            if (keep > 0) { const vis = wbuf.slice(0, keep); full += vis; onToken(vis); wbuf = wbuf.slice(keep); }
            return;
          }
          if (open > 0) { const vis = wbuf.slice(0, open); full += vis; onToken(vis); }
          wbuf = wbuf.slice(open + 7);
          inThink = true;
        }
      }
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bumpStreamStall(); // stream is alive - rearm the stall guard
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const d = json?.choices?.[0]?.delta;
          const rc = d?.reasoning_content;
          if (typeof rc === "string" && rc) onThinking?.(rc);
          const delta = d?.content ?? null;
          if (typeof delta === "string" && delta) routeContent(delta);
        } catch {
          /* skip malformed frames */
        }
      }
    }
    flushHeld();
    clearStreamTimers();
    return full.trim() || null;
  } catch (e) {
    clearStreamTimers();
    // NEVER swallow the cap: the UI must show the upgrade message, not
    // silently drop to the offline robot (which once impersonated Noor
    // for a whole session after the cap had already been hit).
    if (e instanceof NoorCapError) throw e;
    return null;
  }
}

/**
 * Streaming chat - built for voice mode so Noor can start speaking the
 * moment the first sentence is ready (rapid, natural back-and-forth).
 * - Fast local actions execute instantly (one emit).
 * - Then the LLM streams token-by-token via onToken.
 * - Falls back to the local engine on any failure, so voice mode always answers.
 */
export interface StreamOpts {
  onToken: (delta: string) => void;
  /** Reply token-budget override (pet chats pass a small cap for snappy replies). */
  maxTokens?: number;
  /** Streaming callback for the model's internal reasoning (thinking tokens). */
  onThinking?: (delta: string) => void;
  signal?: AbortSignal;
  sources?: AISource[];
  /** Confirm-chips mode: when set, proposed actions are NOT executed —
   *  the proposal is handed to the UI as a tappable confirmation and the
   *  raw block never reaches the visible text. Omit to auto-execute
   *  (voice, background asks, and the offline engine keep that behavior). */
  onProposeAction?: (proposal: { action: string; params: Record<string, unknown> }) => void;
}

export async function chatStream(
  query: string,
  conversationHistory: AIMessage[] = [],
  modelId: AIModel = DEFAULT_MODEL,
  opts: StreamOpts,
  /** Agent-only extra context (device environment + screen description). */
  agentContext = ""
): Promise<string> {
  // Local models have no cloud profile — skip the profile gate for them.
  const model = isLocalModel(modelId) ? null : MODEL_PROFILES[modelId as AIModel];
  if (!model && !isLocalModel(modelId)) {
    const msg = "Invalid model selected. Please pick a Novella 5.0 effort level (or Local AI).";
    opts.onToken(msg);
    return msg;
  }

  // Fast local actions first - the user asked us to DO something, do it now.
  // Live queries (news, release dates, prices, AI model news...) must reach
  // the LLM with web results instead - never let a local action hijack them.
  const action = isLiveQuery(query)
    ? { matched: false, type: null, params: {}, confidence: 0 }
    : detectAction(query);
  if (action.matched && action.confidence >= 0.7 && !modelId.startsWith("novella-max") && !modelId.startsWith("novella-ultra")) {
    // Confirm-chips mode (pet threads): NEVER auto-execute — hand the
    // local match to the UI as a proposal, same contract as the stream
    // interceptor below.
    if (opts.onProposeAction) {
      if (action.type) opts.onProposeAction({ action: action.type, params: action.params });
      return "";
    }
    const result = executeAction(action);
    opts.onToken(result.message);
    return result.message;
  }

  // Streaming LLM - the rapid path. The token stream passes through a small
  // state machine: a ORLEIA_ACTION { ... } block the model emits is executed
  // for real and its JSON is replaced by a natural confirmation BEFORE it
  // reaches the UI or the voice pipeline (voice mode must never read raw
  // JSON aloud, and the action must actually happen - never just claimed).
  // The marker can arrive split across token chunks, so any suffix of the
  // stream that could still be the start of a marker is held back. The marker
  // itself is matched fuzzily (missing X, space/hyphen/no separator) so a
  // misspelled marker still gets intercepted instead of leaking raw JSON.
  let actionText = "";
  let handledAction = false;
  let pending = "";
  let inAction = false;
  let actionBuf = "";
  let sawMarker = false;

  // ---- Creation batching ----
  // When the model fires several create_* actions back-to-back (e.g.
  // "plan my week" -> 5 tasks), showing one confirmation per action spams
  // the thread. Rapid creation confirmations are held briefly and flushed
  // as a single summary ("I've created 5 tasks: a, b, c").
  type BatchItem = { kind: string; message: string };
  const batch: BatchItem[] = [];
  let batchTimer: ReturnType<typeof setTimeout> | null = null;
  const KIND_LABELS: Record<string, string> = {
    create_task: "task",
    create_habit: "habit",
    create_journal: "journal entry",
    create_note: "note",
    create_event: "calendar event",
  };
  const flushBatch = () => {
    if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }
    if (!batch.length) return;
    const items = batch.splice(0, batch.length);
    if (items.length === 1) { emit(items[0].message); return; }
    const kindCounts: Record<string, number> = {};
    const titles: string[] = [];
    for (const it of items) {
      kindCounts[it.kind] = (kindCounts[it.kind] || 0) + 1;
      const m = it.message.match(/\*\*(.+?)\*\*/);
      if (m) titles.push(m[1]);
    }
    const parts = Object.entries(kindCounts).map(([k, n]) => {
      const label = KIND_LABELS[k] || "item";
      return `${n} ${label}${n > 1 ? "s" : ""}`;
    });
    let summary = `\u2705 Done \u2014 I've created ${parts.join(" and ")}`;
    if (titles.length && titles.length <= 6) {
      summary += `: ${titles.map((x) => `**${x}**`).join(", ")}`;
    }
    summary += ".";
    emit(summary);
  };
  const queueConfirmation = (kind: string, message: string) => {
    if (/^create_(task|habit|journal|note|event)$/.test(kind) && /^\u2705/.test(message)) {
      batch.push({ kind, message });
      if (batchTimer) clearTimeout(batchTimer);
      batchTimer = setTimeout(flushBatch, 80);
    } else {
      flushBatch(); // keep chronological order before non-creatable actions
      emit(message);
    }
  };
  const MAX_MARKER_LEN = Math.max(...ACTION_MARKER_VARIANTS.map((m) => m.length));
  const emit = (t: string) => {
    if (!t) return;
    actionText += t;
    opts.onToken(t);
  };

  // The ORLEIA_ACTION marker interceptor - the only path visible text takes.
  const handleVisible = (delta: string) => {
    if (inAction) {
      actionBuf += delta;
      finishAction();
      return;
    }
    pending += delta;
    const lower = pending.toLowerCase();
    // Earliest marker variant wins (e.g. prose before the marker is kept).
    let markerIdx = -1;
    for (const m of ACTION_MARKER_VARIANTS) {
      const i = lower.indexOf(m);
      if (i >= 0 && (markerIdx < 0 || i < markerIdx)) markerIdx = i;
    }
    if (markerIdx >= 0) {
      sawMarker = true;
      emit(pending.slice(0, markerIdx));
      actionBuf = pending.slice(markerIdx);
      pending = "";
      inAction = true;
      finishAction();
      return;
    }
    // No full marker yet - hold back any suffix that could be its start.
    let holdLen = 0;
    const maxHold = Math.min(pending.length, MAX_MARKER_LEN);
    for (let k = 1; k <= maxHold; k++) {
      const suffix = lower.slice(lower.length - k);
      if (ACTION_MARKER_VARIANTS.some((m) => m.startsWith(suffix))) holdLen = k;
    }
    emit(pending.slice(0, pending.length - holdLen));
    pending = pending.slice(pending.length - holdLen);
  };

  const finishAction = () => {
    const brace = actionBuf.indexOf("{");
    if (brace < 0) return; // JSON hasn't started yet - keep buffering
    let depth = 0;
    for (let i = brace; i < actionBuf.length; i++) {
      const ch = actionBuf[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const json = actionBuf.slice(brace, i + 1);
          const rest = actionBuf.slice(i + 1);
          inAction = false;
          actionBuf = "";
          // Confirm-chips mode: parse without executing, hand the proposal
          // to the UI, and keep the raw block out of the visible text.
          if (opts.onProposeAction) {
            const proposal = parseActionPayload(json);
            if (proposal) {
              handledAction = true;
              try { opts.onProposeAction({ action: proposal.action, params: proposal.params }); } catch { /* UI hook must never break the stream */ }
            }
            // Unparseable payloads: drop silently (same as execution path).
            if (rest) emit(stripActionRemnants(rest));
            return;
          }
          const confirmation = tryExecuteJsonAction(json);
          if (confirmation) {
            handledAction = true;
            let kind = "";
            try { kind = (JSON.parse(json) as { action?: string })?.action || ""; } catch { /* malformed - treated as non-batched */ }
            queueConfirmation(kind, confirmation);
          }
          // Text after the block can itself contain another (possibly
          // truncated) marker - never let raw JSON reach the UI.
          if (rest) emit(stripActionRemnants(rest));
          return;
        }
      }
    }
    // JSON not closed yet - keep buffering.
  };
  try {
    const text = await streamLLM(query, conversationHistory, modelId, opts.signal, (delta) => {
      handleVisible(delta);
    }, opts, agentContext);
    // Flush any held-back visible text at stream end.
    if (pending) handleVisible(pending);

    // Marker started but never closed - the action never completed.
    const truncatedAction = sawMarker && !handledAction;
    inAction = false;
    actionBuf = "";
    if (pending) emit(pending);
    pending = "";
    flushBatch();
    // Already executed + filtered in the stream - return the clean text.
    if (handledAction) return actionText;

    // ---- Rescue pass: announce-without-act ----
    // Small models sometimes announce actions ("Let me create the tasks:")
    // and then stop without emitting the ORLEIA_ACTION lines. Detect the
    // dangling announcement and force one continuation call whose only job
    // is to emit the action lines, then execute them for real.
    const fullText = text ?? "";
    if (!sawMarker && fullText.trim()) {
      const tail = fullText.slice(-200);
      const announcedIntent = /\b(?:let me|i'll|i will|allow me)\b/i.test(tail) || /:\s*$/.test(fullText.trimEnd());
      const actionVerb = /\b(?:create|add|make|set up|schedule|log|complete|delete|remove)\b/i.test(tail);
      if (announcedIntent && actionVerb) {
        const proceedQ =
          "PROCEED NOW: emit the ORLEIA_ACTION line(s) for exactly the actions you announced. " +
          "Output ONLY the ORLEIA_ACTION line(s) - no prose, no markdown, no confirmation.";
        const cont = await streamLLM(
          proceedQ,
          [
            ...conversationHistory,
            { id: "rescue-u", role: "user", content: query, timestamp: new Date().toISOString() },
            { id: "rescue-a", role: "assistant", content: fullText, timestamp: new Date().toISOString() },
          ],
          modelId,
          opts.signal,
          () => {},
          opts
        );
        if (cont && /ORLEIA_ACTION/i.test(cont)) {
          const processedCont = processActionReply(cont);
          const handledCont = processedCont
            ? processedCont
            : tryExecuteJsonAction(cont) || stripActionRemnants(cont);
          if (handledCont && handledCont.trim()) {
            const out = fullText.trim() + "\n\n" + handledCont.trim();
            opts.onToken("\n\n" + handledCont.trim());
            return out;
          }
        }
      }
    }
    // The action never completed: always tell the user honestly, even when
    // the model wrote prose before the marker (never a silent "Sure!" lie).
    if (truncatedAction) {
      const note = "I couldn't finish setting that up. Mind asking me again?";
      if (actionText.trim()) {
        actionText += "\n\n" + note;
        opts.onToken("\n\n" + note);
      } else {
        opts.onToken(note);
        actionText = note;
      }
      return actionText;
    }
    if (text) {
      // Safety net: strip any stray think tags before processing/returning.
      const t = text.replace(/<\/?think>/gi, "").trim();
      // Safety net for an action that arrived whole and was not intercepted:
      // execute it for real, never show raw JSON.
      const processed = processActionReply(t);
      if (processed) return processed;
      const handled = tryExecuteJsonAction(t);
      if (handled) {
        opts.onToken(handled);
        return handled;
      }
      // Final net: never let a raw/truncated ORLEIA_ACTION line reach the UI.
      const cleaned = stripActionRemnants(t);
      if (cleaned) return cleaned;
      return t;
    }
    // If streamLLM returned null (all fallbacks failed) and nothing was emitted,
    // fall through to the local engine below.
    if (!actionText.trim()) throw new Error("stream_null");
    return actionText;
  } catch (e) {
    flushBatch();
    // Cap errors propagate to the UI's friendly upgrade message. Everything
    // else genuinely falls back to the local engine.
    if (e instanceof NoorCapError) throw e;
    // Local model failed (Ollama down / model missing): say so plainly
    // instead of dropping to the cloud offline robot.
    if (isLocalModel(modelId)) {
      const msg = `**${localModelById(modelId)?.name || "Local AI"} couldn't answer.** Is Ollama running? ${ollamaSetupHint()}`;
      opts.onToken(msg);
      return msg;
    }
    /* fall through to the local engine */
  }

  // The round was cancelled - don't waste a full LLM request on a reply
  // the user no longer wants.
  if (opts.signal?.aborted) return "";

  // Offline-safe local engine fallback - emit the whole reply at once.
  const fallback = await chat(query, conversationHistory, modelId, opts);
  opts.onToken(fallback);
  return fallback;
}
