import { NextResponse } from "next/server";
import { putSubscription, putSchedule, deleteSubscription, isAllowedPushEndpoint, type ScheduledItem } from "@/lib/push-store";
import { guardApi, bodyTooLarge } from "@/lib/apiGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/reminders/subscribe
 * Body: { endpoint, deviceId, keys: { p256dh, auth }, items?: [...] }
 *
 * Registers (or refreshes) a Web Push subscription, and optionally sets
 * the initial schedule in the same call. DELETE with ?endpoint= removes it.
 */
export async function POST(req: Request) {
  const blocked = guardApi(req, { perMinute: 10, perDay: 100 });
  if (blocked) return blocked;
  if (bodyTooLarge(req, 64 * 1024)) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }
  let body: {
    endpoint?: string;
    deviceId?: string;
    keys?: Record<string, string>;
    items?: ScheduledItem[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const endpoint = typeof body?.endpoint === "string" ? body.endpoint.slice(0, 500) : "";
  const keys = body?.keys;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "endpoint + keys.p256dh + keys.auth required" }, { status: 400 });
  }
  // The cron POSTs notification payloads to this URL server-side. Only real
  // browser push services are accepted, otherwise this endpoint (and the
  // schedule route) would turn the cron into an open SSRF relay.
  if (!isAllowedPushEndpoint(endpoint)) {
    return NextResponse.json({ error: "endpoint is not a recognized push service" }, { status: 400 });
  }

  try {
    await putSubscription({
      endpoint,
      deviceId: typeof body.deviceId === "string" ? body.deviceId.slice(0, 100) : undefined,
      keys: { p256dh: String(keys.p256dh).slice(0, 400), auth: String(keys.auth).slice(0, 200) },
    });

    if (Array.isArray(body.items)) {
      await putSchedule(endpoint, sanitizeItems(body.items));
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const endpoint = new URL(req.url).searchParams.get("endpoint") || "";
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  try {
    await deleteSubscription(endpoint);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}

function sanitizeItems(items: unknown): ScheduledItem[] {
  const now = Date.now();
  return (Array.isArray(items) ? (items as ScheduledItem[]) : [])
    .slice(0, 20)
    .filter(
      (i) =>
        i &&
        typeof i.id === "string" && i.id.length <= 200 &&
        typeof i.at === "string" && !isNaN(Date.parse(i.at)) && Date.parse(i.at) > now &&
        typeof i.title === "string" && i.title.length <= 120 &&
        typeof i.body === "string" && i.body.length <= 200 &&
        typeof i.href === "string" && i.href.length <= 200
    )
    .map((i) => ({
      id: i.id.slice(0, 200),
      at: i.at,
      title: i.title.slice(0, 120),
      body: i.body.slice(0, 200),
      href: i.href.slice(0, 200),
    }));
}
