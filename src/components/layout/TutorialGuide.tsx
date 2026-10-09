"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, MoveHorizontal } from "lucide-react";
import { EASE_OUT } from "@/lib/utils";
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

/* Directional slide: a slide glides in from the side you're heading toward
   and glides out the opposite way — one motion for the whole slide instead
   of a staggered cascade of parts snapping into place. custom lives on
   AnimatePresence so the exiting slide always sees the *current* direction.
   Drag follows the finger (dragSnapToOrigin rubber-bands it back). */
const slide = {
  enter: (dir: number) => ({ x: dir * 72, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -72, opacity: 0 }),
};

export function TutorialGuide({ onComplete }: { onComplete: () => void }) {
  const { t, lang } = useI18n();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const current = steps[step];
  const isLast = step === steps.length - 1;
  const Visual = current.Visual;

  const go = (next: number) => {
    if (next < 0 || next >= steps.length || next === step) return;
    setDir(next > step ? 1 : -1);
    setStep(next);
  };

  // Arrow keys on desktop; swipe (drag) or the buttons on touch.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(step + 1);
      else if (e.key === "ArrowLeft") go(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const kicker = t(`tutorial.${current.key}.kicker`);
  const title = t(`tutorial.${current.key}.title`);
  const desc = t(`tutorial.${current.key}.desc`);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col overflow-hidden bg-[#050508] text-white select-none">
      {/* Top progress — a single hairline; the slides carry the motion */}
      <div className="absolute inset-x-0 top-0 z-10 h-0.5 bg-white/10">
        <div
          className="h-full bg-white transition-[width] duration-500 ease-out"
          style={{ width: `${((step + 1) / steps.length) * 100}%` }}
        />
      </div>

      {/* One centered column: kicker → visual → title → desc. The action bar
          is stable chrome outside the slider, so buttons never move. */}
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-5 pb-6 pt-8 md:px-8 md:py-10">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={`${step}-${lang}`}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.45, ease: EASE_OUT }}
            drag="x"
            dragSnapToOrigin
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.16}
            onDragEnd={(_, info) => {
              if (info.offset.x < -90 || info.velocity.x < -550) go(step + 1);
              else if (info.offset.x > 90 || info.velocity.x > 550) go(step - 1);
            }}
            className="flex min-h-0 w-full flex-1 flex-col items-center justify-center text-center"
          >
            <p className="text-[11px] font-sans tracking-[0.35em] text-zinc-600">
              {kicker}
            </p>

            <div className="relative mb-8 mt-7 max-h-[30vh] w-full max-w-[250px] overflow-hidden md:max-h-none md:max-w-[320px]">
              {/* Soft glow behind the mockup */}
              <div className="absolute -inset-6 rounded-[2rem] bg-white/[0.04] blur-2xl" />
              <div className="relative">
                <Visual />
              </div>
            </div>

            <h2 className="font-sans text-3xl font-bold tracking-tight text-white md:text-4xl">
              {title}
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-500 md:text-base">
              {desc}
            </p>

            {/* Swipe-gesture hint — first slide only, understated */}
            {step === 0 && (
              <div className="mt-6 hidden items-center gap-2 [@media(min-height:720px)]:flex md:hidden">
                <MoveHorizontal className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                <p className="text-[11px] leading-snug text-zinc-600">
                  {t("tutorial.navHint")}
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Actions */}
        <div className="mt-6 flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={onComplete}
            className="text-xs text-zinc-600 transition-colors hover:text-zinc-300"
          >
            {t("tutorial.skip")}
          </button>

          <div className="flex-1" />

          {step > 0 && (
            <button
              type="button"
              onClick={() => go(step - 1)}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 px-4 py-2.5 text-xs font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("tutorial.back")}
            </button>
          )}

          <button
            type="button"
            onClick={() => (isLast ? onComplete() : go(step + 1))}
            className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-xs font-medium text-black shadow-[0_0_28px_-8px_rgba(255,255,255,0.5)] transition-all hover:bg-zinc-200 active:scale-[0.97]"
          >
            {t(isLast ? "tutorial.done" : "tutorial.next")}
            {isLast ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
