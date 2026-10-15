import { NextResponse } from "next/server";
import { guardApi } from "@/lib/apiGuard";
import { billingConfigured } from "@/lib/plans";
import { redeemRedeemCode } from "@/lib/billing-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/billing/redeem  { code, deviceId }
 *
 * Burns a one-time code (minted via POST /api/billing/codes) and writes a
 * granted license for this device: chosen tier, periodEnd = now + the code's
 * duration. Codes are single-use across all devices — the store claims them
 * atomically, so two devices racing the same code can't both win.
 */
export async function POST(req: Request) {
  const denied = guardApi(req, { perMinute: 6, perDay: 40 });
  if (denied) return denied;

  if (!billingConfigured()) {
    return NextResponse.json({ error: "Billing is launching soon." }, { status: 503 });
  }

  let body: { code?: string; deviceId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const code = String(body.code || "").trim();
  const deviceId = String(body.deviceId || "").slice(0, 64);
  if (!deviceId) return NextResponse.json({ error: "missing deviceId" }, { status: 400 });
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });

  const result = await redeemRedeemCode(code, deviceId);
  if (!result.ok) {
    if (result.reason === "used") {
      return NextResponse.json({ error: "This code has already been used." }, { status: 409 });
    }
    if (result.reason === "invalid") {
      return NextResponse.json({ error: "This code is not valid." }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not reach the licensing service. Try again." }, { status: 502 });
  }

  return NextResponse.json(
    {
      ok: true,
      tier: result.license.tier,
      periodEnd: result.license.periodEnd,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
