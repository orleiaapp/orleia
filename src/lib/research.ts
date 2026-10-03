// ============================================================
// Web Search 2.0 — Deep Research pipeline for Noor.
//
// Client-orchestrated stages (each stays under serverless limits):
//   1. plan       -> sub-queries + output format        (/api/research)
//   2. fan out    -> parallel searches per sub-query    (/api/search, existing)
//   3. read       -> fetch + extract top pages          (/api/research)
//   4. synthesize -> cited deliverable                  (/api/chat + situation)
//
// Everything here is pure types/prompts/parsers — no fetch logic,
// so both the Noor page and tests can use them.
// ============================================================

export type ResearchFormat = "brief" | "report" | "presentation" | "actions";

export interface ResearchPlan {
  query: string; // cleaned search query
  subQueries: string[]; // 3-6 angles to fan out
  format: ResearchFormat;
}

export interface ResearchPage {
  url: string;
  title: string;
  extract: string; // cleaned text, ~5k chars
  ok: boolean; // false if fetch/extract failed
}

export interface ResearchSection {
  heading: string;
  body: string; // markdown, inline [n] citations
}

export interface ResearchActionItem {
  task: string;
  priority: "high" | "medium" | "low";
  context?: string;
}

export interface ResearchDeckSlide {
  layout: "title" | "section" | "bullets" | "statement" | "stats" | "two-col" | "timeline" | "quote" | "end";
  kicker?: string;
  title: string;
  content?: string[];
  contentRight?: string[];
  stats?: Array<{ value: string; label: string }>;
  notes?: string;
}

export interface ResearchDeliverable {
  format: ResearchFormat;
  title: string;
  tldr: string;
  sections: ResearchSection[];
  actionItems?: ResearchActionItem[];
  deck?: { title: string; description: string; slides: ResearchDeckSlide[] };
}export interface ResearchSource {
  id: string;
  title: string;
  url: string;
  snippet: string;
}

export interface ResearchResult {
  plan: ResearchPlan;
  pages: ResearchPage[];
  sources: ResearchSource[];
  deliverable: ResearchDeliverable;
  createdAt: string;
}

export const FORMAT_META: Record<ResearchFormat, { label: string; icon: string; hint: string }> = {
  brief: { label: "Brief", icon: "zap", hint: "TL;DR + key findings" },
  report: { label: "Report", icon: "file-text", hint: "Full sections with citations" },
  presentation: { label: "Presentation", icon: "presentation", hint: "Deck-ready slides" },
  actions: { label: "Action items", icon: "list-checks", hint: "Concrete next steps" },
};

// ===== Planner prompt =====

export function buildPlannerPrompt(question: string, forceFormat?: ResearchFormat): string {
  const formatRule = forceFormat
    ? `\n"format": must be "${forceFormat}" (the user explicitly requested this format).`
    : `\n"format": one of "brief" | "report" | "presentation" | "actions", chosen by what best serves the question:
  - "brief" for quick factual questions or news lookups
  - "report" for comparison / analysis / how-does-X-work questions
  - "presentation" when the user says present / slides / pitch / deck / for my team
  - "actions" for "what should I do" / decision / plan questions`;

  return `You are a research planner. Break the user's question into parallel web searches.

USER'S QUESTION (this is what the searches must cover):
${question}

Respond with ONLY a JSON object, no prose, no fences:
{
  "query": "cleaned keyword search query (3-8 words, no filler)",
  "subQueries": ["distinct angle 1", "distinct angle 2", "..."],
  "format": "brief"${"" /* replaced below */}
}${formatRule}

RULES:
- 3 to 5 subQueries. Each is a real search query (keywords, not sentences) covering a DIFFERENT angle: definitions, current state, comparisons, criticisms, data/statistics, recent developments.
- Every subQuery and "query" MUST be keyword-style: product names, entities, version numbers, 3-8 words, no filler words like "the", "of", "what", "latest news about".
- For questions about the newest version of a product, at least one subQuery must name the product + vendor + words like release / announcement / version (e.g. "OpenAI newest GPT model announcement", not "news about ChatGPT").
- "query" is the single best search for the core question.
- Never guess a year: for recency questions use keywords like "latest", "recent", "2026" only if the question names a year - an assumed year in a subQuery steers the search to stale results.
- Never answer the question. Plan only.`;
}

// ===== Synthesizer prompt =====

