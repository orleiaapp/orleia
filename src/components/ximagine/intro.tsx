"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AgeGate } from "@/components/layout/AgeGate";

// Dark, constellation-free onboarding — same rhythm as Orleia's intro
// (welcome → what it is → age gate) but compact, because Ximagine does
// one thing.

const STEPS = [
  {
    n: "01",
    title: "Imagine",
    body: "Type an idea in plain words. Noor asks the right questions before anything is written.",
  },
  {
    n: "02",
    title: "Build",
    body: "Watch the app appear in a live preview — HTML, CSS and JS, written line by line.",
  },
  {
    n: "03",
    title: "Edit",
    body: "Every file is yours. Read it, change it, ask for a rebuild. It never leaves this device.",
  },
];

export function XimagineIntro({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050508] px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_18%,rgba(255,255,255,0.06),transparent_70%)]"
      />
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="relative w-full max-w-md text-center"
        >
          {step === 0 && (
            <>
              <p className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground/40">
                Ximagine · Beta 0.1
              </p>
              <h1 className="mt-5 text-5xl font-bold leading-[1.05] tracking-[-0.04em]">
                One sentence.
                <br />
                One app.
              </h1>
              <p className="mx-auto mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground/80">
                Describe a small tool — for exactly your job, for you alone — and it gets built.
                On your computer. The code is right there, and it&apos;s yours to change.
              </p>
              <button
                onClick={() => setStep(1)}
                className="mt-9 rounded-full bg-white px-8 py-3 text-sm font-medium text-black transition-all hover:opacity-90 active:scale-[0.97]"
              >
                Get started
              </button>
              <p className="mt-6 text-[11px] text-muted-foreground/40">
                Experimental beta ·{" "}
                <Link href="/ximagine-beta" className="underline underline-offset-2 hover:text-foreground/70 transition-colors">
                  Beta Terms &amp; Policies
                </Link>
              </p>
            </>
          )}

          {step === 1 && (
            <>
              <p className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground/40">How it works</p>
              <div className="mt-7 space-y-3 text-left">
                {STEPS.map((s) => (
                  <div
                    key={s.n}
                    className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4"
                  >
                    <span className="mt-0.5 text-[11px] tracking-widest text-muted-foreground/40">{s.n}</span>
                    <div>
                      <p className="text-sm font-semibold">{s.title}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground/70">{s.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground/45">
                Free during the beta: 50 builds &amp; questions a day. No account, nothing uploaded
                except the text you send to the AI.
              </p>
              <button
                onClick={() => setStep(2)}
                className="mt-7 rounded-full bg-white px-8 py-3 text-sm font-medium text-black transition-all hover:opacity-90 active:scale-[0.97]"
              >
                Continue
              </button>
            </>
          )}

          {step === 2 && (
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-7 text-left">
              <AgeGate onConfirmed={onDone} />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
