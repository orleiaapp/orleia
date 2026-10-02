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
// Catalog: three live roles (Wrangler, Planner, Scout) plus the
// Auditor on the roadmap. Live roles all DO something Noor's chat
// doesn't: they run on triggers (open, daily, on assignment), not
// on prompts.
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
    tagline: "Watches your tasks. Noor can't.",
    description:
      "Checks your tasks every time you open Orleia — no asking, no messages spent. Finds what slipped past its due date and proposes a one-tap 'move to today' sweep.",
    skills: ["Watches 24/7", "Fires on open", "Zero messages"],
  },
  {
    role: "planner",
    icon: "🌅",
    color: "#3b82f6",
    hireable: true,
    name: "Planner",
    tagline: "Your morning, before you ask for it",
    description:
      "Every morning, greets you with a huddle: what's due today, what's on the calendar, which habits are still unchecked — and where to start. No prompt needed.",
    skills: ["Morning huddle", "Daily, automatic", "Zero messages"],
  },
  {
    role: "scout",
    icon: "🔭",
    color: "#a855f7",
    hireable: true,
    name: "Scout",
    tagline: "Give it a job. It works the web.",
    description:
      "Hand Scout a research job and it runs multi-turn on the web — searching, reading pages, writing it up. Delivers a findings note to your notes and a receipt. Doesn't touch your daily Noor messages.",
    skills: ["Multi-step web jobs", "Findings notes", "No message cost"],
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
      "Once a week, tallies what actually happened — tasks done, habit rate, journal streak — and drafts a review note.",
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
