"use client";

// ============================================================
// Pet Agent runtime — roster management + v1 local evaluators.
//
// Wrangler + Planner are fully deterministic local evaluators: they scan
// the workspace and return proposals. Zero LLM cost. Scout is different —
// it gets real web jobs on the Noor agent loop (scout-jobs.ts).
//
// Receipts come in two flavors:
//   • proposal receipts (proposed/accepted/dismissed) — the confirm-first
//     ladder, only on user taps.
//   • WORKING receipts ("pet did its job") — fired when a role delivers
//     work that didn't need a proposal at all (Planner huddle, Scout
//     delivery). These are what make the agent feel employed rather
//     than chatty.
//
// Every state change writes a receipt: hiring, proposals shown,
// accepted, dismissed. Receipts feed the trust meter and the
// pre-registered kill metric (acceptance rate per role).
// ============================================================

import type { PetAgent, PetAgentRole, PetAgentState, PetReceipt } from "@/types";
import { storage } from "./storage";
import { getToday, generateId } from "./utils";
import { jobByRole, fetchTierInfo, effectiveSlots } from "./pet-jobs";
import { petById } from "./pets";

const MAX_RECEIPTS = 60;
const WRANGLER_COOLDOWN_MS = 30 * 60 * 1000; // don't re-propose within 30 min
const SWEEP_LIMIT = 12; // sanity cap per sweep proposal

function nowIso(): string {
  return new Date().toISOString();
}

function receipt(kind: PetReceipt["kind"], agent: PetAgent | null, summary: string): PetReceipt {
  return {
    id: generateId(),
    agentId: agent?.id || "",
    role: agent?.role || "wrangler",
    kind,
    summary,
    createdAt: nowIso(),
  };
}

function pushReceipt(r: PetReceipt): void {
  const d = storage.getData();
  const state = ensureState();
  state.receipts = [r, ...state.receipts].slice(0, MAX_RECEIPTS);
  d.petAgents = state;
  storage.saveData();
}

/**
 * Working receipt: fired by other modules (scout-jobs.ts, future roles)
 * when a pet delivers work. Bypasses trust — a job delivered on the
 * user's own assignment shouldn't inflate the confirm-first ladder.
 */
export function workingReceipt(r: PetReceipt): void {
  pushReceipt(r);
}

/** Normalize + persist the optional petAgents state block. */
export function ensureState(): PetAgentState {
  const d = storage.getData();
  if (!d.petAgents) {
    d.petAgents = { roster: [], receipts: [], seenProposals: {}, snoozedUntil: {}, scoutJobs: [] };
  }
  const state = d.petAgents;
  if (!state) return { roster: [], receipts: [], seenProposals: {}, snoozedUntil: {}, scoutJobs: [] };
  if (!state.roster) state.roster = [];
  if (!state.receipts) state.receipts = [];
  if (!state.seenProposals) state.seenProposals = {};
  if (!state.snoozedUntil) state.snoozedUntil = {};
  if (!Array.isArray(state.scoutJobs)) state.scoutJobs = [];
  return state;
}

// ---------------- Roster ----------------

export interface HireResult {
  ok: boolean;
  reason?: "slots" | "taken" | "not_hireable" | "duplicate_pet";
  agent?: PetAgent;
}

/** Highest role slots available right now (tier-aware, cached). */
export async function availableSlots(): Promise<number> {
  const info = await fetchTierInfo();
  return effectiveSlots(info);
}

export async function hireAgent(petId: string, role: PetAgentRole): Promise<HireResult> {
  const job = jobByRole(role);
  if (!job || !job.hireable) return { ok: false, reason: "not_hireable" };

  const state = ensureState();
  if (state.roster.some((a) => a.role === role)) return { ok: false, reason: "taken" };
  if (state.roster.some((a) => a.petId === petId)) return { ok: false, reason: "duplicate_pet" };

  const slots = await availableSlots();
  if (state.roster.length >= slots) return { ok: false, reason: "slots" };

  const pet = (storage.getData() as any).profile?.pet;
  const agent: PetAgent = {
    id: generateId(),
    petId,
    role,
    name: petNameFor(petId),
    autonomy: "suggest",
    trust: 0,
    hiredAt: nowIso(),
  };
  state.roster.push(agent);
  storage.saveData();
  // New hire = new surface. Drop any stale snooze for this role so a
  // freshly hired pet can speak immediately (PetReactions listens on
  // storage changes and re-runs evaluators).
  clearSnooze(role);
  pushReceipt(receipt("hired", agent, `Hired as ${job.name}`));
  return { ok: true, agent };
}

