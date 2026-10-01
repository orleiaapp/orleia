"use client";

// ============================================================
// Pet Jobs — the agent job catalog + paid-slot entitlement.
//
// Product model (see PET_AGENT_PLAN.md): Noor is the operator;
// pets are full agents the user HIRES into roles. Hiring is the
// paid feature, mapped onto the existing billing tiers via
// /api/billing/license (the same endpoint the Noor cap uses).
//
// Slot model: plus = 1 pet agent, pro = 3, ultra = 8. Free users
// keep the cosmetic pet + Noor operator; hiring an agent is the
// upgrade. Billing-not-configured (dev / pre-launch) behaves like
// ultra so nothing breaks before Stripe keys exist.
//
// v1 catalog: Wrangler only is hireable; Planner/Scout/Auditor are
// "soon" (S2/S3 in the plan) — visible so the catalog feels alive
// and the roadmap is honest.
// ============================================================

import type { PetAgentRole } from "@/types";
import type { Tier } from "./plans";

export interface JobDef {
  role: PetAgentRole;
  /** i18n keys (petjob.<role>.*) plus fallback copy for missing keys. */
  icon: string;
  color: string;
  hireable: boolean;
  soon?: boolean;
  /** English fallbacks — i18n overrides at runtime. */
  name: string;
  tagline: string;
  description: string;
  /** What the agent can do, shown as chips on the catalog card. */
  skills: string[];
}

export const PET_JOBS: JobDef[] = [
  {
    role: "wrangler",
    icon: "🐑",
    color: "#22c55e",
    hireable: true,
    name: "Wrangler",
    tagline: "Keeps your tasks from wandering off",
    description:
      "Watches for tasks that slipped past their due date and rounds them up. Proposes a clean 'move to today' sweep — you confirm with one tap.",
    skills: ["Overdue sweeps", "Reschedule proposals", "One-tap confirm"],
  },
  {
    role: "planner",
    icon: "🌅",
    color: "#3b82f6",
    hireable: false,
    soon: true,
    name: "Planner",
    tagline: "Builds your morning, every morning",
    description:
      "Reads today's tasks, habits and events, then proposes a morning huddle — what to start with and what matters. Ships in stage 2.",
    skills: ["Morning huddle", "Day proposals"],
  },
  {
    role: "scout",
    icon: "🔭",
    color: "#a855f7",
    hireable: false,
    soon: true,
    name: "Scout",
    tagline: "Works the web while you work",
    description:
      "Send Scout on real web jobs — research a topic, watch for updates, deliver a digest note. Runs on the Noor agent loop. Ships in stage 3.",
    skills: ["Web research", "Digest notes", "Agent loop"],
  },
  {
    role: "auditor",
    icon: "📋",
    color: "#f59e0b",
    hireable: false,
    soon: true,
    name: "Auditor",
    tagline: "Your honest weekly review",
    description:
      "Once a week, tallies what actually happened — tasks done, habit rate, journal streak — and drafts a review note. Ships in stage 3.",
    skills: ["Weekly recap", "Draft review note"],
  },
];

export function jobByRole(role: PetAgentRole): JobDef | undefined {
  return PET_JOBS.find((j) => j.role === role);
}

// ---------------- Paid slots ----------------

/** Hired pet agents per tier (the paid feature). */
export const PET_SLOTS: Record<Tier, number> = {
  free: 0,
  plus: 1,
  pro: 3,
  ultra: 8,
};

export interface TierInfo {
  tier: Tier;
  billingConfigured: boolean;
  error: boolean;
}

let cachedTier: { at: number; info: TierInfo } | null = null;
const TIER_TTL_MS = 5 * 60 * 1000;

/**
 * Read the device's tier from the same license endpoint the Noor cap
 * uses. Cached 5 min; on any failure we assume free WITHOUT marking
 * error — enforcement degrades gracefully client-side (server stays
 * authoritative for anything that costs money).
 */
export async function fetchTierInfo(force = false): Promise<TierInfo> {
  if (!force && cachedTier && Date.now() - cachedTier.at < TIER_TTL_MS) return cachedTier.info;
  try {
    const { getDeviceId } = await import("./device-id");
    const res = await fetch(`/api/billing/license?deviceId=${encodeURIComponent(getDeviceId())}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { tier?: Tier; billingConfigured?: boolean };
    const info: TierInfo = {
      tier: data.tier || "free",
      billingConfigured: Boolean(data.billingConfigured),
      error: false,
    };
    cachedTier = { at: Date.now(), info };
    return info;
  } catch {
    // Network/API failure: don't block local UX on billing reachability.
    const info: TierInfo = { tier: "free", billingConfigured: false, error: true };
    cachedTier = { at: Date.now(), info };
    return info;
  }
}

/**
 * Effective slots for gating UI. Billing unconfigured (pre-launch/dev)
 * or license unreachable-but-configured → generous (ultra) so the
 * feature can't brick for paying users mid-outage. Server enforcement
 * remains the money boundary.
 */
export function effectiveSlots(info: TierInfo): number {
  if (!info.billingConfigured) return PET_SLOTS.ultra;
  if (info.error) return PET_SLOTS.ultra;
  return PET_SLOTS[info.tier] ?? 0;
}
