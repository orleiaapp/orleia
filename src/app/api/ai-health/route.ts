import { NextResponse } from "next/server";
import { aiProviderHealth } from "@/lib/ai-provider";

export const runtime = "nodejs";
export const maxDuration = 30;

// ============================================================
// /api/ai-health — is Orleia's brain alive?
//
// GET            -> configuration + model health snapshot (no secrets).
// GET?secret=... -> additionally fires a minimal live completion so
//                   a cron (or you) can catch a dead provider BEFORE
//                   users do. Cheap: 8 tokens, only on request.
// ============================================================

export async function GET(req: Request) {
  const health = aiProviderHealth();
  const url = new URL(req.url);
  // Probe armed two ways: ?secret=... for manual runs, or the
  // Authorization: Bearer header Vercel Crons send automatically when
  // CRON_SECRET is set (vercel.json polls /api/ai-health daily).
  const cronSecret = process.env.CRON_SECRET;
  const wantsProbe =
    !!cronSecret &&
    (url.searchParams.get("secret") === cronSecret ||
      req.headers.get("authorization") === `Bearer ${cronSecret}`);

  let probe: { status: "ok" | "failing"; model: string; httpStatus?: number; detail?: string } | null = null;

  if (wantsProbe) {
    if (!health.configured) {
      probe = { status: "failing", model: "-", detail: "NVIDIA_API_KEY missing" };
    } else {
      const { callChat } = await import("@/lib/ai-provider");
      const r = await callChat({
        model: "nvidia/nemotron-3.5-lightning-30b-a3b",
        messages: [{ role: "user", content: "Reply with the single word: OK" }],
        max_tokens: 8,
        temperature: 0,
        timeoutMs: 20_000,
      });
      probe = r.ok
        ? { status: "ok", model: r.usedModel || "-" }
        : { status: "failing", model: "-", httpStatus: r.status, detail: (r.error || "").slice(0, 160) };
    }
  }

  return NextResponse.json(
    { ...health, probe },
    { headers: { "Cache-Control": "no-store" } }
  );
}
