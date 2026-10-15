"use client";

// ============================================================
// Settings → Billing — Noor plans (Plus/Pro/Ultra).
// Shows current tier + today's Noor usage, upgrade cards with a
// monthly/yearly toggle, and Stripe checkout/portal wiring.
// Everything renders in a "launching soon" state until Stripe
// env vars are configured server-side.
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { CreditCard, Check, Sparkles, ExternalLink, Loader2, Ticket } from "lucide-react";
import { getDeviceId } from "@/lib/device-id";
import { PAID_PLANS, NOOR_DAILY_LIMIT, fmtPrice, type Tier } from "@/lib/plans";
import { cn } from "@/lib/utils";

const PLAN_RANK: Record<string, number> = { plus: 1, pro: 2, ultra: 3 };

interface LicenseState {
  tier: "free" | "plus" | "pro" | "ultra";
  used: number;
  limit: number | null; // null = unlimited
  billingConfigured: boolean;
  periodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  /** False for granted/comped licenses — no Stripe subscription to manage. */
  managed?: boolean;
}

export function BillingPanel() {
  const [state, setState] = useState<LicenseState | null>(null);
  const [interval, setIntervalChoice] = useState<"monthly" | "yearly">("monthly");
  const [busyTier, setBusyTier] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const deviceId = getDeviceId();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/billing/license?deviceId=${encodeURIComponent(getDeviceId())}`);
      if (res.ok) setState((await res.json()) as LicenseState);
    } catch {
      // Leave null -> "launching soon" state
    }
  }, []);

  useEffect(() => {
    load();
    // Returning from Stripe (success/cancel) lands on /settings?billing=...
    if (typeof window !== "undefined" && window.location.search.includes("billing=")) {
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(load, 1500); // webhook may need a beat to land
    }
  }, [load]);

  const startCheckout = async (tier: string) => {
    setBusyTier(tier);
    setError("");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval, deviceId }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
      else setError(data.error || "Could not start checkout.");
    } catch {
      setError("Could not reach the billing service.");
    } finally {
      setBusyTier(null);
    }
  };

  const changePlan = async (tier: string) => {
    setBusyTier(tier);
    setError("");
    try {
      const grantKey = typeof window !== "undefined" ? window.sessionStorage.getItem("orleia.grantKey") || "" : "";
      const res = await fetch("/api/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval, deviceId, grantKey }),
      });
      const data = (await res.json()) as { ok?: boolean; granted?: boolean; error?: string };
      if (res.ok && data.ok) {
        await load();
      } else if (data.error === "granted" && !grantKey) {
        const key = window.prompt("Your plan is managed directly by Orleia. Enter your owner grant key to change it:");
        if (key) {
          window.sessionStorage.setItem("orleia.grantKey", key);
          setBusyTier(null);
          void changePlan(tier);
        }
      } else if (data.error === "granted") {
        setError("That grant key was not accepted.");
      } else {
        setError(data.error || "Could not change the plan.");
      }
    } catch {
      setError("Could not reach the billing service.");
    } finally {
      setBusyTier(null);
    }
  };

  const redeemCode = async () => {
    const raw = codeInput.trim();
    if (!raw) return;
    setRedeeming(true);
    setRedeemMsg(null);
    try {
      const res = await fetch("/api/billing/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: raw, deviceId }),
      });
      const data = (await res.json()) as { ok?: boolean; tier?: string; periodEnd?: string; error?: string };
      if (res.ok && data.ok) {
        const until = data.periodEnd ? new Date(data.periodEnd).toLocaleDateString() : "";
        const name = (data.tier || "").charAt(0).toUpperCase() + (data.tier || "").slice(1);
        setRedeemMsg({ kind: "ok", text: `🎉 Orleia ${name} is now active on this device${until ? ` until ${until}` : ""}.` });
        setCodeInput("");
        await load();
      } else {
        setRedeemMsg({ kind: "err", text: data.error || "Could not redeem the code." });
      }
    } catch {
      setRedeemMsg({ kind: "err", text: "Could not reach the billing service." });
    } finally {
      setRedeeming(false);
    }
  };

  const cancelSubscription = async () => {
    setBusyTier("cancel");
    setError("");
    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      const data = (await res.json()) as { ok?: boolean; periodEnd?: string; error?: string };
      if (res.ok && data.ok) {
        setConfirmingCancel(false);
        await load(); // refresh tier card to show "ends on <date>"
      } else {
        setError(data.error || "Could not cancel. Try the billing portal.");
      }
    } catch {
      setError("Could not reach the billing service.");
    } finally {
      setBusyTier(null);
    }
  };

  const openPortal = async () => {
    setBusyTier("portal");
    setError("");
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
      else setError(data.error || "Could not open the billing portal.");
    } catch {
      setError("Could not reach the billing service.");
    } finally {
      setBusyTier(null);
    }
  };

  const tier = state?.tier ?? "free";
  const used = state?.used ?? 0;
  const limit = state?.limit ?? NOOR_DAILY_LIMIT.free;
  const isPaid = tier !== "free";
  const pct = state?.limit === null ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));

  return (
    <div className="space-y-5">
      {/* Current tier + usage */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">
              {isPaid ? `Orleia ${tier.charAt(0).toUpperCase()}${tier.slice(1)}` : "Orleia Free"}
            </span>
          </div>
          {isPaid && state?.managed !== false && (
            <button
              onClick={openPortal}
              disabled={busyTier === "portal"}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {busyTier === "portal" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
              Manage subscription
            </button>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>Noor messages today</span>
            <span>
              {used} / {state?.limit === null ? "∞" : limit}
            </span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-primary")}
              style={{ width: `${state?.limit === null ? 100 : pct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Cap resets at midnight · device {deviceId.slice(0, 8)}…</p>
        </div>
        {isPaid && state?.cancelAtPeriodEnd && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            ⏳ Your plan ends on {state?.periodEnd ? new Date(state.periodEnd).toLocaleDateString() : "your renewal date"} — you keep full access until then, then it moves to the free plan. No further charges.
          </p>
        )}
        {isPaid && state?.managed === false && !state?.cancelAtPeriodEnd && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            ✓ Active until {state?.periodEnd ? new Date(state.periodEnd).toLocaleDateString() : "—"} · activated with a one-time code
          </p>
        )}
      </div>

      {isPaid && state?.managed !== false && !state?.cancelAtPeriodEnd && (
        confirmingCancel ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
            <p className="text-sm font-medium">Cancel your subscription?</p>
            <p className="text-xs text-muted-foreground">
              You keep every perk until the end of the period you already paid for
              {state?.periodEnd ? ` (${new Date(state.periodEnd).toLocaleDateString()})` : ""}. After that, Orleia moves back to the free plan — 30 Noor messages a day. No further charges.
            </p>
            <div className="flex gap-2">
              <button
                onClick={cancelSubscription}
                disabled={busyTier === "cancel"}
                className="rounded-lg border border-red-500/50 px-4 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                {busyTier === "cancel" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Yes, cancel my plan"}
              </button>
              <button
                onClick={() => setConfirmingCancel(false)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium hover:border-foreground/50 transition-colors"
              >
                Keep my plan
                </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingCancel(true)}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Cancel subscription
          </button>
        )
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* One-time code redemption */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2.5">
        <div className="flex items-center gap-2">
          <Ticket className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Have a one-time code?</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Redeem it to activate a plan on <span className="font-mono">this device</span> — each code works once.
        </p>
        <div className="flex gap-2">
          <input
            value={codeInput}
            onChange={(e) => {
              setCodeInput(e.target.value.toUpperCase());
              setRedeemMsg(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void redeemCode();
            }}
            placeholder="ORL-XXXX-XXXX-XXXX"
            spellCheck={false}
            autoCapitalize="characters"
            autoComplete="off"
            className="flex-1 min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono tracking-wider uppercase placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 transition-colors"
          />
          <button
            onClick={() => void redeemCode()}
            disabled={redeeming || !codeInput.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
          >
            {redeeming && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Redeem
          </button>
        </div>
        {redeemMsg && (
          <p className={redeemMsg.kind === "ok" ? "text-xs text-emerald-600 dark:text-emerald-400" : "text-xs text-red-500"}>
            {redeemMsg.text}
          </p>
        )}
      </div>

      {/* Launching-soon state */}
      {state && !state.billingConfigured && !isPaid && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-4 text-center">
          <Sparkles className="h-5 w-5 mx-auto text-primary mb-2" />
          <p className="text-sm font-medium">Paid plans are launching soon</p>
          <p className="mt-1 text-xs text-muted-foreground">
            You&apos;re on the free tier with {NOOR_DAILY_LIMIT.free} Noor messages a day. Upgrade cards will activate the moment billing goes live.
          </p>
        </div>
      )}

      {/* Interval toggle */}
      <div className="flex items-center justify-center gap-1 rounded-full border border-border p-1 w-fit mx-auto">
        {(["monthly", "yearly"] as const).map((i) => (
          <button
            key={i}
            onClick={() => setIntervalChoice(i)}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-medium capitalize transition-colors",
              interval === i ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {i}
            {i === "yearly" && <span className="ml-1.5 text-[10px] text-emerald-500">−20%</span>}
          </button>
        ))}
      </div>

      {/* Plan cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {PAID_PLANS.map((plan) => {
          const current = tier === plan.tier;
          const price = interval === "yearly" ? plan.yearly : plan.monthly;
          return (
            <div
              key={plan.tier}
              className={cn(
                "rounded-2xl border p-6 flex flex-col gap-4 transition-colors",
                current ? "border-primary bg-primary/5" : "border-border bg-card hover:border-muted-foreground/40"
              )}
            >
              <div>
                <p className="text-lg font-bold">{plan.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{plan.blurb}</p>
              </div>
              <div>
                <span className="text-4xl font-bold tracking-tight">{fmtPrice(price)}</span>
                <span className="text-sm text-muted-foreground">/{interval === "yearly" ? "yr" : "mo"}</span>
              </div>
              <ul className="space-y-2.5 flex-1">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
                    {perk}
                  </li>
                ))}
              </ul>
              {current ? (
                <span className="rounded-xl border border-primary py-3 text-center text-sm font-medium text-primary">Current plan</span>
              ) : state && !state.billingConfigured ? (
                <span className="rounded-xl border border-border py-3 text-center text-sm text-muted-foreground">Included in your plan</span>
              ) : isPaid ? (
                <button
                  onClick={() => changePlan(plan.tier)}
                  disabled={busyTier === plan.tier}
                  className="rounded-xl border border-border py-3 text-sm font-medium transition-colors hover:border-foreground/50 disabled:opacity-50"
                >
                  {busyTier === plan.tier ? (
                    <Loader2 className="h-4 w-4 mx-auto animate-spin" />
                  ) : PLAN_RANK[plan.tier] > PLAN_RANK[tier as Exclude<Tier, "free">] ? (
                    `Upgrade to ${plan.name}`
                  ) : (
                    `Downgrade to ${plan.name}`
                  )}
                </button>
              ) : (
                <button
                  onClick={() => startCheckout(plan.tier)}
                  disabled={busyTier === plan.tier || (!!state && !state.billingConfigured)}
                  className="rounded-xl border border-border py-3 text-sm font-medium transition-colors hover:border-foreground/50 disabled:opacity-50"
                >
                  {busyTier === plan.tier ? <Loader2 className="h-4 w-4 mx-auto animate-spin" /> : `Upgrade to ${plan.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
