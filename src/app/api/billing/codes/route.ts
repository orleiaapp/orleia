import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { guardApi } from "@/lib/apiGuard";
import { createRedeemCode, CODE_TIERS, type CodeTier } from "@/lib/billing-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/billing/codes  { tier, durationDays, count?, note? }
 * Header: x-orleia-grant-key: <ORLEIA_GRANT_KEY>
 *
 * Owner-only minting of one-time redeem codes (e.g. one for a phone, one
 * for an iPad). No grant key configured server-side => endpoint disabled
 * (404, same body as a wrong key — don't leak which).
 */
export async function POST(req: Request) {
  const denied = guardApi(req, { perMinute: 6, perDay: 60 });
  if (denied) return denied;

  const expected = process.env.ORLEIA_GRANT_KEY || "";
  if (!expected) return NextResponse.json({ error: "not found" }, { status: 404 });
  const provided = req.headers.get("x-orleia-grant-key") || "";
  // Constant-time compare, but also reject wrong lengths outright.
  if (provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: { tier?: string; durationDays?: number; count?: number; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const tier = String(body.tier || "") as CodeTier;
  if (!CODE_TIERS.includes(tier)) {
    return NextResponse.json({ error: "tier must be plus, pro, or ultra" }, { status: 400 });
  }
  const durationDays = Math.floor(Number(body.durationDays));
  if (!Number.isFinite(durationDays) || durationDays < 1 || durationDays > 730) {
    return NextResponse.json({ error: "durationDays must be 1..730" }, { status: 400 });
  }
  const count = Math.min(10, Math.max(1, Math.floor(Number(body.count) || 1)));
  const note = typeof body.note === "string" ? body.note.slice(0, 80) : undefined;

  try {
    const codes = [];
    for (let i = 0; i < count; i++) {
      codes.push(await createRedeemCode({ tier, durationDays, note }));
    }
    return NextResponse.json(
      {
        ok: true,
        codes: codes.map((c) => ({ code: c.code, tier: c.tier, durationDays: c.durationDays, note: c.note })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[codes] mint failed:", err);
    return NextResponse.json({ error: "Could not mint codes." }, { status: 502 });
  }
}
