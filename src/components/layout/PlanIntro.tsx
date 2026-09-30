"use client";

// ============================================================
// PlanIntro — a one-time FULL-SCREEN plan takeover on app open.
//
// Not a paywall: nothing is gated. Every new user sees it exactly
// once (remembered per device), it occupies the entire screen, and
// it can be closed with a single tap. It exists because most users
// never open Settings → Billing and don't know plans exist — this
// is the one honest moment where Orleia shows them.
// ============================================================

import { useEffect, useState } from "react";
import { X, Sparkles, Check, ShieldCheck } from "lucide-react";
import { PAID_PLANS, fmtPrice } from "@/lib/plans";
import { getDeviceId } from "@/lib/device-id";
import { cn } from "@/lib/utils";

const SEEN_KEY = "orleia.planIntroSeen.v1";

export function PlanIntro() {
  const [open, setOpen] = useState(false);
  // Multi-step: step 1 sells the value (what Noor is, what free includes),
  // step 2 shows the plans. One decision per screen — plan cards only make
  // sense once you know what you'd be paying FOR.
  const [step, setStep] = useState<"value" | "plans">("value");
  const [yearly, setYearly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let seen = false;
    try {
      seen = window.localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      seen = true; // storage blocked -> stay quiet forever
    }
    if (seen) return;
    // Small delay so the splash/onboarding fully settles first.
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const upgrade = async (tier: string) => {
    setBusy(tier);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval: yearly ? "yearly" : "monthly", deviceId: getDeviceId() }),
      });
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        try {
          window.localStorage.setItem(SEEN_KEY, "1");
        } catch {
          /* ignore */
        }
        window.location.href = data.url;
        return;
      }
    } catch {
      /* fall through */
    }
    setBusy(null);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col overflow-y-auto bg-background"
      role="dialog"
      aria-modal="true"
      aria-label="Orleia plans"
    >
      {/* Close — always visible, one tap, never nagged again */}
      <button
        onClick={dismiss}
        aria-label="Close and continue to Orleia"
        className="fixed right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-12">
        {step === "value" ? (
        <>
        {/* Step 1 — the value story. No prices, no cards: what Noor is,
            what free includes, and one obvious next button. */}
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-500/10">
            <Sparkles className="h-5 w-5 text-primary-500" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Meet Noor, your AI
          </h1>
        </div>

        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Noor reads your whole workspace and acts on it — create habits and
          tasks, plan your day, find anything you&apos;ve written. Ask in your
          own words; it answers with your real data.
        </p>

        <ul className="mt-5 space-y-2.5">
          {[
            "Every tool in Orleia is free, forever — habits, notes, calendar, journal.",
            "Noor is included free: 30 messages every day, no card required.",
            "Everything stays on your device — Noor reads your data locally.",
          ].map((line) => (
            <li key={line} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              {line}
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-col gap-2.5">
          <button
            onClick={() => setStep("plans")}
            className="w-full max-w-sm rounded-full bg-foreground px-8 py-3 text-sm font-medium text-background transition-all hover:opacity-90 active:scale-[0.98]"
          >
            See what Plus and Pro add
          </button>
          <button
            onClick={dismiss}
            className="w-fit rounded-xl px-1 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Maybe later — take me to Orleia
          </button>
        </div>
        </>
        ) : (
        <>
        {/* Step 2 — the plans. */}
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-500/10">
            <Sparkles className="h-5 w-5 text-primary-500" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Noor has superpowers
          </h1>
        </div>

        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          If Noor becomes part of your routine, a plan removes the ceiling —{" "}
          <span className="font-medium text-foreground">300 to unlimited messages a day</span>.
        </p>

        {/* Interval toggle */}
        <div className="mt-6 flex w-fit items-center gap-1 rounded-full border border-border p-1">
          {(["monthly", "yearly"] as const).map((i) => (
            <button
              key={i}
              onClick={() => setYearly(i === "yearly")}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-medium capitalize transition-colors",
                (i === "yearly") === yearly
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {i}
              {i === "yearly" && <span className="ml-1.5 text-[10px] text-emerald-500">−20%</span>}
            </button>
          ))}
        </div>

        {/* Plan cards */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {PAID_PLANS.map((p) => (
            <button
              key={p.tier}
              onClick={() => upgrade(p.tier)}
              disabled={busy !== null}
              className="group flex flex-col rounded-2xl border border-border bg-card p-5 text-left transition-all hover:border-foreground/40 hover:bg-secondary/30 disabled:opacity-50"
            >
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-bold">Orleia {p.name}</span>
                  {p.popular && (
                    <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">Most popular</span>
                  )}
                </span>
                <Check className="h-4 w-4 shrink-0 text-emerald-500" />
              </span>
              <span className="mt-2 text-2xl font-bold tabular-nums tracking-tight">
                {fmtPrice(yearly ? p.yearly : p.monthly)}
                <span className="text-xs font-normal text-muted-foreground">/{yearly ? "yr" : "mo"}</span>
              </span>
              <span className="mt-2 text-xs leading-relaxed text-muted-foreground">{p.perks[0]}</span>
              <span className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.perks[1]}</span>
              <span className="mt-3 text-xs font-medium text-primary-500 opacity-0 transition-opacity group-hover:opacity-100">
                Continue →
              </span>
            </button>
          ))}
        </div>

        {/* Trust line */}
        <div className="mt-7 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          <p>
            Cancel anytime, in one click, right here in Orleia. Your data never leaves your device,
            on any plan — that's not a promise, it's the architecture.
          </p>
        </div>

        <button
          onClick={dismiss}
          className="mt-6 w-fit rounded-xl px-1 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Maybe later — take me to Orleia
        </button>
        </>
        )}
      </div>
    </div>
  );
}
