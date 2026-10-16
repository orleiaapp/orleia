"use client";

// ============================================================
// PlanIntro — the one-time full-screen plans takeover.
//
// Not a paywall: nothing is gated. Every new user sees it exactly
// once (remembered per device) as three short slides — what Noor
// is, what free includes, then the plans — in the same serif
// onboarding language as the name/appearance steps (ORLEIA
// wordmark, light serif headline, muted copy, pill CTA). One tap
// dismisses from any slide; a purchase starts on the last slide.
//
// Shown two ways:
//  - embedded (TutorialFlow) right after the pet confetti via
//    `onDone`, opening instantly and ending the tutorial;
//  - standalone (ClientLayout) for users who skip the pet step,
//    with a short delay and self-contained dismissal.
// ============================================================

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Check, ShieldCheck } from "lucide-react";
import { PAID_PLANS, fmtPrice } from "@/lib/plans";
import { getDeviceId } from "@/lib/device-id";
import { cn } from "@/lib/utils";

const SEEN_KEY = "orleia.planIntroSeen.v1";
const SLIDES = 3; // meet Noor → free every day → plans

/** The three value lines, split across the first two slides. */
const FREE_LINES = [
  "Every tool in Orleia is free, forever — habits, notes, calendar, journal.",
  "Noor is included free: 30 messages every day, no card required.",
  "Everything stays on your device — Noor reads your data locally.",
];
const VALUE_LINES = [
  "Turns one sentence into plans, habits and tasks.",
  "Answers from your real notes and data.",
  "Keeps up with the goals you set at setup.",
];

export function PlanIntro({ onDone }: { onDone?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  const [slide, setSlide] = useState(0);
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
    if (seen) {
      // Embedded in the tutorial: hand control back so the flow can end.
      onDone?.();
      return;
    }
    // Embedded opens instantly; standalone waits for the app to settle.
    const t = setTimeout(() => setOpen(true), onDone ? 0 : 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    onDone?.();
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
      className="fixed inset-0 z-[200] flex flex-col bg-background"
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

      {/* Scrollable body: wordmark, then the current slide. */}
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
        <div className="mt-14 flex w-full justify-center md:mt-0">
          <p className="text-xs tracking-[0.5em] text-muted-foreground/40">ORLEIA</p>
        </div>
        <div className="flex w-full flex-1 flex-col justify-center px-6 py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={slide}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="mx-auto flex w-full max-w-md flex-col"
            >
              {slide === 0 && (
                <>
                  <h1 className="text-center font-serif text-3xl font-light tracking-tight md:text-4xl">
                    Meet Noor, your AI
                  </h1>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    Noor reads your whole workspace and acts on it — create habits
                    and tasks, plan your day, find anything you&apos;ve written. Ask
                    in your own words; it answers with your real data.
                  </p>
                  <ul className="mt-6 space-y-2.5">
                    {VALUE_LINES.map((line) => (
                      <li key={line} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {slide === 1 && (
                <>
                  <h1 className="text-center font-serif text-3xl font-light tracking-tight md:text-4xl">
                    Free, every day
                  </h1>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    Orleia&apos;s tools cost nothing — and Noor comes with them. No
                    card, no trial clock.
                  </p>
                  <ul className="mt-6 space-y-2.5">
                    {FREE_LINES.map((line) => (
                      <li key={line} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {slide === 2 && (
                <>
                  <h1 className="text-center font-serif text-3xl font-light tracking-tight md:text-4xl">
                    When you want more
                  </h1>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
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
                  <div className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <p>
                      Cancel anytime, in one click, right here in Orleia. Your data never leaves
                      your device, on any plan — that&apos;s not a promise, it&apos;s the architecture.
                    </p>
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Docked footer: slide dots + the one obvious action. */}
      <div className="w-full shrink-0 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4">
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: SLIDES }, (_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                aria-label={`Slide ${i + 1} of ${SLIDES}`}
                aria-current={i === slide}
                className="p-2 -m-0.5"
              >
                <span
                  className={cn(
                    "block h-1.5 rounded-full transition-all",
                    i === slide ? "w-5 bg-foreground" : "w-1.5 bg-muted-foreground/30"
                  )}
                />
              </button>
            ))}
          </div>
          {slide < SLIDES - 1 ? (
            <button
              onClick={() => setSlide((s) => s + 1)}
              className="w-full rounded-full bg-foreground px-8 py-3 text-sm font-medium text-background transition-all hover:opacity-90 active:scale-[0.98]"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={dismiss}
              className="rounded-xl px-1 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Maybe later — take me to Orleia
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
