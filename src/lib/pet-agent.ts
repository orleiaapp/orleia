"use client";

// ============================================================
// Pet Agent runtime — roster management + v1 local evaluators.
//
// The Wrangler (v1) is fully deterministic: it scans local tasks
// for overdue work and returns a batch proposal. Zero LLM cost.
// Scout-type jobs (S3) will wrap runAgentLoop later.
//
// Every state change writes a receipt: hiring, proposals shown,
// accepted, dismissed. Receipts feed the trust meter and the
// pre-registered kill metric (acceptance rate per role).
// ============================================================

import type { PetAgent, PetAgentRole, PetReceipt } from "@/types";
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

/** Normalize + persist the optional petAgents state block. */
export function ensureState() {
  const d = storage.getData();
  if (!d.petAgents) {
    d.petAgents = { roster: [], receipts: [], seenProposals: {}, snoozedUntil: {} };
  }
  if (!d.petAgents.roster) d.petAgents.roster = [];
  if (!d.petAgents.receipts) d.petAgents.receipts = [];
  if (!d.petAgents.seenProposals) d.petAgents.seenProposals = {};
  if (!d.petAgents.snoozedUntil) d.petAgents.snoozedUntil = {};
  return d.petAgents;
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

/** All live evaluators by role (S1: wrangler only). */
export const EVALUATORS: Partial<Record<PetAgentRole, PetEvaluator>> = {
  wrangler: evaluateWrangler,
};

/**
 * Run every hired agent's evaluator once and return fresh proposals.
 * Dedupe + snooze rules live here so callers stay dumb:
 *  - one proposal per (agent, key) per local day
 *  - "Later" snoozes the role until tomorrow
 *  - per-agent cooldown between runs
 */
export async function evaluateAll(): Promise<PetProposal[]> {
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
