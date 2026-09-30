"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon, Monitor } from "lucide-react";
import { storage } from "@/lib/storage";
import type { AccentColor } from "@/types";
import { cn } from "@/lib/utils";

const GREETINGS = ["welcome","bienvenue","willkommen","bienvenido","benvenuto","bem-vindo","welkom","witaj","hoş geldiniz","ようこそ","欢迎","مرحبًا"];

const ACCENT_COLORS: { key: AccentColor; label: string; cls: string }[] = [
  { key: "slate", label: "Slate", cls: "bg-zinc-400" },
  { key: "amber", label: "Amber", cls: "bg-amber-500" },
  { key: "emerald", label: "Emerald", cls: "bg-emerald-500" },
  { key: "sky", label: "Sky", cls: "bg-sky-500" },
  { key: "violet", label: "Violet", cls: "bg-violet-500" },
  { key: "rose", label: "Rose", cls: "bg-rose-500" },
  { key: "orange", label: "Orange", cls: "bg-orange-500" },
];
function WelcomeStep({ onDone }: { onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const [count, setCount] = useState(0);
  const [fading, setFading] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const word = GREETINGS[idx];
  const done = count >= word.length;
  useEffect(() => { const t = setTimeout(() => setCount(1), 500); return () => clearTimeout(t); }, []);
  useEffect(() => { if (count > 0 && count < word.length && !fading) { const t = setTimeout(() => setCount(c => c + 1), 100); return () => clearTimeout(t); } }, [count, word.length, fading]);
  useEffect(() => { if (fading) { const t = setTimeout(() => { setIdx(i => (i + 1) % GREETINGS.length); setCount(0); setFading(false); }, 350); return () => clearTimeout(t); } }, [fading]);
  useEffect(() => { if (idx > 0 && count === 0 && !fading) { const t = setTimeout(() => setCount(1), 400); return () => clearTimeout(t); } }, [idx, count, fading]);
  useEffect(() => { if (!done || fading) return; const t = setTimeout(() => setFading(true), 1800); return () => clearTimeout(t); }, [done, fading]);
  useEffect(() => { if (done && !hintShown) setHintShown(true); }, [done, hintShown]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); if (!done) setCount(word.length); else onDone(); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [done, onDone, word.length]);
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-inset"
      onClick={() => done ? onDone() : setCount(word.length)}
      role="button"
      tabIndex={0}
      aria-label={done ? "Continue" : "Skip animation"}
    >
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.8 }} className="mb-10 text-xs tracking-[0.5em] text-muted-foreground/40">ORLEIA</motion.p>
      <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: fading ? 0 : 1 }} transition={{ duration: 0.35 }} className="font-serif text-5xl font-light tracking-tight text-foreground md:text-7xl">
        <span dir="auto">{word.slice(0, count)}</span>
        {!fading && <span className="ml-1 inline-block h-[0.8em] w-[2px] translate-y-[0.06em] animate-pulse bg-foreground/70" />}
      </motion.h1>
      <div className="mt-10 flex h-12 items-start justify-center">
        {hintShown && <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-[11px] tracking-widest text-muted-foreground/50">tap or press space to continue</motion.p>}
      </div>
    </div>
  );
}
function NameStep({ onDone }: { onDone: (name: string) => void }) {
  const [name, setName] = useState("");
  const submit = () => {
    const trimmed = name.trim().slice(0, 40);
    if (trimmed) {
      storage.updateProfile({ name: trimmed });
      // Persist immediately so a reload mid-onboarding keeps the name.
      try { storage.saveData(); } catch { /* ignore */ }
    }
    onDone(trimmed);
  };
  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-background">
      <div className="mt-14 flex w-full justify-center md:mt-16"><p className="text-xs tracking-[0.5em] text-muted-foreground/40">ORLEIA</p></div>
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mt-10 text-center font-serif text-3xl font-light tracking-tight md:text-4xl">What should we call you?</motion.h1>
      <p className="mt-3 text-center text-sm text-muted-foreground">Just a name — it stays on your device and greets you every morning.</p>
      <div className="mt-8 flex w-full flex-1 flex-col items-center px-6">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Your name"
          aria-label="Your name"
          autoFocus
          maxLength={40}
          className="w-full max-w-sm rounded-2xl border border-border bg-secondary/40 px-5 py-4 text-center text-lg outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-muted-foreground/40"
        />
      </div>
      <div className="w-full px-6 pb-10 pt-4"><div className="mx-auto w-full max-w-sm flex flex-col gap-2">
        <button onClick={submit} className="w-full rounded-full bg-foreground px-8 py-3 text-sm font-medium text-background transition-all hover:opacity-90 active:scale-[0.98]">Continue</button>
        <button onClick={() => onDone("")} className="w-full py-1 text-xs text-muted-foreground/70 transition-colors hover:text-foreground">I&apos;d rather not say</button>
      </div></div>
    </div>
  );
}
function AppearanceStep({ onDone }: { onDone: () => void }) {
  const initial = storage.getData().theme;
  const [mode, setMode] = useState(initial.theme || "system");
  const [accent, setAccent] = useState<AccentColor>(initial.accentColor || "slate");
  const [size, setSize] = useState(initial.fontSize || "md");
  const pickTheme = (m: "light" | "dark" | "system") => { storage.updateTheme({ theme: m }); const isDark = m === "dark" || (m === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches); document.documentElement.classList.toggle("dark", isDark); setMode(m); };
  const pickSize = (s: "sm" | "md" | "lg") => { storage.updateTheme({ fontSize: s }); document.documentElement.setAttribute("data-font-size", s); setSize(s); };
  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-background">
      <div className="mt-14 flex w-full justify-center md:mt-16"><p className="text-xs tracking-[0.5em] text-muted-foreground/40">ORLEIA</p></div>
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mt-10 text-center font-serif text-3xl font-light tracking-tight md:text-4xl">Pick your look</motion.h1>
      <div className="mt-8 w-full flex-1 overflow-y-auto px-6 pb-4">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
          <div><p className="mb-2.5 text-sm font-medium text-muted-foreground">Theme</p>
            <div className="grid grid-cols-3 gap-2">{([{ m: "light", icon: Sun, label: "Light" }, { m: "dark", icon: Moon, label: "Dark" }, { m: "system", icon: Monitor, label: "System" }] as const).map(({ m, icon: Icon, label }) => (
              <button key={m} onClick={() => pickTheme(m)} className={cn("flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs transition-all", mode === m ? "border-primary bg-primary/10 text-foreground" : "border-border bg-secondary/40 text-muted-foreground hover:border-muted-foreground/30")}>
                <Icon className="h-4 w-4" />{label}
              </button>))}</div></div>
          <div><p className="mb-2.5 text-sm font-medium text-muted-foreground">Accent colour</p>
            <div className="flex gap-2">{ACCENT_COLORS.map(c => (
              <button key={c.key} onClick={() => { storage.updateTheme({ accentColor: c.key }); document.documentElement.setAttribute("data-accent", c.key); setAccent(c.key); }} className={cn("flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all", accent === c.key ? "border-foreground scale-110" : "border-transparent hover:scale-105")} aria-label={c.label}>
                <span className={cn("h-5 w-5 rounded-full", c.cls)} />
              </button>))}</div></div>
          <div><p className="mb-2.5 text-sm font-medium text-muted-foreground">Font size</p>
            <div className="grid grid-cols-3 gap-2">{(["sm", "md", "lg"] as const).map(s => (
              <button key={s} onClick={() => pickSize(s)} className={cn("rounded-xl border px-3 py-2.5 text-sm transition-all", size === s ? "border-primary bg-primary/10 text-foreground" : "border-border bg-secondary/40 text-muted-foreground hover:border-muted-foreground/30")}>
                {s === "sm" ? "Small" : s === "md" ? "Medium" : "Large"}
              </button>))}</div></div>
        </div>
      </div>
      <div className="w-full px-6 pb-10 pt-4"><div className="mx-auto w-full max-w-sm"><button onClick={onDone} className="w-full rounded-full bg-foreground px-8 py-3 text-sm font-medium text-background transition-all hover:opacity-90 active:scale-[0.98]">Start using Orleia</button></div></div>
    </div>
  );
}
const INTRO_STEP_KEY = "orleia-intro-step";

export function IntroFlow({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<"welcome" | "name" | "appearance">(() => { if (typeof window === "undefined") return "welcome"; const saved = localStorage.getItem(INTRO_STEP_KEY); if (saved === "appearance" || saved === "name") return saved; return "welcome"; });
  useEffect(() => { if (step === "welcome") localStorage.removeItem(INTRO_STEP_KEY); else localStorage.setItem(INTRO_STEP_KEY, step); }, [step]);
  const finish = () => { localStorage.removeItem(INTRO_STEP_KEY); storage.completeOnboarding(); onComplete(); };
  return (
    <AnimatePresence mode="wait">
      {step === "welcome" && <motion.div key="welcome" exit={{ opacity: 0 }} transition={{ duration: 0.3 }}><WelcomeStep onDone={() => setStep("name")} /></motion.div>}
      {step === "name" && <motion.div key="name" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}><NameStep onDone={() => setStep("appearance")} /></motion.div>}
      {step === "appearance" && <motion.div key="appearance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}><AppearanceStep onDone={finish} /></motion.div>}
    </AnimatePresence>
  );
}