export function buildSynthesizerPrompt(result: {
  question: string;
  format: ResearchFormat;
  sources: Array<{ id: string; title: string; url: string; snippet: string }>;
  pages: ResearchPage[];
}): string {
  const sourceLines = result.sources
    .map((s, i) => `[${i + 1}] "${s.title}" — ${s.url}\n    snippet: ${s.snippet.slice(0, 200)}`)
    .join("\n");
  const pageLines = result.pages
    .filter((p) => p.ok && p.extract)
    .map((p, i) => {
      const idx = result.sources.findIndex((s) => s.url === p.url) + 1;
      return `--- PAGE ${idx} (${p.title}) ---\n${p.extract}`;
    })
    .join("\n\n");

  const formatSpec: Record<ResearchFormat, string> = {
    brief: `"sections": 3-5 sections, each heading = the finding asserted as a sentence, body = 2-4 sentences of evidence with [n] citations.`,
    report: `"sections": 4-7 sections. First section heading is "Overview". Later headings assert the section's takeaway as a full sentence. Bodies are 1-2 paragraphs with [n] citations on every claim.`,
    presentation: `ALSO include "deck": { "title", "description", "slides": [...] } with 8-12 slides. Every content slide title must be a full assertion sentence (never "Overview"/"Key Points"). Use layouts: title (first), section (dividers), bullets (evidence lines with reasons), stats (exactly 3 items, only for numbers present in the sources), statement (one bold sentence at the pivot), two-col (contrast), quote (only a quote that appears in the sources, with attribution), end (last). Put evidence lines in "content", right-column lines in "contentRight", stat/timeline items in "stats" as {"value","label"}. Speaker notes in "notes" say what to SAY beyond the slide. The "sections" array still holds the report-style content with citations.`,
    actions: `"sections": 1-2 sections of context. ALSO include "actionItems": 4-8 items, each {"task": "specific imperative step", "priority": "high|medium|low", "context": "why, with [n] citation"}. Tasks must be concrete and doable, not "research more".`,
  };

  return `You are a research synthesizer. Write a cited deliverable from the sources below.

Respond with ONLY a JSON object, no prose, no fences:
{
  "title": "deliverable title",
  "tldr": "2-3 sentence executive summary",
  "sections": [{"heading": "...", "body": "markdown with [n] citations"}],
  "actionItems": [{"task": "...", "priority": "high", "context": "..."}],
  "deck": { "title": "...", "description": "...", "slides": [...] }
}
Omit "actionItems" unless format is "actions". Omit "deck" unless format is "presentation".

FORMAT ("${result.format}"): ${formatSpec[result.format]}

CITATION RULES:
- Every factual claim carries an [n] citation matching the numbered sources.
- Never invent facts, numbers, or quotes. If sources conflict, say so in the text.
- If evidence is thin, say so plainly instead of padding.

HEADLINES ARE EVIDENCE (critical):
- For news sources, the headline is a first-class claim: "OpenAI unveils GPT-6 Astra - CNBC" asserts the fact itself. If the headline answers the question, that IS the answer.
- When 2+ independent publishers headline the same fact, treat it as CONFIRMED: state it plainly in the tldr as the direct answer and cite them. Never label a headline-supported answer as inconclusive, unverified-by-content, or "requires further research".

NULL-RESULT RULE (only when genuinely empty):
- Set "title" to "Inconclusive" ONLY if NO source relates to the question at all. Then write ONE section ("What the sources show") with the closest related facts, each cited.
- If sources DO discuss the topic (even headlines only), you must answer the question from them. A report that says "sources lack substantive information" while the cited headlines state the answer verbatim is a failure.
- Never fill sections by restating that information is missing, and never recommend consulting official sources as body content.

STYLE RULES (anti-slop):
- Headings assert; bodies prove. No "Introduction", "Background", "Conclusion" headings.
- No filler adjectives ("cutting-edge", "exciting"). No emoji.
- Bodies are tight: no paragraph repeats the same claim twice.

QUESTION: ${result.question}

NUMBERED SOURCES (cite these as [n]):
${sourceLines}

PAGE EXTRACTS (fuller text from the top pages — prefer these over snippets):
${pageLines || "(no page extracts — judge from the headlines and snippets below; news headlines that directly answer the question are valid evidence, and multiple independent publishers making the same claim means the fact is confirmed)"}`;
}

// ===== Null-result guard =====

