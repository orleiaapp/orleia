// ============================================================
// AI provider layer — health tracking + model fallback.
//
// One dead NVIDIA model took down 100% of Orleia's AI (Noor,
// research, vision, Spark) for hours with no warning. This layer
// makes that class of outage survivable:
//
//   - callChat(): try the primary model; on auth/quotas/5xx/404s,
//     transparently retry once on a fallback sibling model.
//   - Health tracking: consecutive failures mark a model unhealthy
//     for a cool-off window; unhealthy primaries are skipped so
//     users don't pay the latency of a doomed request.
//   - aiProviderHealth(): used by /api/ai-health for monitoring.
//
// Non-goals: no user-visible behavior change when everything is
// healthy; no cross-provider routing yet (single key by design).
// ============================================================

type ProviderConfig = { key: string | undefined; base: string };

function provider(): ProviderConfig {
  return { key: process.env.NVIDIA_API_KEY, base: "https://integrate.api.nvidia.com/v1" };
}

// Sibling fallbacks — same family, near-identical quality, different model.
// If the primary is EOL'd/403'd, the sibling keeps the product alive.
// (nvidia/nemotron-3-super-120b-a12b hit end-of-life on 2026-10-03; probes
// on 2026-10-04 were 8/8 HTTP 200 — flapping, so treat it as expendable.)
// This map is a CYCLE (super → ultra → lightning → super), so the walk in
// callChat (max 4 hops, seen-set) reaches ALL THREE models from any start
// node — a request can never dead-end behind one dead endpoint.
const FALLBACKS: Record<string, string> = {
  "nvidia/nemotron-3-super-120b-a12b": "nvidia/nemotron-3-ultra-550b-a55b",
  "nvidia/nemotron-3-ultra-550b-a55b": "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-3.5-lightning-30b-a3b": "nvidia/nemotron-3-super-120b-a12b",
  // Coder candidates (CODER_MODEL_PRIMARY). Today this key gets 403 on them
  // until the endpoints are activated on build.nvidia.com — the walk then
  // lands on the live Novella sibling instead of dead-ending.
  "moonshotai/kimi-k2.6": "nvidia/nemotron-3-ultra-550b-a55b",
  "moonshotai/kimi-k3": "nvidia/nemotron-3-ultra-550b-a55b",
  "z-ai/glm-5.3": "nvidia/nemotron-3-ultra-550b-a55b",
};

// Per-model thinking mode, measured live against the endpoint:
// - super-120b only ever answers with thinking OFF (think-ON returns
//   reasoning_content only),
// - ultra-550b answers fast WITH thinking ON and stalls/errs when it is
//   forced OFF,
// - lightning-30b keeps whatever the caller asked for.
// Applied on every fallback hop so a sibling model is never sent the
// primary's thinking flag - that mismatch caused 55s stalls -> 502s.
const THINKING: Record<string, boolean> = {
  "nvidia/nemotron-3-super-120b-a12b": false,
  "nvidia/nemotron-3-ultra-550b-a55b": true,
};

function thinkingFor(model: string, caller?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!(model in THINKING)) return caller;
  return { ...(caller || {}), enable_thinking: THINKING[model] };
}

const COOL_OFF_MS = 3 * 60 * 1000; // unhealthy window
const failures = new Map<string, { until: number; count: number }>();

function isUnhealthy(model: string): boolean {
  const f = failures.get(model);
  return !!f && f.until > Date.now();
}
function markFailure(model: string) {
  const f = failures.get(model) || { until: 0, count: 0 };
  f.count += 1;
  // 2 consecutive failures trips the cool-off; any success resets.
  if (f.count >= 2) f.until = Date.now() + COOL_OFF_MS;
  failures.set(model, f);
}
function markSuccess(model: string) {
  failures.delete(model);
}

/** Statuses that mean "retrying could plausibly work" — auth, quota, EOL, provider errors. */
function retryable(status: number): boolean {
  return status === 401 || status === 403 || status === 404 || status === 410 || status === 408 || status === 429 || status >= 500;
}

export type ChatCallOptions = {
  model: string;
  messages: unknown;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  top_p?: number;
  chat_template_kwargs?: Record<string, unknown>;
  /** Milliseconds for the whole attempt (default 55s). */
  timeoutMs?: number;
};

export type ChatCallResult = {
  ok: boolean;
  status: number;
  response?: Response;
  /** The model that actually answered (differs from requested after fallback). */
  usedModel?: string;
  fellBack?: boolean;
  error?: string;
};

/**
 * One chat-completion call with transparent model fallback.
 * Returns the raw upstream Response on success (caller streams or parses it).
 */
export async function callChat(opts: ChatCallOptions): Promise<ChatCallResult> {
  const { key, base } = provider();
  if (!key) return { ok: false, status: 500, error: "AI is not configured." };

  // Walk the fallback CHAIN (primary -> sibling -> its sibling), not just
  // one hop: when the primary is retired AND the sibling is overloaded the
  // third live model still answers instead of 502ing the user.
  const candidates: string[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined = opts.model;
  for (let hop = 0; cursor && hop < 4 && !seen.has(cursor); hop++) {
    seen.add(cursor);
    candidates.push(cursor);
    cursor = FALLBACKS[cursor];
  }

  // Skip models known to be down (but never skip the last candidate).
  const ordered = candidates.filter((m, i) => i === candidates.length - 1 || !isUnhealthy(m));

  let last: ChatCallResult = { ok: false, status: 0, error: "unreachable" };
  for (let i = 0; i < ordered.length; i++) {
    const model = ordered[i];
    const res = await attempt(
      { ...opts, model, chat_template_kwargs: thinkingFor(model, opts.chat_template_kwargs) },
      key,
      base
    );
    if (res.ok) {
      markSuccess(model);
      return { ...res, usedModel: model, fellBack: model !== opts.model };
    }
    markFailure(model);
    last = res;
    // Retry only on plausibly-transient/auth failures and only if a fallback exists.
    if (!retryable(res.status) || i === ordered.length - 1) break;
  }
  return last;
}

async function attempt(opts: ChatCallOptions, key: string, base: string): Promise<ChatCallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 55_000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: opts.stream ? "text/event-stream" : "application/json" },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts.top_p !== undefined ? { top_p: opts.top_p } : {}),
        ...(opts.max_tokens !== undefined ? { max_tokens: opts.max_tokens } : {}),
        ...(opts.stream !== undefined ? { stream: opts.stream } : {}),
        ...(opts.chat_template_kwargs ? { chat_template_kwargs: opts.chat_template_kwargs } : {}),
      }),
    });
    if (res.ok) return { ok: true, status: res.status, response: res };
    const detail = await res.text().catch(() => "");
    console.error(`[ai-provider] ${opts.model} -> ${res.status}`, detail.slice(0, 200));
    return { ok: false, status: res.status, error: detail.slice(0, 300) };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    console.error(`[ai-provider] ${opts.model} network failure:`, err instanceof Error ? err.message : err);
    return { ok: false, status: aborted ? 504 : 502, error: aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

/** Live health snapshot for /api/ai-health. */
export function aiProviderHealth() {
  const now = Date.now();
  const models: Record<string, string> = {};
  for (const [m, f] of failures) {
    models[m] = f.until > now ? `unhealthy for ${Math.ceil((f.until - now) / 1000)}s (${f.count} fails)` : "recovering";
  }
  return {
    provider: "nvidia",
    configured: !!process.env.NVIDIA_API_KEY,
    models,
    primaryFallbacks: FALLBACKS,
  };
}
