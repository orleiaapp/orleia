"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon, Monitor } from "lucide-react";
import { storage } from "@/lib/storage";
import type { AccentColor } from "@/types";
import { cn } from "@/lib/utils";
import { AgeGate } from "./AgeGate";

// Animated star field for the opening screen: white stars drifting on a
// near-black sky, hairline links between neighbours. Static under
// prefers-reduced-motion (stars still render, they just don't move).
function Constellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    type Star = { x: number; y: number; vx: number; vy: number; r: number; a: number; p: number };
    let stars: Star[] = [];
    const seed = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(110, Math.max(45, (w * h) / 9000)));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.06,
        vy: (Math.random() - 0.5) * 0.06,
        r: 0.4 + Math.random() * 1.2,
        a: 0.25 + Math.random() * 0.6,
        p: Math.random() * Math.PI * 2,
      }));
    };
    const LINK = 110; // px — beyond this two stars aren't connected
    const frame = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      // Hairlines between near neighbours.
      ctx.lineWidth = 1;
      for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
          const dx = stars[i].x - stars[j].x;
          const dy = stars[i].y - stars[j].y;
          const d = Math.hypot(dx, dy);
          if (d < LINK) {
            ctx.strokeStyle = `rgba(255,255,255,${((1 - d / LINK) * 0.18).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(stars[i].x, stars[i].y);
            ctx.lineTo(stars[j].x, stars[j].y);
            ctx.stroke();
          }
        }
      }
      // Stars, with a slow twinkle and drift.
      for (const s of stars) {
        if (!reduced) {
          s.x += s.vx;
          s.y += s.vy;
          if (s.x < -6) s.x = w + 6;
          else if (s.x > w + 6) s.x = -6;
          if (s.y < -6) s.y = h + 6;
          else if (s.y > h + 6) s.y = -6;
        }
        const tw = reduced ? 1 : 0.7 + 0.3 * Math.sin(t * 0.0012 + s.p);
        ctx.fillStyle = `rgba(255,255,255,${(s.a * tw).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    seed();
    raf = requestAnimationFrame(frame);
    const onResize = () => seed();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden />;
}

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
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        onDone();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onDone]);
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-[#050508] outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-inset"
      onClick={onDone}
      role="button"
      tabIndex={0}
      aria-label="Get started"
    >
      {/* Constellation fills the top of the screen and fades into the black
          before the headline, so the sky reads as depth not wallpaper. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[64%]"
        style={{
          maskImage: "linear-gradient(to bottom, black 55%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent)",
        }}
      >
        <Constellation />
      </div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.9 }}
        className="relative z-10 pt-[max(2.25rem,env(safe-area-inset-top))] text-center font-sans text-sm tracking-[0.35em] text-zinc-500"
      >
        orleia.
      </motion.p>
      <div className="relative z-10 mt-auto flex w-full flex-col items-center gap-7 px-6 pb-[max(2.75rem,env(safe-area-inset-bottom))]">
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.9 }}
          className="text-center font-sans text-4xl font-light tracking-tight text-white md:text-6xl"
        >
          Do it your way
        </motion.h1>
        <motion.button
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75, duration: 0.8 }}
          onClick={(e) => { e.stopPropagation(); onDone(); }}
          className="rounded-full bg-white px-9 py-3.5 font-sans text-sm font-medium text-black shadow-[0_0_36px_-8px_rgba(255,255,255,0.5)] transition-all hover:bg-zinc-200 active:scale-[0.97]"
        >
          Get started
        </motion.button>
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
  // Flow order (user-specified): the multilingual welcome owns the first
  // screen alone, THEN the 13+ declaration, then name + look & feel.
  const [step, setStep] = useState<"welcome" | "age" | "name" | "appearance">(() => { if (typeof window === "undefined") return "welcome"; const saved = localStorage.getItem(INTRO_STEP_KEY); if (saved === "appearance" || saved === "name") return saved; return "welcome"; });
  useEffect(() => { if (step === "welcome") localStorage.removeItem(INTRO_STEP_KEY); else localStorage.setItem(INTRO_STEP_KEY, step); }, [step]);
  const afterWelcome = () => setStep(storage.isAgeConfirmed() ? "name" : "age");
  const finish = () => { localStorage.removeItem(INTRO_STEP_KEY); storage.completeOnboarding(); onComplete(); };
  return (
    <AnimatePresence mode="wait">
      {step === "welcome" && <motion.div key="welcome" exit={{ opacity: 0 }} transition={{ duration: 0.3 }}><WelcomeStep onDone={afterWelcome} /></motion.div>}
      {step === "age" && <AgeGate key="age" onConfirmed={() => setStep("name")} />}
      {step === "name" && <motion.div key="name" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}><NameStep onDone={() => setStep("appearance")} /></motion.div>}
      {step === "appearance" && <motion.div key="appearance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}><AppearanceStep onDone={finish} /></motion.div>}
    </AnimatePresence>
  );
}