export function releaseAgent(agentId: string): void {
  const state = ensureState();
  const agent = state.roster.find((a) => a.id === agentId);
  if (!agent) return;
  state.roster = state.roster.filter((a) => a.id !== agentId);
  storage.saveData();
  pushReceipt(receipt("released", agent, `Released from duty`));
}

export function roster(): PetAgent[] {
  return ensureState().roster;
}

export function receipts(): PetReceipt[] {
  return ensureState().receipts;
}

export function petNameFor(petId: string): string {
  const d = storage.getData() as any;
  const custom = String(d.profile?.petName || "").trim();
  if (custom) return custom;
  return petById(petId)?.name || "Pet";
}

// ---------------- Trust ----------------

export function bumpTrust(agentId: string, delta: number): void {
  const state = ensureState();
  const agent = state.roster.find((a) => a.id === agentId);
  if (!agent) return;
  agent.trust = Math.max(0, agent.trust + delta);
  storage.saveData();
}

/** Clear a role's snooze (e.g. a new job was assigned — pet must speak). */
export function clearSnooze(role: PetAgentRole): void {
  const state = ensureState();
  if (state.snoozedUntil[role] !== undefined) {
    delete state.snoozedUntil[role];
    storage.saveData();
  }
}

// ---------------- Tier surface for UI ----------------

export interface SlotStatus {
  slots: number;
  used: number;
  tier: Awaited<ReturnType<typeof fetchTierInfo>>;
}

export async function slotStatus(): Promise<SlotStatus> {
  const info = await fetchTierInfo();
  return { slots: effectiveSlots(info), used: roster().length, tier: info };
}

// ---------------- Evaluators ----------------

export interface PetProposal {
  key: string;
  role: PetAgentRole;
  agentId: string;
  /** Headline (English fallback; UI re-maps via i18n keys when present). */
  title: string;
  body: string;
  emoji: string;
  /** i18n key hints (petagent.*) + interpolation params. */
  titleKey?: string;
  bodyKey?: string;
  params?: Record<string, string | number>;
  /** Actions run on confirm, in order. Confirm-first: never auto-run. */
  actions: { kind: "reschedule_overdue"; taskIds: string[] }[];
}

export interface ProposalContext {
  today: string;
}

/**
 * Wrangler: deterministic overdue sweep. Returns one proposal per
 * agent run (deduped per day by the caller via seenProposals), or
 * null when there's nothing to wrangle.
 */
export function evaluateWrangler(agent: PetAgent, ctx: ProposalContext): PetProposal | null {
  const d = storage.getData() as any;
  const overdue = d.tasks
    .filter((t: any) => (t.status === "todo" || t.status === "in_progress") && t.dueDate && t.dueDate < ctx.today)
    .sort((a: any, b: any) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, SWEEP_LIMIT);

  if (!overdue.length) return null;

  return {
    key: "wrangler.overdue",
    role: "wrangler",
    agentId: agent.id,
    emoji: "🐑",
    title: `${agent.name} found ${overdue.length} overdue task${overdue.length === 1 ? "" : "s"}`,
    body: "Move them to today so nothing gets lost?",
    titleKey: overdue.length === 1 ? "petagent.wrangler.title_one" : "petagent.wrangler.title",
    bodyKey: "petagent.wrangler.body",
    params: { name: agent.name, count: overdue.length },
    actions: [{ kind: "reschedule_overdue", taskIds: overdue.map((t: any) => t.id) }],
  };
}

export type PetEvaluator = (agent: PetAgent, ctx: ProposalContext) => PetProposal | null;

/**
 * Planner: the Morning Huddle. Deterministic — reads today's tasks,
 * events and habit state, and proposes a short, honest plan. No LLM,
 * fires once per day, free.
 */
