"use client";

import { useState } from "react";
import { ArrowRight, Check, MoveHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  ShellMock,
  DashboardMock,
  HabitsMock,
  JournalMock,
  TasksMock,
  NoorMock,
} from "./tutorial-mockups";

interface TutorialStep {
  key: string;
  Visual: React.ComponentType;
}

const steps: TutorialStep[] = [
  { key: "welcome", Visual: ShellMock },
  { key: "dashboard", Visual: DashboardMock },
  { key: "habits", Visual: HabitsMock },
  { key: "mindfulness", Visual: JournalMock },
  { key: "tasks", Visual: TasksMock },
  { key: "noor", Visual: NoorMock },
];

export function TutorialGuide({ onComplete }: { onComplete: () => void }) {
  const { t, lang } = useI18n();
  const [step, setStep] = useState(0);
  const current = steps[step];
  const isLast = step === steps.length - 1;
  const Visual = current.Visual;

  const kicker = t(`tutorial.${current.key}.kicker`);
  const title = t(`tutorial.${current.key}.title`);
  const desc = t(`tutorial.${current.key}.desc`);
  // Keep slides light: max 2 bullets, no location line — too much text
  // crowded a single phone screen.
  const points = [1, 2, 3, 4]
    .map((i) => {
      const v = t(`tutorial.${current.key}.p${i}`);
      return v && v !== `tutorial.${current.key}.p${i}` ? v : "";
    })
    .filter(Boolean)
    .slice(0, 2);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col overflow-hidden bg-background">
      {/* Top progress */}
      <div className="absolute inset-x-0 top-0 z-10 h-0.5 bg-muted">
        <div
          className="h-full bg-primary-500 transition-all duration-500 ease-out"
          style={{ width: `${((step + 1) / steps.length) * 100}%` }}
        />
      </div>

      {/*
        Mobile: one stable screen - overflow hidden, compact mockup + copy that
        both fit the viewport, actions pinned to the bottom. No scrolling.
        Desktop: roomier two-column layout.
      */}
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col overflow-hidden px-4 pb-5 pt-6 md:px-8 md:py-8">
        <div
          key={step + lang}
          className="flex min-h-0 w-full flex-1 flex-col justify-center md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-center md:gap-12"
        >
          {/* Visual - compact on mobile */}
          <div
            className="order-1 mb-4 flex justify-center md:mb-0"
            style={{ animation: "lx-fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both" }}
          >
            <div className="relative max-h-[30vh] w-full max-w-[240px] overflow-hidden md:max-h-none md:max-w-sm">
              {/* Glow */}
              <div className="absolute -inset-6 rounded-[2rem] bg-primary-500/5 blur-2xl" />
              <div className="relative">
                <Visual />
              </div>
            </div>
          </div>

          {/* Copy - compact typography on mobile so it never overflows */}
          <div className="order-2 flex min-h-0 flex-1 flex-col justify-center md:block">
            <p
              className="mb-2 text-[10px] font-sans tracking-widest text-muted-foreground/40 md:mb-4 md:text-[11px]"
              style={{ animation: "lx-fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both 0.05s" }}
            >
              {kicker}
            </p>

            <h2
              className="mb-1.5 text-xl font-bold tracking-tight leading-tight md:mb-3 md:text-4xl"
              style={{ animation: "lx-fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both 0.10s" }}
            >
              {title}
            </h2>

            <p
              className="mb-2.5 max-w-md text-xs leading-snug text-muted-foreground/80 md:mb-6 md:text-base md:leading-relaxed"
              style={{ animation: "lx-fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both 0.15s" }}
            >
              {desc}
            </p>

            {/* What you can do */}
            <ul className="mb-3 space-y-1.5 md:mb-6 md:space-y-2.5">
              {points.map((p, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs text-muted-foreground md:text-sm"
                  style={{
                    animation: `lx-fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both ${0.2 + i * 0.07}s`,
                  }}
                >
                  <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 md:h-4 md:w-4">
                    <Check className="h-2 w-2 text-emerald-500 md:h-2.5 md:w-2.5" />
                  </span>
                  {p}
                </li>
              ))}
            </ul>

            {/* Swipe gesture hint — first slide only, so later slides stay
                minimal (nav opens by swiping, like the rest of the app) */}
            {step === 0 && (
              <div
                className="mb-3 hidden items-start gap-2 rounded-xl border border-border bg-secondary/40 p-2.5 [@media(min-height:720px)]:flex md:hidden"
                style={{ animation: "lx-fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both 0.48s" }}
              >
                <MoveHorizontal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <p className="text-[11px] leading-snug text-muted-foreground/70">{t("tutorial.navHint")}</p>
              </div>
            )}

            {/* Actions */}
            <div
              className="flex items-center gap-3"
              style={{ animation: "lx-fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both 0.5s" }}
            >
              <button
                type="button"
                onClick={onComplete}
                className="text-xs text-muted-foreground/40 transition-colors hover:text-muted-foreground/70"
              >
                {t("tutorial.skip")}
              </button>

              <div className="flex-1" />

              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-secondary/40 active:scale-[0.98]"
                >
                  {t("tutorial.back")}
                </button>
              )}

              {isLast ? (
                <button
                  type="button"
                  onClick={onComplete}
                  className="inline-flex items-center gap-2 rounded-md bg-foreground px-5 py-2.5 text-xs font-medium text-background transition-all hover:opacity-90 active:scale-[0.98]"
                >
                  {t("tutorial.done")}
                  <Check className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  className="inline-flex items-center gap-2 rounded-md bg-foreground px-5 py-2.5 text-xs font-medium text-background transition-all hover:opacity-90 active:scale-[0.98]"
                >
                  {t("tutorial.next")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Dots */}
            <div
              className="mt-4 flex items-center gap-1.5 md:mt-6"
              style={{ animation: "lx-fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both 0.55s" }}
            >
              {steps.map((s, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => setStep(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    i === step ? "w-6 bg-foreground" : "w-1.5 bg-muted-foreground/20 hover:bg-muted-foreground/40"
                  )}
                  aria-label={t("tutorial.stepAria").replace("{n}", String(i + 1))}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
