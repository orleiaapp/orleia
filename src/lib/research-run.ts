"use client";

// ============================================================
// Deep research pipeline (the engine behind Noor's research mode),
// extracted so any surface can run it - the Noor page keeps its own
// stage-UI wrapper, and Scout (pet chats) runs the same plan →
// search → read → synthesize pass and gets a cited findings reply.
//
// Pure client orchestration: every stage stays under serverless
// limits. Prompts/parsers live in ./research.
// ============================================================

import type { AISource } from "@/types";
import { compactUrl } from "./utils";
import type {
  ResearchFormat,
  ResearchPage,
  ResearchPlan,
  ResearchResult,
  ResearchSource,
} from "./research";
import { getDeviceId } from "./device-id";

export interface ResearchRunResult {
  /** Chat-ready reply (title + findings + numbered sources). */
  content: string;
  sources: AISource[];
  research: ResearchResult;
}

export interface ResearchRunOpts {
  /** Stage progress for the UI ("Searching: a · b · c"). */
  onStage?: (detail: string) => void;
  /** Force a deliverable format (brief/report/...). */
  format?: ResearchFormat;
}

/** True when a message is asking for live/web research worth a full run. */
export function wantsResearch(q: string): boolean {
  return (
    /\b(research|look up|search (the )?web|web search|find out about|investigate|deep dive)\b/i.test(q) ||
    /^\s*(research|search|look up|find out|investigate)\b/i.test(q)
  );
}

/** One sub-query fan-out through the existing /api/search endpoint. */
async function fetchWebSources(q: string): Promise<AISource[]> {
  try {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: q.slice(0, 300) }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: { title: string; url: string; snippet: string }[];
    };
    return (data.results || []).map((r) => ({
      kind: "web" as const,
      id: r.url,
      title: r.title,
      snippet: r.snippet,
      href: r.url,
    }));
  } catch {
    return [];
  }
}

