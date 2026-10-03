import { NextResponse } from "next/server";
import { guardApi } from "@/lib/apiGuard";
import { extractJSON, coercePlan, buildPlannerPrompt } from "@/lib/research";
import { consumeNoorTurn } from "@/lib/billing-store";
import { callChat } from "@/lib/ai-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PLANNER_MODEL = "nvidia/nemotron-3-super-120b-a12b";

const MAX_QUERY_CHARS = 300;
const MAX_SUBQUERIES = 6;
const MAX_PAGES = 8;
const MAX_PAGE_BYTES = 1_000_000;
const PAGE_TIMEOUT_MS = 8000;
const MAX_EXTRACT_CHARS = 5000;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// SSRF guard: the page reader fetches user-influenced URLs server-side.
// Block redirects to internal/metadata targets (AWS/GCP/Azure metadata,
// loopback, private ranges, non-http schemes). Checked BEFORE each fetch
// and after every redirect hop.
const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^\[?::1\]?$/,
  /^\[?fc00:/i,
  /^\[?fd/i,
  /^\[?fe80:/i,
  /\.local$/i,
  /metadata\.google\.internal$/i,
];
const BLOCKED_HOSTS = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "169.254.169.254",
]);

function isPublicHttpUrl(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname;
  if (!host || BLOCKED_HOSTS.has(host.toLowerCase())) return false;
  return !BLOCKED_HOST_PATTERNS.some((re) => re.test(host));
}