export function evaluatePlanner(agent: PetAgent, ctx: ProposalContext): PetProposal | null {
  const d = storage.getData() as any;
  const todayTasks = d.tasks.filter(
    (t: any) => t.dueDate === ctx.today && (t.status === "todo" || t.status === "in_progress")
  );
  const events = (d.calendarEvents || []).filter((e: any) => e.date === ctx.today);
  const habits = (d.habits || []).filter((h: any) => !h.archived);
  const loggedHabits = habits.filter((h: any) =>
    d.habitLogs.some((l: any) => l.habitId === h.id && l.date === ctx.today)
  );
  const habitsLeft = habits.length - loggedHabits.length;
  if (!todayTasks.length && !events.length) return null;

  const pick = (n: number) =>
    [...todayTasks]
      .sort((a: any) => (a.priority === "high" ? -1 : 0))
      .slice(0, n)
      .map((t: any) => `“${t.title}”`)
      .join(", ");
  const lines: string[] = [];
  if (todayTasks.length) lines.push(`• ${todayTasks.length} task${todayTasks.length === 1 ? "" : "s"} due today — start with ${pick(2)}`);
  for (const e of events) {
    const t = e.time ? ` at ${e.time}` : " (all-day)";
    lines.push(`• ${e.time ? "📅" : "🌅"} ${e.title}${t}`);
  }
  if (habitsLeft > 0) lines.push(`• ${habitsLeft} habit${habitsLeft === 1 ? "" : "s"} still unchecked today`);

  return {
    key: "planner.huddle",
    role: "planner",
    agentId: agent.id,
    emoji: "🌅",
    title: `${agent.name}'s Morning Huddle`,
    body: lines.join("\n"),
    titleKey: "petagent.planner.title",
    bodyKey: undefined,
    params: { name: agent.name },
    actions: [],
  };
}

/** All live evaluators by role (wrangler + planner here; scout runs jobs via scout-jobs.ts). */
export const EVALUATORS: Partial<Record<PetAgentRole, PetEvaluator>> = {
  wrangler: evaluateWrangler,
  planner: evaluatePlanner,
};

/** Roles with a real, non-chat job users can trigger on demand. */
export function roleHasJob(role: PetAgentRole): boolean {
  if (role === "scout") return true; // scout jobs are assigned from chat/pets page
  return Boolean(EVALUATORS[role]);
}

/**
 * User-initiated run ("Run now"): bypasses the seen-today/snooze
 * dedupe but keeps the normal persistence so a fresh proposal lands
 * in PetReactions wherever the user is.
 */
export function runRoleNow(agentId: string): boolean {
  const state = ensureState();
  const agent = state.roster.find((a) => a.id === agentId);
  if (!agent) return false;
  const ev = EVALUATORS[agent.role];
  if (!ev) return false;
  const proposal = safeEval(ev, agent, { today: getToday() });
  if (!proposal) return false;
  state.seenProposals[`${agent.id}:${getToday()}`] = getToday();
  storage.saveData();
  window.dispatchEvent(new CustomEvent("orleia:pet-proposal", { detail: proposal }));
  return true;
}

/** Listen for user-initiated proposals (mounted once in PetReactions). */
export function subscribePetProposals(fn: (p: PetProposal) => void): () => void {
  const h = (ev: Event) => fn((ev as CustomEvent<PetProposal>).detail);
  window.addEventListener("orleia:pet-proposal", h);
  return () => window.removeEventListener("orleia:pet-proposal", h);
}

/**
 * Run every hired agent's evaluator once and return fresh proposals.
 * Dedupe + snooze rules live here so callers stay dumb:
 *  - one proposal per (agent, key) per local day
 *  - "Later" snoozes the role until tomorrow
 *  - per-agent cooldown between runs
 *  - quiet hours 23:00–05:00: agents sleep, like the cosmetic pet
 */
export async function evaluateAll(): Promise<PetProposal[]> {
  const hour = new Date().getHours();
  if (hour >= 23 || hour < 5) return []; // sleeping — never propose at night
  const state = ensureState();
  const today = getToday();
  const out: PetProposal[] = [];
  const lastRun = (petAgentRuntime.lastRunByAgent ||= {});
  const now = Date.now();

  for (const agent of state.roster) {
    const ev = EVALUATORS[agent.role];
    if (!ev) continue;
    if (now - (lastRun[agent.id] || 0) < WRANGLER_COOLDOWN_MS) continue;
    const seenKey = `${agent.id}:${today}`;
    // Mark seen before evaluating so a throw can't spam-loop.
    lastRun[agent.id] = now;
    const proposal = safeEval(ev, agent, { today });
    if (!proposal) continue;
    if (state.seenProposals[seenKey]) continue; // already shown today
    if (state.snoozedUntil[agent.role] === today) continue; // snoozed today
    state.seenProposals[seenKey] = today;
    out.push(proposal);
  }
  if (out.length) storage.saveData();
  return out;
}

function safeEval(ev: PetEvaluator, agent: PetAgent, ctx: ProposalContext): PetProposal | null {
  try {
    return ev(agent, ctx);
  } catch {
    return null;
  }
}

/** Module-scoped runtime (not persisted): cooldowns only. */
const petAgentRuntime: { lastRunByAgent: Record<string, number> } = { lastRunByAgent: {} };

