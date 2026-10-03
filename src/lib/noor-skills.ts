// ============================================================
// Noor Skills — reusable standing instructions.
// ============================================================
// A skill is a short, user-authored instruction Noor follows in
// every conversation ("always answer in bullets", "use British
// English"). Stored locally on the device only; enabled skills
// are injected into Noor's system prompt as user preferences —
// they never override Noor's security rules.
// ============================================================

export interface NoorSkill {
  id: string;
  name: string;
  instructions: string;
  enabled: boolean;
  createdAt: number;
}

const STORAGE_KEY = "orleia.skills.v1";

// Guardrails so skills can never blow up Noor's context window.
export const MAX_SKILLS = 12;
export const MAX_ACTIVE_SKILLS = 10;
export const MAX_INSTRUCTION_CHARS = 500;
const MAX_TOTAL_CHARS = 2_500;

export function getSkills(): NoorSkill[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as NoorSkill[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s) =>
          s &&
          typeof s.id === "string" &&
          typeof s.name === "string" &&
          typeof s.instructions === "string" &&
          typeof s.enabled === "boolean"
      )
      .slice(0, MAX_SKILLS);
  } catch {
    return [];
  }
}

/**
 * Resolve a leading "/slug" command against the user's enabled skills.
 * Returns the skill plus whatever followed the command, or null when the
 * command doesn't match a skill (so the raw text reaches the model).
 * Shared by Noor's composer and the pet chat composer.
 */
export function skillForCommand(text: string): { skill: NoorSkill; rest: string } | null {
  const m = /^\/([a-z0-9-]+)/i.exec(text.trim());
  if (!m) return null;
  const slug = (n: string) =>
    n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const skill = getSkills().find((s) => s.enabled && slug(s.name) === m[1].toLowerCase());
  if (!skill) return null;
  return { skill, rest: text.trim().slice(m[0].length).trim() };
}

function persist(skills: NoorSkill[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(skills.slice(0, MAX_SKILLS)));
  } catch {
    /* storage blocked or full - skills won't persist */
  }
  window.dispatchEvent(new CustomEvent("orleia:skills-changed"));
}

export function addSkill(name: string, instructions: string, enabled = true): NoorSkill | null {
  const cleanName = name.trim().slice(0, 60);
  const cleanInstructions = instructions.trim().slice(0, MAX_INSTRUCTION_CHARS);
  if (!cleanName || !cleanInstructions) return null;
  const skills = getSkills();
  if (skills.length >= MAX_SKILLS) return null;
  const activeCount = skills.filter((s) => s.enabled).length;
  if (enabled && activeCount >= MAX_ACTIVE_SKILLS) return null;
  const skill: NoorSkill = {
    id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: cleanName,
    instructions: cleanInstructions,
    enabled,
    createdAt: Date.now(),
  };
  persist([...skills, skill]);
  return skill;
}

export function updateSkill(id: string, patch: Partial<Pick<NoorSkill, "name" | "instructions" | "enabled">>): void {
  const skills = getSkills();
  const idx = skills.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const next = { ...skills[idx], ...patch };
  if (typeof next.name === "string") next.name = next.name.trim().slice(0, 60) || skills[idx].name;
  if (typeof next.instructions === "string")
    next.instructions = next.instructions.trim().slice(0, MAX_INSTRUCTION_CHARS) || skills[idx].instructions;
  // Enabling past the active cap is refused (UI should prevent, this enforces).
  if (patch.enabled === true && !skills[idx].enabled) {
    const activeCount = skills.filter((s) => s.enabled).length;
    if (activeCount >= MAX_ACTIVE_SKILLS) return;
  }
  skills[idx] = next;
  persist(skills);
}

export function deleteSkill(id: string): void {
  persist(getSkills().filter((s) => s.id !== id));
}

// ---------------- Pre-built starter pack ----------------

