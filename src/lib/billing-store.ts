// ============================================================
// Orleia billing store — Supabase-first, Blob fallback.
//
// Primary backend: Supabase Postgres.
//   - noor_usage(device_id, day, n) — daily Noor counter, incremented
//     atomically via the incr_noor_usage SQL function (race-free).
//   - billing_license(device_id, ...) — Stripe-driven license rows.
//   - RLS enabled + all grants revoked: only the service key (server-side)
//     can touch these tables. deviceId is a random UUID in localStorage —
//     no accounts, no personal data, nothing to leak.
//
// Fallback backend: Vercel Blob (previous layout, kept verbatim):
//   billing/license/<deviceId>.json, billing/usage/<deviceId>/<date>.json
//
// Every Supabase failure (project paused, network, outage) automatically
// falls back to Blob; every Blob failure surfaces to consumeNoorTurn's
// caller, which fails open. This keeps billing alive through any single
// backend outage.
// ============================================================

import { put, get, del } from "@vercel/blob";
import { billingConfigured, NOOR_DAILY_LIMIT, CODER_DAILY_TOKENS } from "@/lib/plans";

const LICENSE_PREFIX = "billing/license/";
const USAGE_PREFIX = "billing/usage/";

// ---------------- Supabase (primary) ----------------

const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function sbConfigured(): boolean {
  return Boolean(SB_URL && SB_SERVICE_KEY);
}

