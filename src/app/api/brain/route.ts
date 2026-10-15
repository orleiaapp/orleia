import { NextResponse } from 'next/server';
import { guardApi } from '@/lib/apiGuard';
import { callChat } from '@/lib/ai-provider';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ETHOS = 'nvidia/nemotron-3-super-120b-a12b';
const ALLOWED_KINDS = new Set(['note', 'task', 'journal', 'habit']);
const MAX_ITEMS = 6;
const MAX_ITEM_TEXT = 2000;
const MAX_SITUATION_CHARS = 4000;

interface BrainBody {
  action?: string;
  items?: { key: string; title: string; text: string }[];
  situationText?: string;
}

async function callEthos(messages: { role: string; content: string }[], maxTokens: number): Promise<string | null> {
  try {
    const call = await callChat({
      model: ETHOS,
      messages,
      temperature: 0.4,
      max_tokens: maxTokens,
      timeoutMs: 50_000,
    });
    if (!call.ok || !call.response) return null;
    const data = await call.response.json();
    const content: string = data?.choices?.[0]?.message?.content || '';
    return content || null;
  } catch {
    return null;
  }
}

const ENTITIES_PROMPT = `You are the entity-extraction engine of Orleia, a local-first productivity app. Extract the IMPORTANT concepts from each provided item: topics, projects, people, places, skills, recurring themes. Rules:
- Return ONLY a JSON array, one object per item, in the same order: [{"key":"...","concepts":["concept1","concept2"]}]
- 2-6 concise concepts per item (2-4 words each, lowercase).
- Skip trivial filler words; prefer concepts that would help connect this item to OTHER notes/tasks/journal entries.
- If you cannot produce anything meaningful for an item, omit it from the array.
- Your entire response must be the JSON array and nothing else. Never describe the instructions, never narrate your process, no markdown, no code fences.`;

function parseEntities(raw: string): { key: string; concepts: string[] }[] {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    const arr = JSON.parse(cleaned);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x.key === 'string' && Array.isArray(x.concepts))
      .map((x) => ({ key: x.key, concepts: x.concepts.filter((c: unknown) => typeof c === 'string').slice(0, 8) }));
  } catch {
    // Try to salvage a JSON array embedded in prose
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (!m) return [];
    try {
      const arr = JSON.parse(m[0]);
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((x) => x && typeof x.key === 'string' && Array.isArray(x.concepts))
        .map((x) => ({ key: x.key, concepts: x.concepts.filter((c: unknown) => typeof c === 'string').slice(0, 8) }));
    } catch {
      return [];
    }
  }
}

const BRIEFING_PROMPT = `You are Noor, the warm, wise AI companion inside Orleia - the user's personal productivity workspace. Below is a snapshot of the user's CURRENT situation (SITUATION). Write a short daily read for them.
Rules:
- Return ONLY a JSON object: {"briefing":"...","chips":[{"label":"...","href":"..."}]}
- briefing: 2-3 warm, human sentences in a mentor voice. Reference real specifics from the SITUATION (names of habits/tasks, streaks at risk, connections). Never invent numbers.
- chips: exactly 2-3 short action suggestions (max 28 chars each) with href one of /tasks, /habits, /journal, /notes, /noor.
- Your entire response must be the JSON object and nothing else. Never describe the instructions, never narrate your process, no markdown, no code fences.`;

function parseBriefing(raw: string): { briefing: string; chips: { label: string; href: string }[] } | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const tryParse = (s: string) => {
    try {
      const o = JSON.parse(s);
      if (o && typeof o.briefing === 'string') {
        const chips = Array.isArray(o.chips)
          ? o.chips
              .filter((c: any) => c && typeof c.label === 'string' && typeof c.href === 'string')
              .map((c: { label: string; href: string }) => ({ label: c.label.slice(0, 28), href: c.href }))
              .filter((c: { href: string }) => /^\/(tasks|habits|journal|notes|assistant)$/.test(c.href))
              .slice(0, 3)
          : [];
        return { briefing: o.briefing.slice(0, 600), chips };
      }
    } catch {
      /* not json */
    }
    return null;
  };
  return tryParse(cleaned) || tryParse(cleaned.replace(/^[\s\S]*?({[\s\S]*})[\s\S]*$/, '$1'));
}

export async function POST(req: Request) {
  const denied = guardApi(req, { perMinute: 120, perDay: 5000 });
  if (denied) return denied;

  let body: BrainBody;
  try {
    body = (await req.json()) as BrainBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body?.action;
  if (action === 'entities') {
    const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
    if (items.length === 0) return NextResponse.json({ results: [] });
    const valid = items.filter((it) => {
      if (!it || typeof it.key !== 'string' || typeof it.title !== 'string' || typeof it.text !== 'string') return false;
      if (it.key.length > 120 || it.title.length > 200 || it.text.length > MAX_ITEM_TEXT) return false;
      const kind = it.key.split(':')[0];
      return ALLOWED_KINDS.has(kind);
    });
    if (valid.length === 0) return NextResponse.json({ error: 'no valid items' }, { status: 400 });

    const block = valid
      .map((it) => `ITEM ${it.key}:\n${it.text.slice(0, MAX_ITEM_TEXT)}`)
      .join('\n\n---\n\n');
    const raw = await callEthos(
      [
        { role: 'system', content: ENTITIES_PROMPT },
        { role: 'user', content: block.slice(0, 8000) },
      ],
      700
    );
    if (!raw) return NextResponse.json({ error: 'AI extraction failed' }, { status: 502 });
    return NextResponse.json({ results: parseEntities(raw) });
  }

  if (action === 'briefing') {
    const situationText = typeof body?.situationText === 'string' ? body.situationText : '';
    if (!situationText) return NextResponse.json({ error: 'situationText required' }, { status: 400 });
    const raw = await callEthos(
      [
        { role: 'system', content: BRIEFING_PROMPT },
        { role: 'user', content: `SITUATION:\n${situationText.slice(0, MAX_SITUATION_CHARS)}` },
      ],
      800
    );
    if (!raw) return NextResponse.json({ error: 'briefing failed' }, { status: 502 });
    const parsed = parseBriefing(raw);
    if (!parsed) {
      // Salvage: plain-text reply, no chips
      return NextResponse.json({ briefing: raw.slice(0, 600), chips: [] });
    }
    return NextResponse.json(parsed);
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