/** Markdown → chat-readable text (pet bubbles are plain pre-wrap). */
function mdToPlain(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chatReply(result: ResearchResult): string {
  const d = result.deliverable;
  const parts: string[] = [d.title || "Research findings"];
  if (d.tldr) parts.push(d.tldr);
  for (const s of (d.sections || []).slice(0, 6)) {
    const body = mdToPlain(s.body || "");
    if (!body) continue;
    parts.push(`${s.heading}\n${body.slice(0, 900)}`);
  }
  if (d.actionItems?.length) {
    parts.push(
      "Next steps\n" +
        d.actionItems
          .slice(0, 6)
          .map((a) => `• [${a.priority}] ${a.task}`)
          .join("\n")
    );
  }
  // Compact, clickable: the link TEXT is a short URL (host + path), the
  // href keeps the full one - long raw URLs made this list unreadable.
  const links = result.sources
    .slice(0, 6)
    .map((s, i) => `${i + 1}. [${compactUrl(s.url)}](${s.url})`)
    .join("\n");
  if (links) parts.push(`Sources\n${links}`);
  return parts.join("\n\n");
}

/**
 * Run the full research pipeline for `question` and return a cited reply.
 * Throws Error("no results") when the web yields nothing usable, or a
 * generic Error on a mid-pipeline failure - callers decide how to say it.
 */
export async function runResearchPipeline(
  question: string,
  opts: ResearchRunOpts = {}
): Promise<ResearchRunResult> {
  const onStage = opts.onStage ?? (() => {});

  // Stage 1: plan
  onStage("Planning research...");
  const planRes = await fetch("/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-orleia-device": getDeviceId() },
    body: JSON.stringify({ stage: "plan", question: question.slice(0, 300), format: opts.format }),
  });
  const planData = (await planRes.json()) as { plan?: ResearchPlan };
  const plan: ResearchPlan =
    planData.plan || { query: question.slice(0, 80), subQueries: [question], format: opts.format || "report" };

  // Stage 2: fan out searches
  onStage(`Searching: ${plan.subQueries.slice(0, 3).join(" · ")}`);
  const searchLists = await Promise.all(plan.subQueries.slice(0, 5).map((sq) => fetchWebSources(sq)));
  const merged = new Map<string, AISource>();
  const collect = (list: AISource[]) => {
    for (const src of list) {
      if (src.kind !== "web" || !src.href) continue;
      const key = src.id || src.href || src.title;
      if (!merged.has(key)) merged.set(key, src);
    }
  };
  for (const list of searchLists) collect(list);
  let sources: AISource[] = Array.from(merged.values()).slice(0, 12);
  // Sub-queries can whiff (planner wrote sentences, engines rate-limited
  // under the burst). One retry with the cleaned core query.
  if (!sources.length && plan.query) {
    collect(await fetchWebSources(plan.query));
    sources = Array.from(merged.values()).slice(0, 12);
  }
  if (!sources.length) throw new Error("no results");

  // Stage 3: read top pages server-side
  onStage(`Reading ${Math.min(5, sources.length)} pages...`);
  let pages: ResearchPage[] = [];
  // Google News wrapper links are JS shells - the target URL is embedded
  // client-side and cannot be unwrapped server-side.
  const readable = sources.filter((s) => !/news\.google\.com\/rss\/articles/i.test(String(s.href)));
  try {
    const readRes = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-orleia-device": getDeviceId() },
      body: JSON.stringify({
        stage: "read",
        urls: readable.slice(0, 5).map((s) => ({ url: s.href, title: s.title })),
      }),
    });
    const readData = (await readRes.json()) as { pages?: ResearchPage[] };
    pages = readData.pages || [];
  } catch {
    pages = [];
  }

  // Stage 4: synthesize a cited deliverable
  onStage("Synthesizing findings...");
  const researchSources: ResearchSource[] = sources.map((s, i) => ({
    id: String(i + 1),
    title: s.title,
    url: (s.href as string) || "",
    snippet: s.snippet || "",
  }));
  const { buildSynthesizerPrompt, extractJSON, coerceDeliverable, isInconclusive, buildInconclusiveRetryContext } =
    await import("./research");

  const synthPrompt = buildSynthesizerPrompt({
    question,
    format: plan.format,
    sources: researchSources,
    pages,
  });
  const synthRes = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-orleia-device": getDeviceId() },
    body: JSON.stringify({
      model: "nvidia/nemotron-3-super-120b-a12b",
      // Keep the prompt inside the live sibling's comfort zone: a 40k-char
      // prompt + 4k output blew the 55s route timeout once the primary went
      // EOL and the smaller fallback had to answer.
      messages: [{ role: "user", content: synthPrompt.slice(0, 16000) }],
      temperature: 0.4,
      maxTokens: 2600,
      situation: `RESEARCH OUTPUT FORMAT CONTRACT: Respond with ONLY the JSON deliverable object. No prose before or after.`,
    }),
  });
  if (!synthRes.ok) throw new Error("synthesis failed");
  const synthData = (await synthRes.json()) as { content?: string };
  let deliverable = coerceDeliverable(extractJSON(synthData.content || ""), plan.format);

  // Bogus null-result guard: escalate ONCE to the strongest model.
  if (isInconclusive(deliverable)) {
    onStage("Verifying against sources...");
    const retryCtx = buildInconclusiveRetryContext(question, deliverable as NonNullable<typeof deliverable>);
    const retryRes = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-orleia-device": getDeviceId() },
      body: JSON.stringify({
        model: "nvidia/nemotron-3-ultra-550b-a55b",
        messages: [{ role: "user", content: [retryCtx, synthPrompt.slice(0, 14000)].join("\n\n") }],
        temperature: 0.3,
        maxTokens: 2600,
        situation: `RESEARCH OUTPUT FORMAT CONTRACT: Respond with ONLY the JSON deliverable object. No prose before or after.`,
      }),
    });
    if (retryRes.ok) {
      const retryData = (await retryRes.json()) as { content?: string };
      const retryOut = coerceDeliverable(extractJSON(retryData.content || ""), plan.format);
      if (retryOut && !isInconclusive(retryOut)) deliverable = retryOut;
    }
  }

  if (!deliverable) throw new Error("Could not structure the findings. Try again.");

  const research: ResearchResult = {
    plan,
    pages: pages.map((p) => ({ url: p.url, title: p.title, extract: "", ok: p.ok })),
    sources: researchSources,
    deliverable,
    createdAt: new Date().toISOString(),
  };
  return { content: chatReply(research), sources, research };
}