// Phrases the synthesizer emits when it wrongly declares a null result even
// though the numbered sources answer the question (headlines assert facts).
const NULL_PATTERNS: RegExp[] = [
  /\binconclusive\b/i,
  /\bno (substantive|relevant|direct|clear) (information|answer|details|evidence|mention)/i,
  /\b(contain|contains|containing) no (mention|information|details|reference|answer)\b/i,
  /\bno mention\b/i,
  /\b(do not|does not|don't|cannot|can not|couldn't|could not) (contain|include|mention|discuss|address|provide|state|reveal|identify|support)\b/i,
  /\b(sources?|extracts?|headlines?|materials?) (lack|lacks|are silent|are unrelated|are inconclusive|are insufficient)\b/i,
  /\b(cannot|can not|couldn't|could not) be (cited|determined|extracted|derived|answered|established|confirmed)\b/i,
  /\bnot possible to (cite|determine|extract|answer|confirm)\b/i,
  /\b(further|additional) (research|sources?|investigation|verification)\b.{0,40}\b(required|needed)\b/i,
];

/**
 * Detects the synthesizer's bogus "null result" verdicts — reports saying
 * "the sources don't answer this" while the cited headlines literally assert
 * the answer. Title/tldr hits are strong signals; section hits only count
 * when they dominate (a legitimate report can quote a negative fact once).
 */
export function isInconclusive(d: ResearchDeliverable | null): boolean {
  if (!d) return false;
  if (NULL_PATTERNS.some((re) => re.test(d.title))) return true;
  if (NULL_PATTERNS.some((re) => re.test(d.tldr))) return true;
  const flagged = d.sections.filter((s) => NULL_PATTERNS.some((re) => re.test(`${s.heading}\n${s.body}`))).length;
  if (d.sections.length > 0 && flagged === d.sections.length) return true;
  if (d.sections.length <= 2 && flagged >= 1) return true;
  return false;
}

/**
 * Escalation block appended on retry when the first synthesis came back as a
 * bogus null result. The call is stateless, so the model must be told its
 * previous verdict was rejected and why.
 */
export function buildInconclusiveRetryContext(question: string, previous: ResearchDeliverable): string {
  return [
    "ESCALATION — YOUR PREVIOUS ATTEMPT WAS REJECTED.",
    `Question: "${question}"`,
    `You returned title "${previous.title}" and claimed the sources do not answer it. That verdict is WRONG.`,
    "The numbered sources below DO relate to the question — several headlines assert the answer directly.",
    "Headlines are evidence: a headline like 'OpenAI unveils X - CNBC' IS a sourced assertion that X happened.",
    "When 2+ independent publishers headline the same fact, the fact is confirmed — state it plainly and cite them.",
    "",
    "Rewrite the deliverable AS AN ANSWER:",
    "- The tldr states the answer in the first sentence, with citations.",
    "- Sections prove the answer with facts, dates, names, numbers drawn from the sources.",
    "- Never use the words 'inconclusive', 'unverified', or 'further research required' in title, tldr, or bodies.",
    "- Only if literally ZERO sources share a topical word with the question may you return a null result.",
  ].join("\n");
}

// ===== JSON extraction + coercion =====

export function extractJSON(raw: string): unknown {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) text = text.slice(start, end + 1);
  return JSON.parse(text);
}

export function coercePlan(parsed: unknown): ResearchPlan | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const query = typeof o.query === "string" ? o.query.trim() : "";
  const subs = Array.isArray(o.subQueries)
    ? o.subQueries.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim())
    : [];
  const format = typeof o.format === "string" && ["brief", "report", "presentation", "actions"].includes(o.format)
    ? (o.format as ResearchFormat)
    : "report";
  if (!subs.length) return null;
  return { query: query || subs[0], subQueries: subs.slice(0, 6), format };
}

