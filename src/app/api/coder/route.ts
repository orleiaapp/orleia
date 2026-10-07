import { NextResponse } from 'next/server';
import { guardApi, capInt, capFloat, bodyTooLarge } from '@/lib/apiGuard';
import { consumeNoorTurn, getLicenseWithHealth } from '@/lib/billing-store';
import { billingConfigured, CODER_DAILY_LIMIT } from '@/lib/plans';
import { detectCrisis, MENTAL_HEALTH_SYSTEM_NOTE } from '@/lib/safety-guard';
import { callChat } from '@/lib/ai-provider';

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

const CODER_SYSTEM = `You are Noor Coder, the coding mode of Orleia — a local-first AI productivity suite.
- Answer programming questions directly and precisely. Lead with the code.
- Use fenced code blocks with the correct language tag; examples must be complete and runnable.
- Prefer modern, idiomatic code. State language/framework assumptions when they matter.
- When debugging: identify the root cause first, show the minimal fix, then note edge cases.
- You cannot execute code or see files the user has not pasted — never pretend to have run something.
- Keep prose short: on this surface the code is the answer. No office/product chatter — that belongs in Noor mode.`;

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
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    lang?: unknown;
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

  // ---- Coder daily cap — SEPARATE counter from chat (channel "coder").
  // Server-enforced; fails open on storage outage like /api/chat. ----
  let cap: Awaited<ReturnType<typeof consumeNoorTurn>>;
  try {
    cap = await consumeNoorTurn(deviceId, "coder");
  } catch (err) {
    console.error("[coder] usage tracking unavailable, failing open:", err);
    cap = { ok: true, used: 0, limit: CODER_DAILY_LIMIT.free, tier: "free" };
  }
  if (!cap.ok) {
    return NextResponse.json(
      { error: "coder_daily_cap", overCap: true, limit: cap.limit, used: cap.used, tier: cap.tier },
      { status: 402 }
    );
  }
  const usageHeaders = {
    "x-orleia-usage": JSON.stringify({
      used: cap.used,
      limit: Number.isFinite(cap.limit) ? cap.limit : null,
    }),
  };

  const maxTokens = capInt(body?.maxTokens, MAX_TOKENS, 1024);
  const temp = capFloat(body?.temperature, 0, 2, 0.4);

  // System prompt first, then the interface-language rule, then the transcript.
  const langName = LANG_NAMES[lang];
  const system = langName
    ? `${CODER_SYSTEM}\n\nLANGUAGE RULE: The Orleia interface language is ${langName} (code: ${lang}). Write ALL prose — explanations, caveats, questions — in ${langName}. Keep code, identifiers and quoted source material in their original form.`
    : CODER_SYSTEM;
  const chatMessages = [{ role: "system", content: system }, ...messages];

  const call = await callChat({
    model: CODER_MODEL,
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
      return new Response(upstream.body, {
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
    return NextResponse.json({ content }, { headers: usageHeaders });
  } catch {
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 });
  }
}
