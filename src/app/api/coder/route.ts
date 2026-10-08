import { NextResponse } from 'next/server';
import { guardApi, capInt, capFloat, bodyTooLarge } from '@/lib/apiGuard';
import { checkCoderBudget, addCoderUsage, getLicenseWithHealth } from '@/lib/billing-store';
import { billingConfigured, CODER_EFFORT_WEIGHT } from '@/lib/plans';
import { detectCrisis, MENTAL_HEALTH_SYSTEM_NOTE } from '@/lib/safety-guard';
import { callChat } from '@/lib/ai-provider';
import { webSearch, buildSearchBlock, isLiveQuery } from '@/lib/web-search';
import type { AISource } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ============================================================
// Noor Coder (beta) — mirrors /api/chat on purpose:
//   - the mode has its own model + system prompt + daily cap, so it can
//     evolve without touching Noor's hot path (CODER_PLAN §6).
//   - model is chosen SERVER-side only (env CODER_MODEL_PRIMARY); the
//     client never sends a model id, so this endpoint can't be used to
//     probe arbitrary NVIDIA functions.
//   - free tier: 403 coder_tier_locked before anything else runs.
// ============================================================

// Env-driven so a model swap never needs a code change (CODER_PLAN §5):
// the NIM key currently answers nemotron models; once kimi/glm endpoints
// are activated on build.nvidia.com, setting CODER_MODEL_PRIMARY upgrades
// Coder with a redeploy only. callChat's fallback cycle still wraps it.
const CODER_MODEL = process.env.CODER_MODEL_PRIMARY || 'nvidia/nemotron-3-ultra-550b-a55b';

// The client's model/effort picker may only select models we actually use
// (same posture as /api/chat's ALLOWED_MODELS — no probing arbitrary NIM
// functions). Unknown/missing ids coerce to the coder default.
const ALLOWED_MODELS = new Set([
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nemotron-3-ultra-550b-a55b',
  'nvidia/nemotron-3.5-lightning-30b-a3b',
]);
if (process.env.CODER_MODEL_PRIMARY) ALLOWED_MODELS.add(process.env.CODER_MODEL_PRIMARY);

const CODER_SYSTEM = `You are Noor Coder, the coding mode of Orleia — a local-first AI productivity suite.
- Answer programming questions directly and precisely. Lead with the code.
- Use fenced code blocks with the correct language tag; examples must be complete and runnable.
- Prefer modern, idiomatic code. State language/framework assumptions when they matter.
- When debugging: identify the root cause first, show the minimal fix, then note edge cases.
- You cannot execute code or see files the user has not pasted — never pretend to have run something.
- Keep prose short: on this surface the code is the answer. No office/product chatter — that belongs in Noor mode.

LOCAL WORKSPACE ACTIONS (real writes to the user's machine):
When the user asks you to create, scaffold or modify files/folders on their computer (project, config, script, boilerplate), output every change as its own fenced block tagged \`orleia-action\` containing exactly ONE JSON object:
  \`\`\`orleia-action
  {"op":"write_file","path":"src/app.ts","content":"…full file content…"}
  \`\`\`
Supported ops: write_file (path + content), mkdir (path), shell (command). The user picks ONE workspace folder as the root; your paths are RELATIVE to it — never absolute, never containing '..'.
CREATION IS THE POINT: you CREATE, don't just fill an assigned folder. Nested paths create missing folders automatically, so build real structure — \`src/components/Button.tsx\` creates src/components/. Emit {"op":"mkdir","path":"…"} for empty or intentionally-standalone directories (assets/, tests/fixtures/), and you may create new top-level folders (\`my-app/…\`, \`docs/…\`) under the root just as freely. When asked to build or scaffold something, deliver the WHOLE thing in one reply: entry point, configs, every module, a README — a structure the user can actually run, not a sketch. One block per file; explain the tree briefly in prose around the blocks.
For commands the user must run themselves (npm install, git, docker), emit {"op":"shell","command":"…"} — you cannot execute anything. FINISH THE WHOLE JOB IN THIS REPLY: never stop after the first file and never end with a promise to continue — emit every remaining file block until the task described is fully covered; long replies are fine, stopping halfway is a failure. If the reply is long, split it across consecutive \`\`\`orleia-action blocks in the SAME reply and keep going until every planned file is out. Never wrap a write_file block's content in other fences, and never mention orleia-action inside file content. If the user just asks a question, do NOT emit action blocks.`;