async function sbRpc<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  if (!sbConfigured()) return null;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: SB_SERVICE_KEY,
        Authorization: `Bearer ${SB_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function sbSelect<T>(table: string, searchParams: string): Promise<T[] | null> {
  if (!sbConfigured()) return null;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?${searchParams}`, {
      headers: {
        apikey: SB_SERVICE_KEY,
        Authorization: `Bearer ${SB_SERVICE_KEY}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T[];
  } catch {
    return null;
  }
}

async function sbUpsert(table: string, row: Record<string, unknown>): Promise<boolean> {
  if (!sbConfigured()) return false;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: SB_SERVICE_KEY,
        Authorization: `Bearer ${SB_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sbDelete(table: string, eq: string): Promise<boolean> {
  if (!sbConfigured()) return false;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?${eq}`, {
      method: "DELETE",
      headers: {
        apikey: SB_SERVICE_KEY,
        Authorization: `Bearer ${SB_SERVICE_KEY}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------- Blob (fallback) ----------------

export interface StoredLicense {
  tier: "free" | "plus" | "pro" | "ultra";
  status: "active" | "canceled" | "past_due";
  customerId?: string;
  subscriptionId?: string;
  periodEnd?: string; // ISO
  /** True once the user cancels: benefits run until periodEnd, then stop. */
  cancelAtPeriodEnd?: boolean;
  updatedAt: string;
}

function licenseKey(deviceId: string): string {
  return `${LICENSE_PREFIX}${encodeURIComponent(deviceId)}.json`;
}

async function readJson(key: string): Promise<unknown | null> {
  try {
    const res = await get(key, { access: "public" });
    if (!res) return null;
    const text = await new Response(res.stream).text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function usageKey(deviceId: string, date: string): string {
  return `${USAGE_PREFIX}${encodeURIComponent(deviceId)}/${date}.json`;
}

// ---------------- License (Supabase -> Blob) ----------------

const validTiers = new Set(["free", "plus", "pro", "ultra"]);

export async function getLicense(deviceId: string): Promise<StoredLicense> {
  return (await getLicenseWithHealth(deviceId)).license;
}

/**
 * License + storage health. `healthy: false` means NEITHER backend could
 * answer (Supabase unreachable AND Blob threw) — a total billing-storage
 * outage. Callers that gate access must fail open in that state: silently
 * resolving every device to "free" during an outage locks out paying
 * users (seen in prod 2026-10-07: Supabase project 404 on every service,
 * Vercel Blob store suspended — every license read resolved to free).
 */
export async function getLicenseWithHealth(
  deviceId: string
): Promise<{ license: StoredLicense; healthy: boolean }> {
  const fallback: StoredLicense = { tier: "free", status: "active", updatedAt: new Date().toISOString() };
  // Primary: Supabase row. null => store unreachable (see sbSelect).
  const rows = await sbSelect<StoredLicense & { device_id: string }>(
    "billing_license",
    `device_id=eq.${encodeURIComponent(deviceId)}&select=*`
  );
  if (rows) {
    if (rows.length && validTiers.has(rows[0].tier)) {
      const { device_id: _d, ...lic } = rows[0];
      return { license: lic as StoredLicense, healthy: true };
    }
    // Supabase answered: no row => genuinely free. Legacy pre-Supabase
    // Blob rows are checked best-effort; their outage can't demote a
    // Supabase-backed user.
    const legacy = (await readJson(licenseKey(deviceId))) as StoredLicense | null;
    if (legacy && validTiers.has(legacy.tier)) return { license: legacy, healthy: true };
    return { license: fallback, healthy: true };
  }
  // Supabase down -> Blob is the source of truth. Raw get(): readJson
  // swallows errors, and we must distinguish "no file" (healthy) from
  // "store suspended" (outage).
  try {
    const res = await get(licenseKey(deviceId), { access: "public" });
    if (!res) return { license: fallback, healthy: true }; // healthy store, no file
    const parsed = JSON.parse(await new Response(res.stream).text()) as StoredLicense;
    if (!validTiers.has(parsed.tier)) return { license: fallback, healthy: true };
    return { license: parsed, healthy: true };
  } catch {
    return { license: fallback, healthy: false };
  }
}

export async function setLicense(deviceId: string, license: StoredLicense): Promise<void> {
  // Primary: upsert into Supabase.
  const ok = await sbUpsert("billing_license", {
    device_id: deviceId,
    tier: license.tier,
    status: license.status,
    customer_id: license.customerId ?? null,
    subscription_id: license.subscriptionId ?? null,
    period_end: license.periodEnd ?? null,
    cancel_at_period_end: license.cancelAtPeriodEnd ?? false,
    updated_at: new Date().toISOString(),
  });
  if (ok) return;
  // Fallback: Blob JSON.
  await put(licenseKey(deviceId), JSON.stringify(license), {
    access: "public",
    addRandomSuffix: false,
    cacheControlMaxAge: 0, // bypass CDN cache: cap counter + cancels must be read fresh
    allowOverwrite: true,
  });
}

export async function deleteLicense(deviceId: string): Promise<void> {
  await sbDelete("billing_license", `device_id=eq.${encodeURIComponent(deviceId)}`);
  try {
    await del(licenseKey(deviceId));
  } catch {
    /* already gone */
  }
}

// ---------------- Usage counter (Supabase RPC -> Blob) ----------------

export async function getUsage(deviceId: string, date: string): Promise<number> {
  // Primary: Supabase row (read via select; no side effects).
  const rows = await sbSelect<{ n: number }>(
    "noor_usage",
    `device_id=eq.${encodeURIComponent(deviceId)}&day=eq.${encodeURIComponent(date)}&select=n`
  );
  if (rows && rows.length && typeof rows[0].n === "number") return rows[0].n;
  if (rows) return 0; // Supabase reachable, row absent -> genuinely 0
  // Fallback: Blob JSON.
  const parsed = (await readJson(usageKey(deviceId, date))) as { n?: number } | null;
  return parsed && typeof parsed.n === "number" && parsed.n > 0 ? Math.floor(parsed.n) : 0;
}

export async function incrUsage(deviceId: string, date: string): Promise<number> {
  // Primary: atomic SQL increment (single round-trip, race-free).
  const n = await sbRpc<number>("incr_noor_usage", { p_device: deviceId, p_day: date });
  if (typeof n === "number") return n;
  // Fallback: read-modify-write in Blob.
  const cur = await getUsage(deviceId, date);
  const next = cur + 1;
  await put(usageKey(deviceId, date), JSON.stringify({ n: next }), {
    access: "public",
    addRandomSuffix: false,
    cacheControlMaxAge: 0, // bypass CDN cache: cap counter + cancels must be read fresh
    allowOverwrite: true,
  });
  return next;
}

export interface NoorCapResult {
  ok: boolean; // false -> request must be rejected with 402
  used: number;
  limit: number; // Infinity = unlimited
  tier: string;
}

/**
 * Single source of cap enforcement. Consumes one turn for the device on
 * the given channel and reports whether the request may proceed.
 *  - Billing unconfigured -> always allow (pre-launch state).
 *  - Missing/unknown device -> deny (prevents header-stripping bypass);
 *    genuine clients always send x-orleia-device.
 * Counts toward the daily limit at midnight reset (UTC date key).
 */
export async function consumeNoorTurn(deviceId: string): Promise<NoorCapResult> {
  if (!billingConfigured()) return { ok: true, used: 0, limit: Number.POSITIVE_INFINITY, tier: "free" };
  if (!deviceId) return { ok: false, used: 0, limit: NOOR_DAILY_LIMIT.free, tier: "free" };
  const { license, healthy } = await getLicenseWithHealth(deviceId);
  // Total storage outage -> no enforcement (same rule as pre-launch):
  // neither the counter nor the license could be read, and incrementing
  // would fail anyway. Never resolve to "free" mid-outage — that 402'd
  // every paid Coder message while the counter was unreachable.
  if (!healthy) return { ok: true, used: 0, limit: Number.POSITIVE_INFINITY, tier: "free" };
  const today = new Date().toISOString().slice(0, 10);
  const limit = NOOR_DAILY_LIMIT[license.tier];
  const used = await getUsage(deviceId, today);
  if (used >= limit) return { ok: false, used, limit, tier: license.tier };
  await incrUsage(deviceId, today);
  return { ok: true, used: used + 1, limit, tier: license.tier };
}

// ---------------- Coder token accounting (own counter, own units) ----------------
// The Coder channel (usage key `<deviceId>#coder`) counts TOKENS, not
// messages (see CODER_DAILY_TOKENS). Its budget is checked before each
// request and charged after, from the actual token cost.

export interface CoderBudget {
  ok: boolean; // false -> reject with 402
  used: number; // tokens used today
  limit: number; // tokens/day, Infinity = unlimited
  healthy: boolean; // false -> storage outage (caller fails open)
}

export async function checkCoderBudget(deviceId: string): Promise<CoderBudget> {
  if (!billingConfigured()) {
    return { ok: true, used: 0, limit: Number.POSITIVE_INFINITY, healthy: true };
  }
  if (!deviceId) return { ok: false, used: 0, limit: 0, healthy: true };
  const { license, healthy } = await getLicenseWithHealth(deviceId);
  if (!healthy) {
    // Storage outage: no enforcement (counting is down too) — never 402
    // a paying user because the counter is unreachable.
    return { ok: true, used: 0, limit: Number.POSITIVE_INFINITY, healthy: false };
  }
  const limit = CODER_DAILY_TOKENS[license.tier];
  const used = await getUsage(`${deviceId}#coder`, new Date().toISOString().slice(0, 10));
  return { ok: used < limit, used, limit, healthy: true };
}

/**
 * Charge tokens to the device's coder counter (read-modify-write). Safe
 * without an atomic RPC because the Coder surface is single-flight per
 * device: one in-flight request at a time, and charges land in order
 * (prompt + completion are charged together when the stream settles).
 * Returns the new total, or null when billing is off / the write failed
 * (best-effort accounting must never break a reply).
 */
export async function addCoderUsage(deviceId: string, tokens: number): Promise<number | null> {
  if (!billingConfigured() || !deviceId || !Number.isFinite(tokens) || tokens <= 0) return null;
  const key = `${deviceId}#coder`;
  const day = new Date().toISOString().slice(0, 10);
  try {
    const next = (await getUsage(key, day)) + Math.max(1, Math.round(tokens));
    const ok = await sbUpsert("noor_usage", { device_id: key, day, n: next });
    if (!ok) {
      await put(usageKey(key, day), JSON.stringify({ n: next }), {
        access: "public",
        addRandomSuffix: false,
        cacheControlMaxAge: 0,
        allowOverwrite: true,
      });
    }
    return next;
  } catch (err) {
    console.error("[coder] usage charge failed:", err);
    return null;
  }
}