// ---------------- Executing proposals ----------------

export interface ExecutedSweep {
  success: boolean;
  moved: number;
  message: string;
}

/**
 * Confirm-first execution for the Wrangler sweep: bulk-reschedule the
 * proposed tasks to today. Direct storage write (the AI-action
 * update_task path can't set due dates); the user already confirmed.
 */
export function executeProposal(p: PetProposal): ExecutedSweep {
  const agent = roster().find((a) => a.id === p.agentId) || null;
  // Informational proposals (Planner huddle) have no actions: "Do it" is
  // just an acknowledgment — thank the pet, no fake "moved 0" receipt.
  if (!p.actions.length) {
    bumpTrust(p.agentId, 1);
    pushReceipt(receipt("accepted", agent, `Huddle acknowledged`));
    return { success: true, moved: 0, message: "✅ Let's get to it!" };
  }
  let moved = 0;
  for (const action of p.actions) {
    if (action.kind !== "reschedule_overdue") continue;
    const today = getToday();
    for (const id of action.taskIds) {
      const updated = storage.updateTask(id, { dueDate: today });
      if (updated) moved++;
    }
  }
  const ok = moved > 0;
  bumpTrust(p.agentId, ok ? 1 : 0);
  pushReceipt(
    receipt(ok ? "accepted" : "proposed", agent, ok ? `Moved ${moved} overdue task${moved === 1 ? "" : "s"} to today` : "Nothing to move")
  );
  return { success: ok, moved, message: ok ? `✅ Moved ${moved} overdue task${moved === 1 ? "" : "s"} to today.` : "Nothing needed moving." };
}

export function recordDismissal(p: PetProposal): void {
  const agent = roster().find((a) => a.id === p.agentId) || null;
  bumpTrust(p.agentId, -1);
  pushReceipt(receipt("dismissed", agent, "Proposal dismissed"));
}

/** "Later": the role stays quiet until tomorrow. */
export function snoozeRole(role: PetAgentRole): void {
  const state = ensureState();
  state.snoozedUntil[role] = getToday();
  storage.saveData();
}

// ---------------- Chat-with-pet (Noor integration) ----------------

/**
 * Persona prefix for pet chat. Spoken in Noor's voice but framed as the
 * pet: first person, short sentences, playful + accountable. Ends with a
 * reminder of what this pet is FOR (its job) so replies stay useful.
 */
export function petPersonaPrefix(agent: PetAgent): string {
  const job = jobByRole(agent.role);
  const jobLine = job
    ? `Your job: ${job.name} — ${job.tagline}. `
    : "";
  const roleLine =
    agent.role === "scout"
      ? `You can also be ASSIGNED background web-research jobs: the user types one after the “Assign a job” prompt, and you run it on the Noor agent loop (web_search + read_url) without using their daily Noor messages. If the user asks for research, end your reply with exactly this line: ASSIGN_JOB <the topic in one sentence>`
      : "";
  return (
    `You are speaking as "${agent.name}", the user's hired pet agent (role: ${agent.role}). ` +
    `Stay in character as the pet: first person, warm, playful, short sentences. ` +
    jobLine +
    (roleLine ? roleLine + "\n" : "") +
    `You run inside Orleia alongside Noor (the operator), confirm-first.\n\n` +
    `CONFIRM-FIRST RULE: When the user asks you to do something (or confirms a job you proposed), ` +
    `do NOT narrate doing it yourself - REQUEST the action by emitting ONE line exactly in this format:\n` +
    `ORLEIA_ACTION {"action":"<action_type>","params":{...}}\n` +
    `followed by one short in-character sentence. Useful action types for you: complete_task, update_task, create_task, create_note, log_habit, create_event, search_data. ` +
    `The system turns your line into a confirm chip for the user - nothing happens without their tap, and the system confirms the result. ` +
    `Never claim a task is done unless the user already confirmed and the system showed the result.`
  );
}

/**
 * One persistent thread per hired agent: "Chat with {name}". Existing
 * Noor conversations are never touched; a released pet's thread simply
 * stops receiving the persona prefix (harmless orphan thread).
 */
export function ensurePetConversation(agent: PetAgent): string {
  const d = storage.getData();
  const existing = d.aiConversations.find((c) => c.petAgentId === agent.id);
  if (existing) return existing.id;
  const job = jobByRole(agent.role);
  const conv = storage.createConversation();
  conv.petAgentId = agent.id;
  conv.title = `Chat with ${agent.name}`;
  storage.saveData();
  void job;
  return conv.id;
}