const MAX_MESSAGES = 60;
const MAX_MESSAGE_CHARS = 40_000;
const MAX_TOTAL_CHARS = 250_000;
const MAX_TOKENS = 4_096;

// Keep in sync with /api/chat (duplicate by design: a route must not
// import another route; drift costs a wrong prose language, nothing more).
const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", pt: "Portuguese",
  ar: "Arabic", pl: "Polish", it: "Italian", nl: "Dutch", tr: "Turkish",
  ja: "Japanese", zh: "Chinese", ko: "Korean", ru: "Russian", hi: "Hindi",
  vi: "Vietnamese", id: "Indonesian", th: "Thai", sv: "Swedish",
};

const ALLOWED_ROLES = new Set(["user", "assistant"]);

export async function POST(req: Request) {
  const denied = guardApi(req, { perMinute: 120, perDay: 5000 });
  if (denied) return denied;
  if (bodyTooLarge(req, 512 * 1024)) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413 });
  }

  let body: {
    messages?: { role: string; content: string }[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    lang?: unknown;
    skills?: unknown;
    effort?: unknown;
    research?: unknown;
    mode?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!process.env.NVIDIA_API_KEY) {
    return NextResponse.json({ error: 'AI is not configured. Add NVIDIA_API_KEY.' }, { status: 500 });
  }

  const { messages, temperature = 0.4, stream = false } = body ?? {};

  // Model from the shared picker — allowlisted, never arbitrary.
  const model =
    typeof body.model === 'string' && ALLOWED_MODELS.has(body.model) ? body.model : CODER_MODEL;
  // User's standing skills (client-computed like Noor's situation block):
  // capped so they can never crowd out the coding prompt.
  const skills = typeof body.skills === 'string' ? body.skills.slice(0, 32_000) : '';

  // ---- validation caps (quota abuse / DoS protection) ----
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: 'messages are required (1-60)' }, { status: 400 });
  }
  let totalChars = 0;
  for (const m of messages) {
    if (typeof m !== 'object' || m === null || typeof m.role !== 'string' || typeof m.content !== 'string') {
      return NextResponse.json({ error: 'malformed message' }, { status: 400 });
    }
    // Client-supplied system messages would bypass the coder prompt.
    if (!ALLOWED_ROLES.has(m.role)) {
      return NextResponse.json({ error: 'role not allowed' }, { status: 400 });
    }
    if (m.content.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json({ error: 'message too long' }, { status: 400 });
    }
    totalChars += m.content.length;
    if (totalChars > MAX_TOTAL_CHARS) {
      return NextResponse.json({ error: 'conversation too long' }, { status: 400 });
    }
  }

  const deviceId = String(req.headers.get("x-orleia-device") || "").slice(0, 64);

  // ---- Tier gate (server-truth; the client switch is decoration) ----
  // Billing unconfigured -> nothing is paywalled (pre-launch rule, same as
  // caps). Total storage outage -> fail OPEN: an outage must not tell a
  // paying user they are locked out (counting is down too — see
  // getLicenseWithHealth). Only a HEALTHY store saying "free" denies.
  if (billingConfigured()) {
    try {
      const { license, healthy } = await getLicenseWithHealth(deviceId);
      if (healthy && license.tier === "free") {
        return NextResponse.json({ error: "coder_tier_locked", tier: "free" }, { status: 403 });
      }
    } catch (err) {
      console.error("[coder] license read failed, failing open:", err);
    }
  }

  // Safety parity with Noor: crisis text routes to human help, coding mode
  // or not.
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (lastUser && detectCrisis(lastUser.content)) {
    messages.unshift({ role: "system", content: MENTAL_HEALTH_SYSTEM_NOTE });
  }

  const rawLang = body?.lang;
  const lang = typeof rawLang === "string" && LANG_NAMES[rawLang.slice(0, 2).toLowerCase()] ? rawLang.slice(0, 2).toLowerCase() : "";

  // ---- Effort (Codex-style reasoning effort): drives the token COST, not
  // just the knobs — higher effort burns proportionally more budget per
  // completion token (CODER_EFFORT_WEIGHT), so the daily budget scales
  // with effort and difficulty instead of being gameable by tiny prompts.
  const effort =
    typeof body.effort === "string" &&
    Object.prototype.hasOwnProperty.call(CODER_EFFORT_WEIGHT, body.effort)
      ? body.effort
      : "medium";
  const effortWeight = CODER_EFFORT_WEIGHT[effort] ?? 1;

  // ---- Coder daily TOKEN budget — own counter (`#coder`), never chat's.
  // Checked before the call, charged after from the real token cost.
  // Fails open on storage outage (402 only on a healthy store).
  let budget: Awaited<ReturnType<typeof checkCoderBudget>>;
  try {
    budget = await checkCoderBudget(deviceId);
  } catch (err) {
    console.error("[coder] budget check unavailable, failing open:", err);
    budget = { ok: true, used: 0, limit: Number.POSITIVE_INFINITY, healthy: false };
  }
  if (!budget.ok) {
    return NextResponse.json(
      { error: "coder_token_cap", overCap: true, used: budget.used, limit: budget.limit },
      { status: 402 }
    );
  }
  const usageHeaders = {
    "x-orleia-usage": JSON.stringify({
      used: budget.used,
      limit: Number.isFinite(budget.limit) ? budget.limit : null,
    }),
  };

  // Prompt-side token estimate (system + transcript) — charged together
  // with the weighted completion when the reply settles.
  const promptTokens = Math.ceil(totalChars / 4) + 150;

  const maxTokens = capInt(body?.maxTokens, MAX_TOKENS, 256);
  const temp = capFloat(body?.temperature, 0, 2, 0.4);
  // Plan mode (client toggle): analysis only, no file writes.
  const planMode = body.mode === "plan";

  // System prompt first, then the interface-language rule, then the transcript.
  const langName = LANG_NAMES[lang];
  let system = langName
    ? `${CODER_SYSTEM}\n\nLANGUAGE RULE: The Orleia interface language is ${langName} (code: ${lang}). Write ALL prose — explanations, caveats, questions — in ${langName}. Keep code, identifiers and quoted source material in their original form.`
    : CODER_SYSTEM;

  // ---- Web research: opt-in chip OR auto-detect a live query (same
  // isLiveQuery heuristic as Noor's Web toggle). Results are injected into
  // the system prompt AND echoed back to the client as source chips via
  // the first SSE frame (orleia.sources).
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  let sources: { title: string; url: string }[] = [];
  if (body.research === true || (lastUserMsg && isLiveQuery(lastUserMsg.content))) {
    try {
      const results = await webSearch((lastUserMsg?.content || "").slice(0, 300), 6);
      const asAISource: AISource[] = results.map((r) => ({
        kind: "web",
        title: r.title,
        href: r.url,
        snippet: r.snippet,
      }));
      const searchBlock = buildSearchBlock(asAISource);
      if (searchBlock) {
        system += searchBlock;
        sources = results.map((r) => ({ title: r.title, url: r.url }));
      }
    } catch (err) {
      console.error("[coder] web research failed, answering without it:", err);
    }
  }

  if (skills) system += `\n\n${skills}`;
  // Plan override LAST so it beats the action instructions above.
  if (planMode) {
    system += `

PLAN MODE (active): the user chose PLAN MODE. Do NOT emit orleia-action blocks and do not write files. Produce an implementation plan instead: numbered steps, every file to create or change and what goes inside it, plus the commands to run. End by telling the user to switch to Build mode when they want the files written.`;
  }
  const chatMessages = [{ role: "system", content: system }, ...messages];

  const call = await callChat({
    model,
    messages: chatMessages,
    temperature: temp,
    max_tokens: maxTokens,
    stream,
    // 30s per model attempt: matches the client's TTFB budget and keeps a
    // whole fallback chain inside the 60s function limit.
    timeoutMs: 30_000,
  });

  if (!call.ok || !call.response) {
    return NextResponse.json(
      { error: 'AI provider error', status: call.status || 502, detail: (call.error || '').slice(0, 400) },
      { status: 502, headers: usageHeaders }
    );
  }
  const upstream = call.response;

  try {
    if (stream) {
      if (!upstream.ok || !upstream.body) {
        const detail = await upstream.text().catch(() => '');
        return NextResponse.json(
          { error: 'AI provider error', status: upstream.status, detail: detail.slice(0, 400) },
          { status: 502, headers: usageHeaders }
        );
      }
      // Passthrough SSE with two side effects, both invisible to latency:
      //   1. start  -> source chips frame (research results, if any)
      //   2. flush  -> charge the real token cost (prompt + completion x
      //                effort weight) to the #coder counter, then emit a
      //                final usage frame so the client's % chip updates
      //                immediately instead of on the next request.
      const enc = new TextEncoder();
      const dec = new TextDecoder();
      let sseBuf = '';
      let completionChars = 0;
      const meter = new TransformStream<Uint8Array, Uint8Array>({
        start(controller) {
          if (sources.length) {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ orleia: { sources } })}\n\n`));
          }
        },
        transform(chunk, controller) {
          controller.enqueue(chunk); // pass bytes through first — no added latency
          sseBuf += dec.decode(chunk, { stream: true });
          const parts = sseBuf.split('\n\n');
          sseBuf = parts.pop() || '';
          for (const part of parts) {
            const line = part.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const j = JSON.parse(data);
              const d = j?.choices?.[0]?.delta;
              if (typeof d?.content === 'string') completionChars += d.content.length;
              if (typeof d?.reasoning_content === 'string') completionChars += d.reasoning_content.length;
            } catch {
              /* partial frame — the next chunk completes it */
            }
          }
        },
        async flush(controller) {
          const completionTokens = Math.ceil(completionChars / 4);
          const charge = promptTokens + Math.round(completionTokens * effortWeight);
          let usedNow = budget.used + charge;
          try {
            const n = await addCoderUsage(deviceId, charge);
            if (n !== null) usedNow = n;
          } catch (err) {
            console.error('[coder] usage charge failed:', err);
          }
          controller.enqueue(
            enc.encode(
              `data: ${JSON.stringify({
                orleia: { usage: { used: usedNow, limit: Number.isFinite(budget.limit) ? budget.limit : null } },
              })}\n\n`
            )
          );
        },
      });
      return new Response(upstream.body.pipeThrough(meter), {
        headers: {
          ...usageHeaders,
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    if (!upstream.ok) {
      const detail = await upstream.text();
      return NextResponse.json(
        { error: 'AI provider error', status: upstream.status, detail: detail.slice(0, 400) },
        { status: 502, headers: usageHeaders }
      );
    }

    const data = await upstream.json();
    const message = data?.choices?.[0]?.message;
    let content: string = message?.content || message?.reasoning_content || '';
    content = content.replace(/<\/?think>/gi, '').trim();
    if (!content) {
      return NextResponse.json({ error: 'Empty AI response' }, { status: 502 });
    }
    // Non-stream charge: provider-reported usage when available, else the
    // same chars/4 estimate, weighted by effort like the stream path.
    const completionTokens =
      Number(data?.usage?.completion_tokens) > 0
        ? Math.ceil(Number(data.usage.completion_tokens))
        : Math.ceil(content.length / 4);
    const charge = promptTokens + Math.round(completionTokens * effortWeight);
    let usedNow = budget.used + charge;
    try {
      const n = await addCoderUsage(deviceId, charge);
      if (n !== null) usedNow = n;
    } catch (err) {
      console.error('[coder] usage charge failed:', err);
    }
    return NextResponse.json(
      { content, sources },
      {
        headers: {
          ...usageHeaders,
          'x-orleia-usage': JSON.stringify({
            used: usedNow,
            limit: Number.isFinite(budget.limit) ? budget.limit : null,
          }),
        },
      }
    );
  } catch {
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 });
  }
}