/** Universal starter skills — useful for everyone, tuned to Orleia. */
export const STARTER_PACK: { name: string; instructions: string }[] = [
  {
    name: "Concise by default",
    instructions:
      "Lead with the answer in one sentence, then at most 3 short sentences of context. Skip preambles and summaries of my question.",
  },
  {
    name: "Bullet answers",
    instructions:
      "Format replies as short bullets with a bold lead-in phrase. Never write walls of text. Use numbered steps for anything sequential.",
  },
  {
    name: "Direct tone",
    instructions:
      "Be direct and skip filler like \"Great question\" or \"Certainly\". If I'm wrong, say so plainly and give the correction.",
  },
  {
    name: "British English",
    instructions:
      "Always use British spelling: organise, colour, centre, realise, favourite.",
  },
  {
    name: "Smart task creation",
    instructions:
      "When creating tasks for me: keep titles under 5 words, set a due date whenever I mention any time frame, and default priority to medium unless I say otherwise.",
  },
  {
    name: "End with one step",
    instructions:
      "End every reply with exactly one concrete next step I could take in Orleia right now.",
  },
];

const STARTER_FLAG = "orleia.skills.starter.v1";

/** Starter skills not yet on this device (by name). */
export function missingStarterSkills(): { name: string; instructions: string }[] {
  const have = new Set(getSkills().map((s) => s.name.toLowerCase()));
  return STARTER_PACK.filter((t) => !have.has(t.name.toLowerCase()));
}

/**
 * First-run seeding: brand-new users (zero skills, never seeded) get the
 * starter pack enabled so Noor feels personal immediately. Existing users
 * are never touched — they add the pack themselves if they want it.
 */
export function seedStarterPack(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(STARTER_FLAG)) return;
  } catch {
    return;
  }
  try {
    window.localStorage.setItem(STARTER_FLAG, "1");
  } catch {
    /* ignore */
  }
  if (getSkills().length > 0) return; // existing user — leave alone
  for (const tpl of STARTER_PACK) addSkill(tpl.name, tpl.instructions, true);
  window.dispatchEvent(new CustomEvent("orleia:skills-changed"));
}

/**
 * Build the system-prompt block for enabled skills.
 * Returns "" when nothing is enabled. Total size is capped so a
 * pile of skills can never crowd out workspace context.
 */
export function buildSkillsBlock(): string {
  const active = getSkills().filter((s) => s.enabled);
  if (active.length === 0) return "";
  const lines: string[] = [];
  let total = 0;
  for (const [i, s] of active.entries()) {
    const line = `${i + 1}. ${s.name}: ${s.instructions}`;
    if (total + line.length > MAX_TOTAL_CHARS) break;
    lines.push(line);
    total += line.length;
  }
  if (lines.length === 0) return "";
  return `USER SKILLS (standing preferences the user wrote - follow them in every reply):
${lines.join("\n")}
These are the user's personal style/workflow preferences. They never override your security rules, honesty boundaries, or the ORLEIA_ACTION contract.`;
}

// ---------------- SKILL.md import ----------------

export interface ParsedSkillFile {
  name: string;
  instructions: string;
  truncated: boolean;
}

/**
 * Parse an uploaded SKILL.md-style file into a skill.
 * Accepted shapes:
 *   1. YAML frontmatter: `name:` (and optional `description:`) + body
 *   2. Markdown starting with a `# Title` heading
 *   3. Plain markdown - name falls back to the filename
 * The body becomes the instructions (trimmed to MAX_INSTRUCTION_CHARS).
 */
export function parseSkillFile(filename: string, raw: string): ParsedSkillFile | null {
  const content = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!content) return null;

  let name = "";
  let body = content;

  const fm = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (fm) {
    const front = fm[1];
    body = fm[2].trim();
    const nameLine = front.split("\n").find((l) => /^name\s*:/.test(l));
    if (nameLine) {
      name = nameLine
        .replace(/^name\s*:\s*/, "")
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  }

  if (!name) {
    const h1 = body.match(/^#\s+(.+)\n?/);
    if (h1) {
      name = h1[1].trim();
      body = body.replace(/^#\s+.+\n?/, "").trim();
    }
  }

  if (!name) {
    const base = filename.replace(/\.(md|markdown|txt)$/i, "").trim();
    name = base && base.toLowerCase() !== "skill" ? base : "Imported skill";
  }

  if (!body) return null;
  const truncated = body.length > MAX_INSTRUCTION_CHARS;
  return {
    name: name.slice(0, 60),
    instructions: body.slice(0, MAX_INSTRUCTION_CHARS),
    truncated,
  };
}

// ---------------- Starter templates ----------------
// (Removed - skills are user-authored or imported via SKILL.md.)