async function callPlanner(userPrompt: string): Promise<string | null> {
  try {
    const call = await callChat({
      model: PLANNER_MODEL,
      messages: [
        { role: "system", content: "You output only valid JSON. No prose, no markdown fences." },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      // Nemotron siblings reason before answering - 500 tokens starved the
      // JSON plan and dropped us on the fallback query more often than not.
      max_tokens: 900,
      timeoutMs: 50_000,
    });
    if (!call.ok || !call.response) return null;
    const data = await call.response.json();
    const content: string = data?.choices?.[0]?.message?.content || "";
    return content || null;
  } catch {
    return null;
  }
}

interface ResearchBody {
  stage?: string;
  question?: string;
  format?: string;
  urls?: Array<{ url: string; title?: string; snippet?: string }>;
}

export async function POST(req: Request) {
  const denied = guardApi(req, { perMinute: 120, perDay: 5000 });
  if (denied) return denied;

  let body: ResearchBody;
  try {
    body = (await req.json()) as ResearchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ===== Stage: plan =====
  // The plan stage is research's only LLM call (search + page reads are
  // plain HTTP; synthesis runs through /api/chat) — cap it like Noor.
  if (body.stage === "plan") {
    const deviceId = String(req.headers.get("x-orleia-device") || "").slice(0, 64);
    // Fails open during storage outages - chat must never depend on billing.
    let cap: Awaited<ReturnType<typeof consumeNoorTurn>>;
    try {
      cap = await consumeNoorTurn(deviceId);
    } catch (err) {
      console.error("[research] usage tracking unavailable, failing open:", err);
      cap = { ok: true, used: 0, limit: Number.POSITIVE_INFINITY, tier: "free" };
    }
    if (!cap.ok) {
      return NextResponse.json(
        { error: "noor_daily_cap", overCap: true, limit: cap.limit, used: cap.used, tier: cap.tier },
        { status: 402 }
      );
    }
    const question = typeof body.question === "string" ? body.question.trim().slice(0, MAX_QUERY_CHARS) : "";
    if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });
    const forceFormat =
      typeof body.format === "string" && ["brief", "report", "presentation", "actions"].includes(body.format)
        ? (body.format as "brief" | "report" | "presentation" | "actions")
        : undefined;

    const raw = await callPlanner(buildPlannerPrompt(question, forceFormat as never));
    if (!raw) {
      // Fallback plan: single query, report format
      return NextResponse.json({ plan: { query: question.slice(0, 80), subQueries: [question], format: (forceFormat || "report") as import("@/lib/research").ResearchFormat } });
    }
    try {
      const plan = coercePlan(extractJSON(raw));
      if (plan) {
        if (forceFormat) plan.format = forceFormat as import("@/lib/research").ResearchFormat;
        return NextResponse.json({ plan });
      }
    } catch {
      // fall through to fallback
    }
    return NextResponse.json({ plan: { query: question.slice(0, 80), subQueries: [question], format: (forceFormat || "report") as import("@/lib/research").ResearchFormat } });
  }

  // ===== Stage: read =====
  if (body.stage === "read") {
    const urls = Array.isArray(body.urls) ? body.urls.slice(0, MAX_PAGES) : [];
    if (!urls.length) return NextResponse.json({ pages: [] });

    const pages = await Promise.all(
      urls.map(async (entry): Promise<{ url: string; title: string; extract: string; ok: boolean }> => {
        const url = isPublicHttpUrl(entry.url) ? entry.url : "";
        if (!url) return { url: entry.url || "", title: entry.title || "", extract: "", ok: false };
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
          const res = await fetch(url, {
            headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
            redirect: "manual", // each hop is SSRF-checked below
            signal: controller.signal,
          });
          let finalRes: Response = res;
          for (let hops = 0; hops < 5; hops++) {
            const loc = finalRes.headers.get("location");
            if (finalRes.status >= 300 && finalRes.status < 400 && loc) {
              let next: URL;
              try {
                next = new URL(loc, url);
              } catch {
                return { url, title: entry.title || "", extract: "", ok: false };
              }
              if (!isPublicHttpUrl(next.href)) {
                return { url, title: entry.title || "", extract: "", ok: false };
              }
              const hopRes = await fetch(next.href, {
                headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
                redirect: "manual",
                signal: controller.signal,
              });
              finalRes = hopRes;
            } else break;
          }
          const res2 = finalRes;
          clearTimeout(timer);
          if (!res2.ok) return { url, title: entry.title || "", extract: "", ok: false };
          const type = res2.headers.get("content-type") || "";
          if (type && !type.includes("html") && !type.includes("text")) {
            return { url, title: entry.title || "", extract: "", ok: false };
          }
          const buf = await res2.arrayBuffer();
          if (buf.byteLength > MAX_PAGE_BYTES) {
            // Read a prefix — enough for the extraction
            const text = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, MAX_PAGE_BYTES));
            return { url, title: entry.title || "", extract: extractText(text), ok: true };
          }
          const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
          return { url, title: entry.title || "", extract: extractText(html), ok: true };
        } catch {
          return { url, title: entry.title || "", extract: "", ok: false };
        }
      })
    );

    return NextResponse.json({ pages });
  }

  return NextResponse.json({ error: "unknown stage" }, { status: 400 });
}

// ===== HTML -> text extraction =====

function extractText(html: string): string {
  let t = html;

  // Drop script/style/noscript/svg blocks entirely
  t = t.replace(/<script[\s\S]*?<\/script>/gi, " ");
  t = t.replace(/<style[\s\S]*?<\/style>/gi, " ");
  t = t.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  t = t.replace(/<svg[\s\S]*?<\/svg>/gi, " ");

  // Block-level tags become paragraph breaks
  t = t.replace(/<\/(p|div|section|article|li|h[1-6]|tr|blockquote|figcaption)>/gi, "\n");
  t = t.replace(/<(br|hr)\s*\/?>/gi, "\n");

  // Strip remaining tags
  t = t.replace(/<[^>]+>/g, " ");

  // Decode common entities
  t = t
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => {
      const code = parseInt(d, 10);
      return code > 0 && code < 65536 ? String.fromCharCode(code) : " ";
    });

  // Collapse whitespace
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/\n\s*\n+/g, "\n\n");
  t = t.trim();

  return t.slice(0, MAX_EXTRACT_CHARS);
}
