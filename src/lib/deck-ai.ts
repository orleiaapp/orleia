import type { DeckSlide, AIMessage, AIModel } from "@/types";
import { chat } from "./ai";

export interface GeneratedOutline {
  title: string;
  description: string;
  slides: Array<Partial<DeckSlide> & { layout: DeckSlide["layout"]; title: string }>;
}

const SYSTEM_HINT = `You are a world-class presentation architect in the tradition of Barbara Minto and Michael Alley. You build decks with ASSERTION-EVIDENCE structure: every content slide's title is a full sentence that states the takeaway (the assertion), and the slide body carries the evidence for it. Body text is forbidden in titles; claims are forbidden in bodies.

Respond with ONLY a JSON object, no prose, no markdown fences:
{
  "title": "Deck title",
  "description": "One sentence: what this deck argues and for whom",
  "slides": [
    {
      "layout": "title | section | bullets | statement | stats | two-col | timeline | quote | end",
      "kicker": "optional 1-3 word label or number like '01 · Problem'",
      "title": "assertion headline (see rules)",
      "content": ["evidence lines, max 12 words each"],
      "stats": [{"value": "38%", "label": "week-4 retention"}],
      "contentRight": ["right column line (two-col only)"],
      "notes": "speaker notes: what to SAY that is not on the slide, 2 sentences"
    }
  ]
}

STRUCTURE RULES (pick a narrative arc, do not list topics):
1. Arc = tension -> insight -> resolution. Open with the stakes, not an agenda.
2. Title slide: layout "title", content[0] is a one-line promise to the audience.
3. Content slides alternate evidence types: bullets for reasons, stats for proof, two-col for contrast/comparisons, timeline for sequences. Never 5 bullets slides in a row.
4. Insert one "statement" slide (single bold sentence) at the emotional pivot of the arc.
5. Include exactly one "quote" slide only if a real, attributable quote serves the argument; otherwise skip it.
6. Close with "end": a call to action or the single sentence you want remembered.

HEADLINE RULES (the anti-slop core):
- Every "bullets"/"stats"/"two-col"/"timeline" title MUST be a complete sentence asserting something arguable, e.g. "Retention triples when onboarding takes under a minute", NOT "Retention" or "Key metrics" or "Overview".
- No colons in headlines. No "Introduction", "Agenda", "About us", "Features", "Summary".
- Numbers in headlines beat adjectives: "Support tickets fell 40% after the redesign" not "Improved support".

EVIDENCE RULES:
- bullets: 2-4 lines, each a claim with its reason ("Churn dropped because setup went from 9 steps to 2"), never naked nouns.
- stats: exactly 3 items; value is short ("38%", "4.8x", "1,200"), label is 2-5 words. If the user gave no data, use bracketed placeholders like ["[your MRR]", "month-over-month growth"].
- two-col: left column lines go in "content" (2-3 lines), right column lines go in "contentRight" (1-2 lines). The two columns should contrast or complement: claim vs counterclaim, in-scope vs out-of-scope, us vs them.
- timeline: "stats" holds the milestones as [{"value":"Q1 2026","label":"Launch v1"}], 3-5 items.
- quote: title is the quote (max 25 words), content[0] is "Author, role or source".
- content lines are never full paragraphs. No emoji. No filler like "exciting" or "cutting-edge".

Use bracketed placeholders for any fact you do not know - never invent statistics.
Match the user's language. Length: 8-14 slides unless the user specifies.`;

function extractJSON(raw: string): unknown {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) text = text.slice(start, end + 1);
  return JSON.parse(text);
}

const VALID_LAYOUTS = ["title", "section", "bullets", "statement", "stats", "two-col", "timeline", "quote", "end"];

function coerceOutline(parsed: unknown): GeneratedOutline | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const rawSlides = Array.isArray(obj.slides) ? obj.slides : [];
  const slides = rawSlides
    .map((s): GeneratedOutline["slides"][number] | null => {
      if (!s || typeof s !== "object") return null;
      const so = s as Record<string, unknown>;
      const layout = typeof so.layout === "string" && VALID_LAYOUTS.includes(so.layout) ? so.layout : "bullets";
      const title = typeof so.title === "string" ? so.title.trim() : "";
      if (!title) return null;
      const content = Array.isArray(so.content)
        ? so.content.filter((c): c is string => typeof c === "string" && c.trim().length > 0).map((c) => c.trim())
        : [];
      const kicker = typeof so.kicker === "string" ? so.kicker.trim() : "";
      const notes = typeof so.notes === "string" ? so.notes.trim() : "";
      const contentRight = Array.isArray(so.contentRight)
        ? so.contentRight.filter((c): c is string => typeof c === "string" && c.trim().length > 0).map((c) => c.trim())
        : undefined;
      let stats: Array<{ value: string; label: string }> | undefined;
      if (Array.isArray(so.stats)) {
        const items = so.stats
          .map((st): { value: string; label: string } | null => {
            if (!st || typeof st !== "object") return null;
            const sto = st as Record<string, unknown>;
            const value = typeof sto.value === "string" ? sto.value.trim() : "";
            const label = typeof sto.label === "string" ? sto.label.trim() : "";
            return value || label ? { value, label } : null;
          })
          .filter((st): st is { value: string; label: string } => st !== null);
        if (items.length) stats = items;
      }
      return { layout: layout as DeckSlide["layout"], kicker: kicker || undefined, title, content, contentRight, stats, notes };
    })
    .filter((s): s is GeneratedOutline["slides"][number] => s !== null);

  if (slides.length < 2) return null;
  return {
    title: typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : "Untitled deck",
    description: typeof obj.description === "string" ? obj.description.trim() : "",
    slides,
  };
}

const VALID_MODELS = ["novella-hyperfast", "novella-low", "novella-medium", "novella-high", "novella-max", "novella-ultra", "novella-hyper", "fast-1", "core-1", "agent-1"];

export async function generateDeckOutline(
  prompt: string,
  modelId: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<GeneratedOutline> {
  const model = VALID_MODELS.includes(modelId) ? (modelId as AIModel) : "novella-medium";
  const query = `Create a presentation outline for: ${prompt}`;
  const toAIMessage = (m: { role: "user" | "assistant"; content: string }, i: number): AIMessage => ({
    id: "gen-" + i,
    timestamp: new Date().toISOString(),
    role: m.role,
    content: m.content,
  });
  const messages: AIMessage[] = [...history.map(toAIMessage), toAIMessage({ role: "user", content: query }, -1)];

  const raw = await chat(messages[messages.length - 1].content, messages.slice(0, -1), model, {
    extraSystem: SYSTEM_HINT,
  });
  if (!raw) throw new Error("Noor did not respond. Try again.");

  try {
    const outline = coerceOutline(extractJSON(raw));
    if (outline) return outline;
  } catch {
    // fall through to repair pass
  }

  // One repair pass: ask the model to fix its own JSON
  const repairRaw = await chat(
    `The following was supposed to be a JSON presentation outline but was invalid. Return ONLY the corrected JSON object, nothing else:\n\n${raw.slice(0, 4000)}`,
    [],
    model,
    { extraSystem: "Return only valid JSON matching the outline schema. No prose, no fences." }
  );
  if (repairRaw) {
    try {
      const outline = coerceOutline(extractJSON(repairRaw));
      if (outline) return outline;
    } catch {
      // fall through
    }
  }

  throw new Error("Could not parse Noor's outline. Try rephrasing your prompt.");
}
