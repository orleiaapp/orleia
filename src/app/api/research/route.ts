import { NextResponse } from "next/server";
import { guardApi } from "@/lib/apiGuard";
import { safeFetchText, SsrfError } from "@/lib/ssrf";
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

// SSRF: the page reader fetches user-influenced URLs server-side. All URL
// policy (scheme/port/hostname, DNS resolution against private ranges,
// connection pinning, per-hop redirect validation) lives in lib/ssrf —
// regex denylists alone miss IPv6-mapped forms, trailing-dot hosts and
// DNS rebinding.

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
        if (typeof entry.url !== "string" || !entry.url) {
          return { url: "", title: entry.title || "", extract: "", ok: false };
        }
        try {
          const result = await safeFetchText(entry.url, {
            timeoutMs: PAGE_TIMEOUT_MS,
            maxBytes: MAX_PAGE_BYTES,
            maxRedirects: 5,
            headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
          });
          if (result.status < 200 || result.status >= 300) {
            return { url: entry.url, title: entry.title || "", extract: "", ok: false };
          }
          const type = result.contentType;
          if (type && !type.includes("html") && !type.includes("text")) {
            return { url: entry.url, title: entry.title || "", extract: "", ok: false };
          }
          return { url: result.finalUrl, title: entry.title || "", extract: extractText(result.text), ok: true };
        } catch (e) {
          // SsrfError (blocked host) or network failure — page just fails.
          if (!(e instanceof SsrfError)) console.error("[research] page read failed:", (e as Error)?.message || e);
          return { url: entry.url, title: entry.title || "", extract: "", ok: false };
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
