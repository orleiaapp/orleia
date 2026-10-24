// ============================================================
// /api/ximagine — the AI endpoint behind the Ximagine beta.
// Same defense posture as /api/chat: Origin allowlist + backstop
// rate limits (guardApi), server-side model choice and server-side
// system prompt (clients cannot inject a custom one), payload caps,
// per-device daily credits, crisis guard. The NVIDIA key never
// leaves the server.
// ============================================================

import { NextResponse } from "next/server";
import { guardApi, bodyTooLarge, capInt } from "@/lib/apiGuard";
import { callChat } from "@/lib/ai-provider";
import { MENTAL_HEALTH_SYSTEM_NOTE } from "@/lib/safety-guard";
import { getUsage, incrUsage } from "@/lib/billing-store";
import { themeById, utcDay, XIMAGINE_DAILY_CREDITS, X_THEMES, type XFile, type XMode, type XThemeId } from "@/lib/ximagine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Speed-first pick (user request: "a lot faster"). lightning-30b has no
// forced reasoning phase and generates at a much higher token rate than
// the ultra-550b + thinking combo this shipped with, so both time-to-first
// token and full 6000-token builds drop sharply. enable_thinking:false is
// passed explicitly; thinkingFor() in callChat still re-forces it ON when
// a fallback hop lands on ultra-550b (forced-off stalls that endpoint) and
// keeps it OFF for super-120b. The FALLBACKS cycle (super -> ultra) is
// walked automatically if lightning is unhealthy.
const XIMAGINE_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
const BUILD_MAX_TOKENS = 6000;
const PLAN_MAX_TOKENS = 1500;

const MAX_MESSAGES = 60;
const MAX_MSG_CHARS = 20_000;
const MAX_HISTORY_CHARS = 240_000;
const MAX_FILES = 12;
const MAX_FILES_CHARS = 400_000;

function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

function usageHeaders(used: number, limit: number): Record<string, string> {
  return {
    "x-ximagine-usage": `${used},${limit}`,
    "x-ximagine-credit-limit": String(limit),
    "x-vercel-edge": "no-cache",
  };
}

function isMode(v: unknown): v is XMode {
  return v === "plan" || v === "build";
}

function isTheme(v: unknown): v is XThemeId {
  return typeof v === "string" && X_THEMES.some((t) => t.id === v);
}

// ------------------------------------------------------------
// System prompt — server-side, non-negotiable. The client picks
// only mode + theme from closed sets; it cannot inject instructions.
// ------------------------------------------------------------

function systemPrompt(mode: XMode, themeId: XThemeId): string {
  const theme = themeById(themeId);
  return `You are Noor, the AI inside Ximagine — an experimental app-builder beta by the Orleia project (an independent, non-profit toolmaker; not affiliated with any other company of a similar name). Ximagine turns one plain-language idea into a small personal web app that runs ONLY on the user's own computer, inside a sandboxed preview frame. There is no account, no hosting, no publishing: you write code, the device runs it.

The user is usually not a developer. Speak plainly, be concise, and be honest about uncertainty.

You operate in MODE: ${mode.toUpperCase()}.

=== PLAN MODE ===
- You never write code in plan mode. No file blocks, ever.
- If the idea is underspecified, ask at most 3 clarifying questions, formatted EXACTLY like this (this layout is machine-parsed):

Q: <one short question>
- <a complete, ready-to-send answer>
- <another complete answer>
- Use your best judgment

Rules for the format: each Q: block stands alone; 2-4 options per question; every option is a full answer the user can send with one click; the final option of the last question may be "Use your best judgment". Questions on separate lines, no numbering, no other text inside a Q: block.
- When the idea is already clear, ask zero questions and go straight to the plan.
- After questions (or instead of them), give a short plan: what the app is, its main features (max 5), what it stores locally, and the design theme it will use. End by telling the user they can reply with answers or refinements, or say "build it" to start building.

=== BUILD MODE ===
- The user wants the app built (or changed). Output format — STRICT:
  1. First line: one or two short sentences about what you built or changed.
  2. Then each file as a fenced code block whose info string is EXACTLY \`file: <path>\`, e.g. the block opens with three backticks followed immediately by file: index.html on the same line, then the full file content, then three backticks to close. (The word "file:" and a space, then the path. No other text in the info line.)
  3. Emit ONLY the files that exist or changed in this turn — do not re-output unchanged files. Never repeat a file twice.
  4. No commentary between file blocks.
  - If the request is impossible or violates the rules below, refuse in prose without any file blocks, and suggest a legitimate alternative.

=== THE APPS YOU BUILD ===
- Exactly three files: index.html (semantic markup, links styles.css and app.js), styles.css, app.js. No build step, no dependencies, self-contained.
- STRICTLY OFFLINE: no external URLs of any kind — no CDNs, no external fonts, no remote images, no fetch/XHR/WebSocket to anywhere. Use emoji, inline SVG, or pure CSS for visuals. Use system font stacks (e.g. system-ui, Georgia for serif flavor). Everything must work with the network unplugged.
- NO eval(), no new Function(), no dynamic code loading — the preview's Content Security Policy blocks them.
- localStorage is available and persists with the app on this device — use it for the app's own state (wrap first-run seeding in try/catch so a blocked-storage environment degrades to in-memory).
- The generated app runs in a sandbox with no network and no access to the page around it: it cannot call APIs, authenticate anyone, or talk to other apps. Design accordingly.
- Never design login screens, payments, subscriptions, "upgrade" upsells, analytics, or anything that pretends to send data anywhere. This is a personal tool for one person.
- Small and tight: a personal tool, not a SaaS. Target under ~500 lines total. Real interaction states (empty states, small confirmations), keyboard reachable buttons and labels, readable contrast, works down to ~360px wide.
- Design language (Orleia): generous spacing, rounded corners (~12px), thin subtle borders, small UPPERCASE letter-spaced micro-labels, one accent color, restrained micro-transitions (150-250ms). Tasteful and calm; no gradients-on-gradients, no bloat.
- Design theme for this app: ${theme.name} — ${theme.hint}. Follow it exactly for colors, mood, and light/dark choice.

=== WHAT YOU NEVER BUILD ===
Malware of any kind (ransomware, spyware, keyloggers, credential stealers, botnets, cryptominers); phishing or fraud tools; anything that infringes copyright, trademark or privacy; DRM or access-control circumvention you do not own; scrapers or automation that violate a site's terms of service; harassment, stalking or impersonation tools; anything sexual involving minors; anything whose purpose is to harm people or systems. If asked, refuse briefly and offer a legitimate alternative framing.

If the request is harmless but vague, prefer the small, honest version of it.

=== TONE ===
Warm-dry, like Orleia. No marketing speak, no exclamation spam, at most one or two emoji in a whole reply if they genuinely earn their place. Reply in the language the user writes in.

${MENTAL_HEALTH_SYSTEM_NOTE}`;
}

