import { NextResponse } from "next/server";
import { callChat } from "@/lib/ai-provider";
import { guardApi, bodyTooLarge } from "@/lib/apiGuard";

export const runtime = "nodejs";
export const maxDuration = 60;

// NVIDIA NIM vision: reads an attached image so Noor can "see" it.
//
// Two modes:
//   study    - homework / worksheets / diagrams. Classifies the image,
//              transcribes it verbatim, then actually works the problem.
//   describe - screen awareness and general "what is this" reading.
//
// Both run on the small 11B vision model (fast), with the 90B sibling as
// the provider-level fallback when the small one errors or is cold.

const VISION_MODEL = "meta/llama-3.2-11b-vision-instruct";

const STUDY_PROMPT = `You are Orleia's study reader. The user photographed a page, a worksheet or a screen to get help with it.

Reply in exactly this shape:
TYPE: <homework|math|diagram|notes|screenshot|document|photo|other>
TEXT: <transcribe every legible word, number and symbol, keeping the structure - equations, tables, numbered questions, multiple-choice options. If there is no readable text, write "(no legible text)".>
HELP: <then help with the actual content:
- homework / math / a question: solve it step by step. Show the reasoning and every calculation, then finish with "Answer: <final answer>".
- notes / screenshot with facts: summarise what it is and the key points.
- diagram: explain what it shows, labelled part by labelled part.
- photo: describe it precisely and concretely.>

Rules:
- Never invent letters, digits, symbols or details you cannot clearly see. Mark anything unreadable as [illegible].
- If the photographed question is cut off or ambiguous, say exactly what is missing instead of guessing.
- Keep it tight and useful: no preamble, no "certainly", no restating these instructions.`;

const DESCRIBE_PROMPT = `Describe this image precisely - shapes, colours, and any text exactly as it appears. Then, if it contains readable text, a diagram, a table, or a question, go beyond literal description: transcribe legible text, and if it is a question or assignment, work through it and give the answer. Never invent letters, symbols, or details you cannot clearly see - if something is illegible, say so plainly.`;

const KINDS = new Set([
  "homework",
  "math",
  "diagram",
  "notes",
  "screenshot",
  "document",
  "photo",
  "other",
]);

/**
 * Fallback classification when the model ignores the TYPE: line (it often
 * does on an obvious problem). Cheap keyword inference — no extra call.
 */
function inferKind(description: string): string {
  const t = description.toLowerCase();
  if (/\b(solve|equation|calculate|answer|homework|worksheet|exercise|formula)\b/.test(t)) {
    return "math";
  }
  if (/\b(diagram|flowchart|circuit|graph|labelled|labeled)\b/.test(t)) return "diagram";
  if (/\b(screenshot|toolbar|menu|settings page|button)\b/.test(t)) return "screenshot";
  if (/\b(notes?|summary|summarise|summarize|transcript)\b/.test(t)) return "notes";
  return "other";
}

/** Pull the TYPE: line off the model's reply. */
function splitType(raw: string): { description: string; kind: string } {
  const text = raw.trim();
  const m = text.match(/^TYPE:\s*([a-z]+)\b[^\n]*\n?/i);
  if (!m) return { description: text, kind: inferKind(text) };
  const kind = m[1].toLowerCase();
  const description = text.slice(m[0].length).trim();
  return {
    description,
    kind: KINDS.has(kind) && kind !== "other" ? kind : inferKind(description),
  };
}

export async function POST(req: Request) {
  const denied = guardApi(req, { perMinute: 120, perDay: 5000 });
  if (denied) return denied;

  try {
    if (bodyTooLarge(req, 8 * 1024 * 1024)) {
      return NextResponse.json({ error: "image too large" }, { status: 413 });
    }
    const body = (await req.json()) as {
      imageDataUrl?: unknown;
      hint?: unknown;
      mode?: unknown;
    };
    const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
    if (!imageDataUrl || imageDataUrl.length > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "image too large" }, { status: 413 });
    }
    if (!imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "image required" }, { status: 400 });
    }
    if (!process.env.NVIDIA_API_KEY) {
      return NextResponse.json({ error: "no key" }, { status: 500 });
    }

    const mode = body.mode === "study" ? "study" : "describe";
    const hint = typeof body.hint === "string" ? body.hint.trim().slice(0, 200) : "";

    const prompt =
      mode === "study"
        ? STUDY_PROMPT + (hint ? `\n\nContext from the app: ${hint}` : "")
        : DESCRIBE_PROMPT + (hint ? ` Focus on: ${hint}` : "");

    const call = await callChat({
      model: VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      // Study answers include transcription + worked steps; describing
      // needs far less. Over-allocating here is pure latency.
      max_tokens: mode === "study" ? 1500 : 700,
      temperature: mode === "study" ? 0.2 : 0.3,
      timeoutMs: 30_000,
    });
    if (!call.ok || !call.response) {
      return NextResponse.json({ error: "vision failed" }, { status: 502 });
    }

    const data = await call.response.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() || "";
    if (!raw) return NextResponse.json({ error: "vision failed" }, { status: 502 });

    const { description, kind } = splitType(raw);
    return NextResponse.json(
      { description, kind, mode },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "vision failed" }, { status: 500 });
  }
}