export function coerceDeliverable(parsed: unknown, format: ResearchFormat): ResearchDeliverable | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const title = typeof o.title === "string" && o.title.trim() ? o.title.trim() : "Research";
  const tldr = typeof o.tldr === "string" ? o.tldr.trim() : "";
  const rawSections = Array.isArray(o.sections) ? o.sections : [];
  const sections: ResearchSection[] = rawSections
    .map((s): ResearchSection | null => {
      if (!s || typeof s !== "object") return null;
      const so = s as Record<string, unknown>;
      const heading = typeof so.heading === "string" ? so.heading.trim() : "";
      const body = typeof so.body === "string" ? so.body.trim() : "";
      if (!heading && !body) return null;
      return { heading: heading || "Findings", body };
    })
    .filter((s): s is ResearchSection => s !== null);
  if (!sections.length && !tldr) return null;

  let actionItems: ResearchActionItem[] | undefined;
  if (format === "actions" && Array.isArray(o.actionItems)) {
    const items = o.actionItems
      .map((a): ResearchActionItem | null => {
        if (!a || typeof a !== "object") return null;
        const ao = a as Record<string, unknown>;
        const task = typeof ao.task === "string" ? ao.task.trim() : "";
        if (!task) return null;
        const priority = typeof ao.priority === "string" && ["high", "medium", "low"].includes(ao.priority) ? ao.priority : "medium";
        return { task, priority: priority as ResearchActionItem["priority"], context: typeof ao.context === "string" ? ao.context : undefined };
      })
      .filter((a): a is ResearchActionItem => a !== null);
    if (items.length) actionItems = items;
  }

  let deck: ResearchDeliverable["deck"] | undefined;
  if (format === "presentation" && o.deck && typeof o.deck === "object") {
    const d = o.deck as Record<string, unknown>;
    const rawSlides = Array.isArray(d.slides) ? d.slides : [];
    const slides = rawSlides
      .map((s): ResearchDeckSlide | null => {
        if (!s || typeof s !== "object") return null;
        const so = s as Record<string, unknown>;
        const layout = typeof so.layout === "string" && ["title", "section", "bullets", "statement", "stats", "two-col", "timeline", "quote", "end"].includes(so.layout)
          ? (so.layout as ResearchDeckSlide["layout"])
          : "bullets";
        const stitle = typeof so.title === "string" ? so.title.trim() : "";
        if (!stitle) return null;
        const content = Array.isArray(so.content) ? so.content.filter((c): c is string => typeof c === "string" && c.trim().length > 0).map((c) => c.trim()) : undefined;
        const contentRight = Array.isArray(so.contentRight) ? so.contentRight.filter((c): c is string => typeof c === "string" && c.trim().length > 0).map((c) => c.trim()) : undefined;
        let stats: Array<{ value: string; label: string }> | undefined;
        if (Array.isArray(so.stats)) {
          const items = so.stats
            .map((st): { value: string; label: string } | null => {
              if (!st || typeof st !== "object") return null;
              const sto = st as Record<string, unknown>;
              const v = typeof sto.value === "string" ? sto.value.trim() : "";
              const l = typeof sto.label === "string" ? sto.label.trim() : "";
              return v || l ? { value: v, label: l } : null;
            })
            .filter((st): st is { value: string; label: string } => st !== null);
          if (items.length) stats = items;
        }
        return {
          layout,
          kicker: typeof so.kicker === "string" && so.kicker.trim() ? so.kicker.trim() : undefined,
          title: stitle,
          content,
          contentRight,
          stats,
          notes: typeof so.notes === "string" ? so.notes.trim() : undefined,
        };
      })
      .filter((s): s is ResearchDeckSlide => s !== null);
    if (slides.length >= 2) {
      deck = {
        title: typeof d.title === "string" && d.title.trim() ? d.title.trim() : title,
        description: typeof d.description === "string" ? d.description.trim() : "",
        slides,
      };
    }
  }

  return { format, title, tldr, sections, actionItems, deck };
}

// ===== Markdown rendering for the chat message + storage =====

export function deliverableToMarkdown(d: ResearchDeliverable, sources: Array<{ title: string; url: string }>): string {
  const lines: string[] = [];
  lines.push(`# ${d.title}`);
  if (d.tldr) lines.push("", d.tldr);
  for (const s of d.sections) {
    lines.push("", `## ${s.heading}`, "", s.body);
  }
  if (d.actionItems?.length) {
    lines.push("", "## Action items", "");
    const pri: Record<string, string> = { high: "🔴", medium: "🟡", low: "🟢" };
    for (const a of d.actionItems) {
      lines.push(`- ${pri[a.priority] || "⚪"} **${a.task}**${a.context ? ` — ${a.context}` : ""}`);
    }
  }
  if (sources.length) {
    lines.push("", "## Sources", "");
    sources.forEach((s, i) => lines.push(`${i + 1}. [${s.title}](${s.url})`));
  }
  return lines.join("\n");
}
