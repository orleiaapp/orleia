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

import { randomBytes } from "crypto";
import { put, get, del } from "@vercel/blob";
import { billingConfigured, NOOR_DAILY_LIMIT, CODER_DAILY_TOKENS, type Tier } from "@/lib/plans";

const LICENSE_PREFIX = "billing/license/";
const USAGE_PREFIX = "billing/usage/";

// ---------------- Supabase (primary) ----------------

// Strip stray literal "\n" sequences from env values (same guard as
// push-store): the production NEXT_PUBLIC_SUPABASE_URL had one glued on,
// which 404'd every Supabase call and silently dropped billing to the
// Blob fallback - which is suspended, so codes/licenses vanished.
const SB_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
  .replace(/\\n|\r/g, "")
  .trim();
const SB_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/\\n|\r/g, "").trim();

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

/** Insert a row; false on error OR primary-key conflict (no upsert semantics). */
async function sbInsert(table: string, row: object): Promise<boolean> {
  if (!sbConfigured()) return false;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: SB_SERVICE_KEY,
        Authorization: `Bearer ${SB_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Conditional update (compare-and-swap). Returns updated rows, or null on
 *  error — callers distinguish null (store unreachable) from [] (filter
 *  matched nothing, i.e. the CAS lost). */
async function sbUpdateWhere<T>(
  table: string,
  searchParams: string,
  body: object
): Promise<T[] | null> {
  if (!sbConfigured()) return null;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?${searchParams}`, {
      method: "PATCH",
      headers: {
        apikey: SB_SERVICE_KEY,
        Authorization: `Bearer ${SB_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T[];
  } catch {
    return null;
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
/**
 * Granted (code/comped) licenses carry their own periodEnd and have NO
 * Stripe subscription to expire them via webhook — so their expiry is
 * enforced here, at read time: past periodEnd + no subscriptionId => free.
 * Stripe-managed licenses (subscriptionId present) are left untouched;
 * their lifecycle belongs to the webhook.
 */
/**
 * Supabase rows are snake_case (setLicense writes that way); StoredLicense
 * is camelCase. Consumers (license route, expiry check, UI) read the camel
 * fields, so map them here once instead of every read site guessing.
 */
function normalizeStoredLicense(row: Record<string, unknown>): StoredLicense {
  const pick = <T>(...vals: unknown[]): T | undefined => {
    for (const v of vals) if (v !== undefined && v !== null) return v as T;
    return undefined;
  };
  const out: StoredLicense = {
    tier: (pick<string>(row.tier) || "free") as StoredLicense["tier"],
    status: (pick<string>(row.status) || "active") as StoredLicense["status"],
    updatedAt: pick<string>(row.updatedAt, row.updated_at) || new Date().toISOString(),
  };
  const customerId = pick<string>(row.customerId, row.customer_id);
  if (customerId) out.customerId = customerId;
  const subscriptionId = pick<string>(row.subscriptionId, row.subscription_id);
  if (subscriptionId) out.subscriptionId = subscriptionId;
  const periodEnd = pick<string>(row.periodEnd, row.period_end);
  if (periodEnd) out.periodEnd = periodEnd;
  const cap = pick<boolean>(row.cancelAtPeriodEnd, row.cancel_at_period_end);
  if (cap !== undefined) out.cancelAtPeriodEnd = cap;
  return out;
}

function applyGrantedExpiry(lic: StoredLicense): StoredLicense {
  if (!lic.subscriptionId && lic.periodEnd && new Date(lic.periodEnd).getTime() < Date.now()) {
    return { tier: "free", status: "active", updatedAt: new Date().toISOString() };
  }
  return lic;
}

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
      const { device_id: _d, ...rest } = rows[0];
      return { license: applyGrantedExpiry(normalizeStoredLicense(rest as Record<string, unknown>)), healthy: true };
    }
    // Supabase answered: no row => genuinely free. Legacy pre-Supabase
    // Blob rows are checked best-effort; their outage can't demote a
    // Supabase-backed user.
    const legacy = (await readJson(licenseKey(deviceId))) as StoredLicense | null;
    if (legacy && validTiers.has(legacy.tier)) return { license: applyGrantedExpiry(legacy), healthy: true };
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
    return { license: applyGrantedExpiry(parsed), healthy: true };
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

// ---------------- One-time redeem codes ----------------
// Owner-minted codes (grant-key protected endpoint) that grant a paid tier
// to ONE device for a fixed duration. Supabase table `billing_codes` is the
// primary store (CAS claim on redeemed_at is null => race-safe); Blob JSON
// at billing/codes/<code>.json is the fallback. Burning a code writes a
// normal granted license (no subscriptionId) — expiry is enforced at read
// time by applyGrantedExpiry above.
//
// Supabase DDL (run once in the SQL editor; missing table just degrades
// to Blob):
//   create table if not exists billing_codes (
//     code text primary key,
//     tier text not null,
//     duration_days int not null,
//     note text,
//     created_at timestamptz not null default now(),
//     redeemed_at timestamptz,
//     redeemed_device text
//   );
//   alter table billing_codes enable row level security;
//   revoke all on billing_codes from public, anon, authenticated;

const CODES_PREFIX = "billing/codes/";
// Crockford-ish: no I/L/O/0/1 — codes get read aloud / retyped by humans.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_TIERS = ["plus", "pro", "ultra"] as const;
export type CodeTier = (typeof CODE_TIERS)[number];

export interface StoredRedeemCode {
  code: string;
  tier: CodeTier;
  durationDays: number;
  note?: string;
  createdAt: string;
  redeemedAt?: string | null;
  redeemedDevice?: string | null;
}

function codeKey(code: string): string {
  return `${CODES_PREFIX}${code}.json`;
}

/**
 * Normalize user input to the canonical stored form (ORL-XXXX-XXXX-XXXX):
 * uppercase, drop any dashes/spaces the user typed, then re-insert them at
 * the canonical positions. "orl ugtt nd79 efk" == "ORL-UGTT-ND79-EFK".
 */
export function normalizeCode(raw: string): string {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length === 15 && s.startsWith("ORL")) {
    return `ORL-${s.slice(3, 7)}-${s.slice(7, 11)}-${s.slice(11, 15)}`;
  }
  return s;
}

function randomCodeString(): string {
  const bytes = randomBytes(12);
  let s = "";
  for (let i = 0; i < 12; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `ORL-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

interface CodeRow {
  code: string;
  tier: string;
  duration_days: number;
  note: string | null;
  created_at: string;
  redeemed_at: string | null;
  redeemed_device: string | null;
}

function rowToCode(row: CodeRow): StoredRedeemCode {
  return {
    code: row.code,
    tier: row.tier as CodeTier,
    durationDays: row.duration_days,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    redeemedAt: row.redeemed_at,
    redeemedDevice: row.redeemed_device,
  };
}

/** Mint a fresh unique code. Best-effort across both stores. */
export async function createRedeemCode(input: {
  tier: CodeTier;
  durationDays: number;
  note?: string;
}): Promise<StoredRedeemCode> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCodeString();
    const row: CodeRow = {
      code,
      tier: input.tier,
      duration_days: input.durationDays,
      note: input.note?.slice(0, 80) || null,
      created_at: new Date().toISOString(),
      redeemed_at: null,
      redeemed_device: null,
    };
    // Primary: strict insert (no merge!) so an existing code can never be
    // silently overwritten. false = conflict OR store down; disambiguate.
    if (sbConfigured()) {
      const inserted = await sbInsert("billing_codes", row);
      if (inserted) return rowToCode(row);
      const clash = await sbSelect<{ code: string }>(
        "billing_codes",
        `code=eq.${encodeURIComponent(code)}&select=code`
      );
      // null => Supabase unreachable OR billing_codes table not created yet:
      // fall through to the Blob path instead of failing the mint.
      if (clash !== null) {
        if (clash.length === 0) throw new Error("billing_codes insert failed");
        continue; // collision -> regenerate
      }
    }
    // Blob path (or Supabase fallback): no true uniqueness, check-then-put.
    const key = codeKey(code);
    const existing = await get(key, { access: "public" });
    if (existing) continue; // collision -> regenerate
    await put(key, JSON.stringify(row), {
      access: "public",
      addRandomSuffix: false,
      cacheControlMaxAge: 0,
      allowOverwrite: false,
    });
    return rowToCode(row);
  }
  throw new Error("could not mint a unique code");
}

export type RedeemResult =
  | { ok: true; license: StoredLicense }
  | { ok: false; reason: "invalid" | "used" | "failed" };

function licenseFromCode(code: StoredRedeemCode, deviceId: string): StoredLicense {
  return {
    tier: code.tier,
    status: "active",
    periodEnd: new Date(Date.now() + code.durationDays * 86400_000).toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Burn a one-time code for a device. Exactly one redemption wins. */
export async function redeemRedeemCode(rawCode: string, deviceId: string): Promise<RedeemResult> {
  const code = normalizeCode(rawCode);

  // Primary: atomic CAS — UPDATE ... WHERE code=... AND redeemed_at IS NULL.
  // Rows returned => we won the claim; [] => someone else claimed it first
  // (or it never existed — distinguish below). null => store unreachable.
  if (sbConfigured()) {
    const claimed = await sbUpdateWhere<CodeRow>(
      "billing_codes",
      `code=eq.${encodeURIComponent(code)}&redeemed_at=is.null`,
      { redeemed_at: new Date().toISOString(), redeemed_device: deviceId }
    );
    if (claimed && claimed.length === 1) {
      const lic = licenseFromCode(rowToCode(claimed[0]), deviceId);
      await setLicense(deviceId, lic);
      return { ok: true, license: lic };
    }
    if (claimed && claimed.length === 0) {
      const exists = await sbSelect<{ code: string }>(
        "billing_codes",
        `code=eq.${encodeURIComponent(code)}&select=code`
      );
      if (exists === null) return { ok: false, reason: "failed" }; // flaked between calls
      return { ok: false, reason: exists.length ? "used" : "invalid" };
    }
    // claimed === null: Supabase unreachable -> fall through to Blob.
  }

  // Fallback: read-modify-write. Not CAS-safe, but only reached when the
  // race-safe primary store is down — same best-effort posture as Blob usage.
  try {
    const key = codeKey(code);
    const res = await get(key, { access: "public" });
    if (!res) return { ok: false, reason: "invalid" };
    const parsed = JSON.parse(await new Response(res.stream).text()) as StoredRedeemCode;
    if (!CODE_TIERS.includes(parsed.tier)) return { ok: false, reason: "invalid" };
    if (parsed.redeemedAt) return { ok: false, reason: "used" };
    parsed.redeemedAt = new Date().toISOString();
    parsed.redeemedDevice = deviceId;
    await put(key, JSON.stringify(parsed), {
      access: "public",
      addRandomSuffix: false,
      cacheControlMaxAge: 0,
      allowOverwrite: true,
    });
    const lic = licenseFromCode(parsed, deviceId);
    await setLicense(deviceId, lic);
    return { ok: true, license: lic };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
