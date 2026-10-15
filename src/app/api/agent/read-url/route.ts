import { NextResponse } from "next/server";
import { guardApi } from "@/lib/apiGuard";
import { safeFetchText, SsrfError } from "@/lib/ssrf";

export const runtime = "nodejs";
export const maxDuration = 30;

// Agent's "read this page" tool: fetch a URL server-side and extract the
// readable text so Agent can reason over pages outside Orleia. Guarded like
// every other endpoint (rate limit, size cap) and SSRF-hardened via
// lib/ssrf: scheme/port/hostname policy, DNS resolution checked against
// private ranges, connection pinned to the validated IP (no rebinding),
// redirects re-validated on every hop. Text only - never evaluated.

function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: Request) {
  const denied = guardApi(req, { perMinute: 20, perDay: 500 });
  if (denied) return denied;
  const len = Number(req.headers.get("content-length") || 0);
  if (len > 8 * 1024) return NextResponse.json({ error: "payload too large" }, { status: 413 });

  let url = "";
  try {
    const body = (await req.json()) as { url?: string };
    url = String(body.url || "");
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  let result;
  try {
    result = await safeFetchText(url, {
      timeoutMs: 15_000,
      maxBytes: 2_000_000,
      maxRedirects: 5,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OrleiaAgent/2.5; +https://orleia.app)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
    });
  } catch (e) {
    if (e instanceof SsrfError) {
      return NextResponse.json({ error: e.message }, { status: e.blocked ? 400 : 502 });
    }
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }

  const ctype = result.contentType;
  if (!/text\/html|text\/plain|application\/xhtml|application\/json|text\/xml|application\/xml/.test(ctype)) {
    return NextResponse.json({ error: "unsupported content type" }, { status: 415 });
  }
  const isHtml = /text\/html|application\/xhtml/.test(ctype);
  const raw = result.text;
  const text = isHtml ? extractText(raw) : raw.replace(/\s+/g, " ").trim();
  const titleM = isHtml ? raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) : null;
  return NextResponse.json({
    url: result.finalUrl,
    title: titleM ? extractText(titleM[1]).slice(0, 200) : "",
    text: text.slice(0, 12_000),
  });
}
