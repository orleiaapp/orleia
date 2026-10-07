// ============================================================
// Orleia plans & Noor limits — single source of truth.
//
// Billing is Noor-only by design (decision: 2026-09): every local
// tool is free forever; paid tiers raise the daily Noor AI cap.
//
// The system runs in "billing not configured" mode until Stripe
// env vars exist: /api/chat then skips enforcement entirely, so
// nothing breaks before launch day. Setting STRIPE_SECRET_KEY
// + price IDs in Vercel turns the caps on with no code change.
// ============================================================

export type Tier = "free" | "plus" | "pro" | "ultra";
export type BillingInterval = "monthly" | "yearly";

/** Daily Noor AI message cap per tier (server-enforced in /api/chat). */
export const NOOR_DAILY_LIMIT: Record<Tier, number> = {
  free: 30,
  plus: 300,
  pro: 1000,
  ultra: Number.POSITIVE_INFINITY,
};

/**
 * Daily Coder TOKEN budget per tier (server-enforced in /api/coder).
 * Tokens replace message counts (2026-10-07): message caps were easy to
 * game with tiny prompts. Sized to match the old message caps at a
 * typical ~1.5-2k tokens/message. Free = 0 — /api/coder returns 403
 * coder_tier_locked for free before the budget is even consulted.
 */
export const CODER_DAILY_TOKENS: Record<Tier, number> = {
  free: 0,
  plus: 500_000,
  pro: 2_000_000,
  ultra: Number.POSITIVE_INFINITY,
};

/**
 * Effort weight applied to completion tokens: higher effort burns more
 * compute per token, so it costs proportionally more budget — the budget
 * scales with effort AND difficulty, not just message count.
 */
export const CODER_EFFORT_WEIGHT: Record<string, number> = {
  hyperfast: 0.5,
  low: 0.75,
  medium: 1,
  high: 1.5,
  max: 2,
  ultra: 2.5,
};

export interface PlanDef {
  tier: Exclude<Tier, "free">;
  name: string;
  monthly: number; // USD
  yearly: number; // USD, 20% off monthly x12
  blurb: string;
  perks: string[];
  /** The plan marketing surfaces highlight as most popular (Pro — best
   *  value per Noor message). Single source of truth for landing, pricing
   *  page and the plan intro dialog. */
  popular?: boolean;
  /** Stripe price IDs come from env so keys are never in code. */
  priceEnv: { monthly: string; yearly: string };
}

export const YEARLY_DISCOUNT = 0.2;

export const PAID_PLANS: PlanDef[] = [
  {
    tier: "plus",
    name: "Plus",
    monthly: 8,
    yearly: Math.round(8 * 12 * (1 - YEARLY_DISCOUNT)), // 76
    blurb: "For daily drivers who live in Noor.",
    perks: [
      "300 Noor messages every day",
      "300 Coder messages every day",
      "Noor Coder (beta) access",
      "Everything in the free plan",
      "All tools stay unlimited",
      "Cancel anytime",
    ],
    priceEnv: { monthly: "STRIPE_PRICE_PLUS_MONTHLY", yearly: "STRIPE_PRICE_PLUS_YEARLY" },
  },
  {
    tier: "pro",
    name: "Pro",
    monthly: 15,
    yearly: Math.round(15 * 12 * (1 - YEARLY_DISCOUNT)), // 144
    blurb: "For power users running Noor all day.",
    perks: [
      "1,000 Noor messages every day",
      "1,000 Coder messages every day",
      "Noor Coder (beta) access",
      "Everything in Plus",
      "Cancel anytime",
    ],
    popular: true,
    priceEnv: { monthly: "STRIPE_PRICE_PRO_MONTHLY", yearly: "STRIPE_PRICE_PRO_YEARLY" },
  },
  {
    tier: "ultra",
    name: "Ultra",
    monthly: 50,
    yearly: Math.round(50 * 12 * (1 - YEARLY_DISCOUNT)), // 480
    blurb: "For the ones who push Noor to its limits.",
    perks: [
      "Unlimited Noor messages (fair use)",
      "Unlimited Coder messages (fair use)",
      "Noor Coder (beta) access",
      "Everything in Pro",
      "Cancel anytime",
    ],
    priceEnv: { monthly: "STRIPE_PRICE_ULTRA_MONTHLY", yearly: "STRIPE_PRICE_ULTRA_YEARLY" },
  },
];

export function planByTier(tier: string): PlanDef | undefined {
  return PAID_PLANS.find((p) => p.tier === tier);
}

/** Is billing live? (Stripe key present). Caps only enforce when true. */
export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Resolve the Stripe price ID for a tier+interval, or null if unset. */
export function stripePriceFor(tier: Tier, interval: BillingInterval): string | null {
  const plan = planByTier(tier);
  if (!plan) return null;
  const envName = interval === "yearly" ? plan.priceEnv.yearly : plan.priceEnv.monthly;
  return process.env[envName] || null;
}

/** Formatting helper for UI ($8, $76 …). */
export function fmtPrice(usd: number): string {
  return `$${usd}`;
}
