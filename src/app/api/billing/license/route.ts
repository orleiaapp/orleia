import { NextResponse } from "next/server";
import { guardApi } from "@/lib/apiGuard";
import { billingConfigured, NOOR_DAILY_LIMIT, CODER_DAILY_TOKENS } from "@/lib/plans";
import { getLicenseWithHealth, getUsage } from "@/lib/billing-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/billing/license?deviceId=... -> tier + today's Noor usage. */
export async function GET(req: Request) {
  const denied = guardApi(req, { perMinute: 30, perDay: 500 });
  if (denied) return denied;

  const url = new URL(req.url);
  const deviceId = (url.searchParams.get("deviceId") || "").slice(0, 64);
  if (!deviceId) return NextResponse.json({ error: "missing deviceId" }, { status: 400 });

  const { license, healthy: storageHealthy } = billingConfigured()
    ? await getLicenseWithHealth(deviceId)
    : { license: { tier: "free" as const, status: "active" as const }, healthy: true };
  const today = new Date().toISOString().slice(0, 10);
  const used = billingConfigured() ? await getUsage(deviceId, today) : 0;
  const limit = NOOR_DAILY_LIMIT[license.tier];
  // Coder channel draws from its own counter (`#coder`-suffixed usage key)
  // and counts TOKENS, not messages (CODER_DAILY_TOKENS): the surface shows
  // server-truth "% of daily tokens used" without touching chat quota.
  const coderUsed = billingConfigured() ? await getUsage(`${deviceId}#coder`, today) : 0;
  const coderLimit = CODER_DAILY_TOKENS[license.tier];

  return NextResponse.json({
    tier: license.tier,
    status: license.status,
    periodEnd: "periodEnd" in license ? license.periodEnd : undefined,
    cancelAtPeriodEnd: "cancelAtPeriodEnd" in license ? license.cancelAtPeriodEnd : false,
    // False for granted (comped) licenses: no Stripe subscription to manage.
    managed: "subscriptionId" in license ? Boolean(license.subscriptionId) : false,
    used,
    limit: Number.isFinite(limit) ? limit : null, // null = unlimited
    coderUsed,
    coderLimit: Number.isFinite(coderLimit) ? coderLimit : null,
    // false => both license stores are down; clients must not lock out
    // (and must not seed cap chips from) a tier resolved during an outage.
    storageHealthy,
    billingConfigured: billingConfigured(),
  }, { headers: { "Cache-Control": "no-store" } });
}
