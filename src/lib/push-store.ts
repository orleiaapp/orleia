// ============================================================
// Orleia push store — Supabase-first, Blob fallback.
//
// Registry of devices for background push notifications:
//   push_subs(endpoint PK, device_id, keys jsonb)   — push subscriptions
//   push_sched(endpoint PK, items jsonb)            — armed schedules
//
// Primary: Supabase Postgres. The Vercel Blob store is account-suspended,
// which silently killed every schedule upload and the cron's reads.
// Fallback: the original Blob layout, best-effort only.
//
// Write semantics: Supabase REST returns 2xx with an EMPTY body for
// upserts/deletes with return=minimal — writes must be judged by status
// code, never by parsing the body (that bug made every write look
// failed and silently fall through to the dead Blob store).
// ============================================================

import { put, del, head, list } from "@vercel/blob";

const SUB_PREFIX = "push/subs/";
const SCHED_PREFIX = "push/sched/";

export interface PushKeys {
  p256dh: string;
  auth: string;
}

export interface StoredSubscription {
  endpoint: string;
  deviceId?: string;
  keys: PushKeys;
}

export interface ScheduledItem {
  id: string;
  at: string;
  title: string;
  body: string;
  href: string;
}

// ---------------- Supabase (primary) ----------------

const SB_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
  .replace(/\\n|\r/g, "")
  .trim();
const SB_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/\\n|\r/g, "").trim();

function sbConfigured(): boolean {
  return Boolean(SB_URL && SB_SERVICE_KEY);
}

function sbHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: SB_SERVICE_KEY,
    Authorization: `Bearer ${SB_SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...(extra ?? {}),
  };
}

/** Read query — returns parsed JSON, or null on unconfigured/error. */
async function sbRead<T>(path: string): Promise<T | null> {
  if (!sbConfigured()) return null;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
      headers: sbHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("[push-store] sb read failed", res.status, path.split("?")[0]);
      return null;
    }
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch (e) {
    console.error("[push-store] sb read error", path.split("?")[0], e instanceof Error ? e.message : e);
    return null;
  }
}

/** Write query — TRUE on any 2xx status (body may be empty), FALSE on failure. */
async function sbWrite(
  path: string,
  method: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<boolean> {
  if (!sbConfigured()) return false;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
      method,
      headers: sbHeaders(headers),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("[push-store] sb write failed", res.status, path.split("?")[0], method);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[push-store] sb write error", path.split("?")[0], e instanceof Error ? e.message : e);
    return false;
  }
}

// ---------------- Public API ----------------

export async function putSubscription(sub: StoredSubscription): Promise<void> {
  if (
    await sbWrite("push_subs", "POST", {
      endpoint: sub.endpoint,
      device_id: sub.deviceId ?? null,
      keys: sub.keys,
    }, { Prefer: "resolution=merge-duplicates,return=minimal" })
  ) {
    return;
  }
  // Blob fallback (best-effort; log loudly if the store is suspended)
  try {
    await put(`${SUB_PREFIX}${endpointKey(sub.endpoint)}.json`, JSON.stringify(sub), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (e) {
    console.error("[push-store] blob sub write failed", e instanceof Error ? e.message : e);
  }
}

export async function getSubscription(endpoint: string): Promise<StoredSubscription | null> {
  const rows = await sbRead<Array<{ endpoint: string; device_id: string | null; keys: PushKeys }>>(
    `push_subs?select=*&endpoint=eq.${encodeURIComponent(endpoint)}&limit=1`
  );
  if (rows !== null) {
    const row = rows[0];
    if (!row?.keys) return null;
    return { endpoint: row.endpoint, deviceId: row.device_id ?? undefined, keys: row.keys };
  }
  // Blob fallback (read-only best effort)
  try {
    const res = await fetch(await blobUrl(`${SUB_PREFIX}${endpointKey(endpoint)}.json`), { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as StoredSubscription;
  } catch {
    return null;
  }
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  const jobs: Promise<unknown>[] = [
    sbWrite(`push_subs?endpoint=eq.${encodeURIComponent(endpoint)}`, "DELETE"),
    sbWrite(`push_sched?endpoint=eq.${encodeURIComponent(endpoint)}`, "DELETE"),
    // Blob cleanup best-effort
    del(`${SUB_PREFIX}${endpointKey(endpoint)}.json`).catch(() => {}),
    del(`${SCHED_PREFIX}${endpointKey(endpoint)}.json`).catch(() => {}),
  ];
  await Promise.allSettled(jobs);
}

export async function putSchedule(endpoint: string, items: ScheduledItem[]): Promise<void> {
  if (!items.length) {
    if (await sbWrite(`push_sched?endpoint=eq.${encodeURIComponent(endpoint)}`, "DELETE")) return;
    try {
      await del(`${SCHED_PREFIX}${endpointKey(endpoint)}.json`);
      return;
    } catch (e) {
      // Both stores failed for a DELETE — nothing was stored anyway, but the
      // operator must see why (suspended store / dead Supabase).
      console.error("[push-store] schedule clear failed on both stores", e instanceof Error ? e.message : e);
      throw new Error("reminder store unavailable (both Supabase and Blob failed)");
    }
  }
  if (
    await sbWrite("push_sched", "POST", { endpoint, items },
      { Prefer: "resolution=merge-duplicates,return=minimal" })
  ) {
    return;
  }
  try {
    await put(`${SCHED_PREFIX}${endpointKey(endpoint)}.json`, JSON.stringify({ items }), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (e) {
    console.error("[push-store] blob sched write failed", e instanceof Error ? e.message : e);
    // NEVER pretend success: if both stores fail, the reminder will silently
    // never fire. Surface the failure to the caller (HTTP 500) so the client
    // can tell the user instead of losing their reminder forever.
    throw new Error("reminder store unavailable (both Supabase and Blob failed)");
  }
}

export async function getSchedule(endpoint: string): Promise<ScheduledItem[]> {
  const rows = await sbRead<Array<{ items: ScheduledItem[] }>>(
    `push_sched?select=items&endpoint=eq.${encodeURIComponent(endpoint)}&limit=1`
  );
  if (rows !== null) {
    return rows[0]?.items || [];
  }
  try {
    const res = await fetch(await blobUrl(`${SCHED_PREFIX}${endpointKey(endpoint)}.json`), { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []) as ScheduledItem[];
  } catch {
    return [];
  }
}

/**
 * All endpoints that currently have a schedule.
 * NEVER throws: a suspended store / dead Supabase must not 500 the cron
 * (external schedulers auto-disable jobs that keep failing — that is how
 * reminders went fully dark before). Returns what it can, logs the rest.
 */
export async function listScheduledEndpoints(): Promise<string[]> {
  const rows = await sbRead<Array<{ endpoint: string }>>(
    "push_sched?select=endpoint&limit=1000"
  );
  if (rows !== null) {
    return rows.map((r) => r.endpoint);
  }
  const out: string[] = [];
  let cursor: string | undefined;
  try {
    do {
      const res = await list({ prefix: SCHED_PREFIX, cursor, limit: 100 });
      for (const b of res.blobs) {
        try {
          const key = b.pathname.slice(SCHED_PREFIX.length).replace(/\.json$/, "");
          out.push(Buffer.from(key, "base64url").toString("utf-8"));
        } catch { /* skip malformed */ }
      }
      cursor = res.hasMore ? res.cursor : undefined;
    } while (cursor);
  } catch (e) {
    // Blob suspended/unreachable — cron runs with an empty sweep instead of 500.
    console.error("[push-store] blob sched list failed", e instanceof Error ? e.message : e);
  }
  return out;
}

// ---------------- push endpoint allowlist ----------------
// Web Push endpoints are SERVER-DESTINED URLs: the cron POSTs the payload
// to them. Accepting arbitrary endpoints would turn the cron into an SSRF
// relay (attacker registers http://169.254.169.254/ as their "browser").
// Only real browser-vendor push services are accepted. Suffix match on
// the hostname so per-instance subdomains (Edge's *.notify.windows.com)
// still work, but evil-windows.com does not.
const PUSH_SERVICE_SUFFIXES = [
  "fcm.googleapis.com", // Chrome / Android
  "updates.push.services.mozilla.com", // Firefox
  "notify.windows.com", // Edge / Windows
  "notify.windowsphone.com", // legacy Edge
  "web.push.apple.com", // Safari on iOS/macOS
  "web.push.hms.apple.com", // Safari (Huawei HMS interop)
  "opera.push.notify.opera.com", // Opera
  "sap.samsungosp.com", // Samsung Internet
];

export function isAllowedPushEndpoint(raw: unknown): boolean {
  if (typeof raw !== "string" || raw.length > 2000) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  return PUSH_SERVICE_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

function endpointKey(endpoint: string): string {
  return Buffer.from(endpoint, "utf-8").toString("base64url");
}

async function blobUrl(pathname: string): Promise<string> {
  const res = await head(pathname);
  return res.url;
}
