import { NextResponse } from "next/server";
import { timingSafeEqual, createHash } from "node:crypto";
import {
  listScheduledEndpoints,
  getSchedule,
  getSubscription,
  putSchedule,
  deleteSubscription,
  type ScheduledItem,
} from "@/lib/push-store";

/* Minimal typing for the parts of web-push we use (loaded via eval-require
   below — see comment there for why it can't be a static import). */
interface WebPushLike {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(
    subscription: { endpoint: string; keys: Record<string, string> },
    payload?: string | Buffer | null,
    options?: Record<string, unknown>
  ): Promise<unknown>;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@orleia.app";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

/** Constant-time secret compare (SHA-256 both sides so lengths match). */
function secretsMatch(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * GET /api/reminders/cron[?secret=...]  (also accepts Authorization: Bearer)
 *
 * Called every ~5 minutes by an external scheduler (cron-job.org, Vercel
 * Cron, etc.). Sends a Web Push for every scheduled reminder whose time
 * has come — this is what makes notifications work while Orleia is closed.
 */
export async function GET(req: Request) {
  try {
    return await cronHandler(req);
  } catch (e) {
    // Log full detail server-side; return a minimal error to callers.
    console.error("[reminders/cron] crashed:", (e as Error)?.stack || e);
    return NextResponse.json(
      { error: "cron crashed", detail: String((e as Error)?.message || e).slice(0, 200) },
      { status: 500 }
    );
  }
}

async function cronHandler(req: Request) {
  const url = new URL(req.url);
  const provided =
    url.searchParams.get("secret") ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  // Secret is REQUIRED in production — an empty CRON_SECRET env means the
  // deployment is misconfigured, and an open cron endpoint would let anyone
  // trigger pushes. (Locally, with no secret set, we still allow it.)
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "cron not configured" }, { status: 503 });
    }
  } else if (!secretsMatch(provided, CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return NextResponse.json({ error: "push not configured" }, { status: 503 });
  }

  /* web-push is required at RUNTIME (not statically imported): the project's
     webpack config stubs out node builtins (https/crypto) for bundled code,
     which breaks web-push at build time. createRequire gets the real node
     module from the serverless lambda's own dependency tree. */
  /* web-push is server-only and the client webpack layer stubs node builtins
     (for pptxgenjs), so a static import would break the bundle. The route
     itself runs in Node — load the real module dynamically. */
  let webpush: WebPushLike;
  try {
    const mod = (await import("web-push")) as unknown as {
      default?: WebPushLike;
    } & WebPushLike;
    webpush = mod.default ?? mod;
  } catch (e) {
    return NextResponse.json(
      { error: "push module unavailable", detail: String((e as Error)?.message || e) },
      { status: 503 }
    );
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const now = Date.now();
  let sent = 0;
  let failed = 0;
  let checked = 0;

  try {
    const endpoints = await listScheduledEndpoints();

    for (const endpoint of endpoints) {
      checked++;
      const items = await getSchedule(endpoint);
      const due = items.filter((i) => Date.parse(i.at) <= now);
      if (!due.length) continue;

      const sub = await getSubscription(endpoint);
      if (!sub?.keys) {
        // Subscription vanished — nothing can ever fire; drop the schedule.
        await deleteSubscription(endpoint);
        continue;
      }

      let dead = false;
      for (const item of due) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { ...sub.keys } },
            JSON.stringify({
              title: item.title,
              body: item.body,
              href: item.href,
              tag: `orleia-push-${item.id}`,
            })
          );
          sent++;
        } catch (e: unknown) {
          failed++;
          const status = (e as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            dead = true; // subscription expired on the browser side
            break;
          }
        }
      }

      if (dead) {
        await deleteSubscription(endpoint);
        continue;
      }

      const remaining: ScheduledItem[] = items.filter((i) => !due.includes(i));
      await putSchedule(endpoint, remaining); // empty list deletes the row
    }

    return NextResponse.json({ ok: true, sent, failed, checked, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { error: String((e as Error)?.message || e), sent, failed, checked },
      { status: 500 }
    );
  }
}