// ------------------------------------------------------------

export async function POST(req: Request) {
  const denied = guardApi(req, { perMinute: 24, perDay: 300 });
  if (denied) return denied;
  if (bodyTooLarge(req, 900_000)) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: {
    messages?: unknown;
    mode?: unknown;
    theme?: unknown;
    files?: unknown;
    stream?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mode: XMode = isMode(body?.mode) ? body.mode : "plan";
  const theme: XThemeId = isTheme(body?.theme) ? body.theme : "noir";

  // --- sanitize message history ---
  const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
  const messages: { role: string; content: string }[] = [];
  let historyChars = 0;
  for (const m of rawMessages.slice(-MAX_MESSAGES)) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") continue;
    const content = m.content.replace(/\u0000/g, "").trim();
    if (!content) continue;
    historyChars += content.length;
    if (historyChars > MAX_HISTORY_CHARS) break;
    messages.push({ role: m.role, content: content.slice(0, MAX_MSG_CHARS) });
  }
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "No user message" }, { status: 400 });
  }

  // --- current app files (build mode, when the client sent them) ---
  let filesContext = "";
  if (mode === "build" && Array.isArray(body?.files)) {
    const files: XFile[] = [];
    let chars = 0;
    for (const f of body.files.slice(0, MAX_FILES)) {
      if (!f || typeof f.path !== "string" || typeof f.content !== "string") continue;
      chars += f.content.length;
      if (chars > MAX_FILES_CHARS) break;
      files.push({ path: f.path.slice(0, 200), content: f.content });
    }
    if (files.length) {
      filesContext =
        "\n\nThe app's CURRENT files on the user's device are below. Treat them as the source of truth to modify; do not repeat files you are not changing:\n" +
        files.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n\n");
    }
  }

  // --- credits (server-side, per device, UTC day; fail-open like /api/chat) ---
  const deviceHeader = req.headers.get("x-orleia-device") || "";
  const device = /^[0-9a-zA-Z-]{8,64}$/.test(deviceHeader) ? deviceHeader : "anon";
  const today = utcDay();
  let used = -1;
  try {
    used = await incrUsage(`ximagine:${device}`, today);
  } catch {
    /* storage hiccup — fail open, same posture as /api/chat */
  }
  if (used > XIMAGINE_DAILY_CREDITS) {
    return NextResponse.json(
      { error: "ximagine_credit_cap", used, limit: XIMAGINE_DAILY_CREDITS },
      { status: 402, headers: usageHeaders(used, XIMAGINE_DAILY_CREDITS) }
    );
  }

  // --- the call ---
  const stream = body?.stream !== false;

  const upstream = await callChat({
    model: XIMAGINE_MODEL,
    messages: [
      { role: "system", content: systemPrompt(mode, theme) },
      ...(filesContext ? [{ role: "system", content: filesContext.trim() }] : []),
      ...messages,
    ],
    temperature: mode === "build" ? 0.35 : 0.7,
    max_tokens: mode === "build" ? BUILD_MAX_TOKENS : PLAN_MAX_TOKENS,
    chat_template_kwargs: { enable_thinking: false },
    stream,
    timeoutMs: 45_000,
  });

  if (!upstream.ok || !upstream.response) {
    console.error(`[ximagine] upstream ${upstream.status}:`, upstream.error || "");
    return NextResponse.json(
      { error: "AI is unavailable right now", upstreamStatus: upstream.status },
      { status: upstream.status >= 400 && upstream.status < 600 ? 502 : 500 }
    );
  }

  const headers = {
    ...usageHeaders(Math.max(used, 0), XIMAGINE_DAILY_CREDITS),
    ...(upstream.usedModel && upstream.usedModel !== XIMAGINE_MODEL
      ? { "x-vercel-ai-model": upstream.usedModel }
      : {}),
  };

  if (!stream) {
    const text = await upstream.response.text();
    return new Response(text, {
      status: 200,
      headers: { "Content-Type": "application/json", ...headers },
    });
  }

  return new Response(upstream.response.body, { status: 200, headers: { ...sseHeaders(), ...headers } });
}
