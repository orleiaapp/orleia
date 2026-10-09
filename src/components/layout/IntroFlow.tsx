"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon, Monitor, ListTodo, CheckCircle2, FileText, Flower2, Sparkles, Users, Share2, Search, Newspaper, Globe, X } from "lucide-react";
import { storage } from "@/lib/storage";
import type { AccentColor } from "@/types";
import { cn, EASE_OUT } from "@/lib/utils";
import { AgeGate } from "./AgeGate";

// Animated star field for the opening screen: white stars wandering on a
// near-black sky, hairline links that breathe as neighbours approach, and
// the occasional meteor streaking past. Renders a single static frame
// under prefers-reduced-motion.
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
    let lastT = 0;
    type Star = {
      bx: number; by: number; // anchor point, drifts slowly across the sky
      vx: number; vy: number; // anchor drift, px per ms
      ax: number; ay: number; // wobble amplitudes, px
      sp: number; ph: number; // wobble speed (rad/ms) and phase
      r: number; a: number; // radius and base alpha
      wf: number; wp: number; // twinkle frequency and phase
    };
    type Meteor = { x: number; y: number; vx: number; vy: number; born: number; life: number };
    let stars: Star[] = [];
    let meteors: Meteor[] = [];
    let nextMeteor = 900;
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
        bx: Math.random() * w,
        by: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.008,
        vy: (Math.random() - 0.5) * 0.008,
        ax: 6 + Math.random() * 16,
        ay: 5 + Math.random() * 13,
        sp: 0.0002 + Math.random() * 0.00045,
        ph: Math.random() * Math.PI * 2,
        r: 0.4 + Math.random() * 1.3,
        a: 0.3 + Math.random() * 0.65,
        wf: 0.001 + Math.random() * 0.0025,
        wp: Math.random() * Math.PI * 2,
      }));
      meteors = [];
      nextMeteor = 900;
    };
    const LINK = 110; // px — beyond this two stars aren't connected
    const frame = (t: number) => {
      const dt = lastT === 0 ? 16 : Math.min(50, t - lastT);
      lastT = t;
      ctx.clearRect(0, 0, w, h);
      // Per-star position: anchor drift + a slow elliptical wobble, so the
      // whole sky is in motion instead of only creeping one way.
      const px: number[] = [];
      const py: number[] = [];
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        if (!reduced) {
          s.bx += s.vx * dt;
          s.by += s.vy * dt;
          if (s.bx < -40) s.bx = w + 40;
          else if (s.bx > w + 40) s.bx = -40;
          if (s.by < -40) s.by = h + 40;
          else if (s.by > h + 40) s.by = -40;
        }
        px[i] = s.bx + (reduced ? 0 : s.ax * Math.sin(t * s.sp + s.ph));
        py[i] = s.by + (reduced ? 0 : s.ay * Math.cos(t * s.sp * 0.8 + s.ph));
      }
      // Hairlines between near neighbours — quadratic falloff makes links
      // brighten and dim on their own as the stars wander.
      ctx.lineWidth = 1;
      for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
          const dx = px[i] - px[j];
          const dy = py[i] - py[j];
          const d = Math.hypot(dx, dy);
          if (d < LINK) {
            const near = 1 - d / LINK;
            ctx.strokeStyle = `rgba(255,255,255,${(near * near * 0.3).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(px[i], py[i]);
            ctx.lineTo(px[j], py[j]);
            ctx.stroke();
          }
        }
      }
      // Stars: deep twinkle, each on its own beat, plus a breathing radius.
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const tw = reduced ? 1 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.wf + s.wp));
        ctx.fillStyle = `rgba(255,255,255,${(s.a * tw).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px[i], py[i], s.r * (0.75 + 0.5 * tw), 0, Math.PI * 2);
        ctx.fill();
      }
      // Meteors: a bright head with a fading tail, every few seconds.
      if (!reduced) {
        if (t > nextMeteor) {
          const fromLeft = Math.random() < 0.5;
          const ang = ((fromLeft ? 38 : 142) + (Math.random() - 0.5) * 24) * (Math.PI / 180);
          const spd = 0.5 + Math.random() * 0.4; // px per ms
          meteors.push({
            x: fromLeft ? Math.random() * w * 0.35 : w * 0.65 + Math.random() * w * 0.35,
            y: Math.random() * h * 0.3,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            born: t,
            life: 900 + Math.random() * 700,
          });
          nextMeteor = t + 1500 + Math.random() * 3000;
        }
        meteors = meteors.filter((m) => t - m.born < m.life);
        for (const m of meteors) {
          const age = (t - m.born) / m.life;
          const fade = age < 0.12 ? age / 0.12 : (1 - age) / 0.88;
          m.x += m.vx * dt;
          m.y += m.vy * dt;
          const len = Math.hypot(m.vx, m.vy) || 1;
          const tail = 130;
          const tx = m.x - (m.vx / len) * tail;
          const ty = m.y - (m.vy / len) * tail;
          const grad = ctx.createLinearGradient(m.x, m.y, tx, ty);
          grad.addColorStop(0, `rgba(255,255,255,${(0.9 * fade).toFixed(3)})`);
          grad.addColorStop(1, "rgba(255,255,255,0)");
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          ctx.fillStyle = `rgba(255,255,255,${fade.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(m.x, m.y, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.lineWidth = 1;
      }
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    seed();
    if (reduced) frame(0);
    else raf = requestAnimationFrame(frame);
    const onResize = () => {
      seed();
      if (reduced) frame(0);
    };
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
      <div className="relative z-10 mt-auto md:my-auto flex w-full flex-col items-center px-6 pb-[max(4.5rem,env(safe-area-inset-bottom))]">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.7, ease: EASE_OUT }}
          className="mb-4 text-center font-sans text-sm tracking-[0.35em] text-zinc-500"
        >
          orleia.
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7, ease: EASE_OUT }}
          className="text-center font-sans text-4xl font-bold tracking-tight text-white md:text-6xl"
        >
          Do it your way
        </motion.h1>
        <motion.button
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6, ease: EASE_OUT }}
          whileTap={{ scale: 0.97 }}
          onClick={(e) => { e.stopPropagation(); onDone(); }}
          className="mt-7 rounded-full bg-white px-9 py-3.5 font-sans text-sm font-medium text-black shadow-[0_0_36px_-8px_rgba(255,255,255,0.5)] transition-colors hover:bg-zinc-200"
        >
          Get started
        </motion.button>
      </div>
    </div>
  );
}
function EverythingStep({ onDone }: { onDone: () => void }) {
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
  // Motion graphic: the five tools start scattered, converge into the one
  // home card, then fly back out — a looping "everything comes together".
  const tools = [
    { label: "Tasks", Icon: ListTodo, sx: -100, sy: -58, d: 0 },
    { label: "Habits", Icon: CheckCircle2, sx: 100, sy: -66, d: 0.4 },
    { label: "Notes", Icon: FileText, sx: -104, sy: 32, d: 0.8 },
    { label: "Journal", Icon: Flower2, sx: 104, sy: 26, d: 1.2 },
    { label: "Noor", Icon: Sparkles, sx: 0, sy: -98, d: 1.6 },
  ];
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-[#050508] outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-inset"
      onClick={onDone}
      role="button"
      tabIndex={0}
      aria-label="Continue"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[64%]"
        style={{
          maskImage: "linear-gradient(to bottom, black 55%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent)",
        }}
      >
        <Constellation />
      </div>
      <div className="relative z-10 mt-auto md:my-auto flex w-full flex-col items-center px-6 pb-[max(4.5rem,env(safe-area-inset-bottom))]">
        {/* Motion graphic: tool chips converge into the one home card. */}
        <div className="relative mx-auto mb-2 h-44 w-full max-w-sm">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <motion.div
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="flex h-24 w-36 flex-col gap-2 rounded-2xl border border-zinc-700 bg-zinc-900 p-3.5 shadow-lg"
            >
              {["60%", "85%", "45%"].map((wdt, i) => (
                <motion.span
                  key={wdt}
                  className="block h-2 rounded-full bg-zinc-700"
                  style={{ width: wdt }}
                  animate={{ opacity: [0.3, 0.8, 0.3] }}
                  transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.4, ease: "easeInOut" }}
                />
              ))}
            </motion.div>
          </div>
          {tools.map(({ label, Icon, sx, sy, d }) => (
            <div key={label} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <motion.div
                className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 shadow-md"
                initial={{ x: sx, y: sy, opacity: 0, scale: 0.85 }}
                animate={{ x: [sx, sx, 0], y: [sy, sy, 0], opacity: [0, 1, 1, 0], scale: [0.85, 1, 1, 0.55] }}
                transition={{ duration: 3.4, times: [0, 0.28, 0.78, 1], repeat: Infinity, delay: d, ease: "easeInOut" }}
              >
                <Icon className="h-3.5 w-3.5 text-primary-500" />
                {label}
              </motion.div>
            </div>
          ))}
        </div>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7, ease: EASE_OUT }}
          className="text-center font-sans text-3xl font-bold tracking-tight text-white md:text-5xl"
        >
          Everything, one place.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55, duration: 0.7, ease: EASE_OUT }}
          className="mt-3 max-w-sm text-center text-xs leading-relaxed text-zinc-500"
        >
          Tasks, habits, notes, journal and Noor live together on one home
          screen — no more hopping between places to get things done.
        </motion.p>
        <motion.button
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.6, ease: EASE_OUT }}
          whileTap={{ scale: 0.97 }}
          onClick={(e) => { e.stopPropagation(); onDone(); }}
          className="mt-7 rounded-full bg-white px-9 py-3.5 font-sans text-sm font-medium text-black shadow-[0_0_36px_-8px_rgba(255,255,255,0.5)] transition-colors hover:bg-zinc-200"
        >
          Continue
        </motion.button>
      </div>
    </div>
  );
}

// Goals → saved to profile.goals, which buildProfileBlock() already injects
// into Noor's system prompt ("tailor suggestions to their goals").
// A picker, not a blank box: tap any number of preset goals, add your own
// below; Continue saves everything as one comma-separated string.
const GOAL_PRESETS = [
  "Build better habits",
  "Get more done",
  "Sleep better",
  "Get fit",
  "Read more",
  "Learn something new",
  "Reduce stress",
  "Grow my business",
  "Save money",
  "Be more present",
];

function GoalsStep({ onDone }: { onDone: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const toggle = (goal: string) =>
    setPicked((p) => (p.includes(goal) ? p.filter((g) => g !== goal) : [...p, goal]));
  const addDraft = () => {
    const value = draft.trim();
    if (value && !picked.includes(value)) setPicked((p) => [...p, value]);
    setDraft("");
  };
  const save = () => {
    const value = draft.trim();
    const goals = [...picked, ...(value && !picked.includes(value) ? [value] : [])]
      .join(", ")
      .slice(0, 400);
    storage.updateProfile({ goals });
    onDone();
  };
  const customs = picked.filter((g) => !GOAL_PRESETS.includes(g));
  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-[#050508] outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-inset">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[64%]"
        style={{
          maskImage: "linear-gradient(to bottom, black 55%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent)",
        }}
      >
        <Constellation />
      </div>
      {/* Scroll container: the inner mt-auto pins content to the bottom when
          it fits and degrades to a normal top-anchored scroll on short
          screens, so the chips can never get clipped by the fixed viewport. */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-16 pb-[max(4.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-md flex-col items-center md:my-auto">
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.7, ease: EASE_OUT }}
            className="text-center font-sans text-3xl font-bold tracking-tight text-white md:text-4xl"
          >
            What are you working toward?
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.7, ease: EASE_OUT }}
            className="mt-3 max-w-sm text-center text-xs leading-relaxed text-zinc-500"
          >
            Noor reads this and adapts — plans, nudges and check-ins shaped
            around your goals.
          </motion.p>

          <div className="mt-6 flex w-full flex-wrap justify-center gap-2">
            {GOAL_PRESETS.map((goal, i) => {
              const on = picked.includes(goal);
              return (
                <motion.button
                  key={goal}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(goal)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 + i * 0.04, duration: 0.5, ease: EASE_OUT }}
                  whileTap={{ scale: 0.96 }}
                  className={
                    on
                      ? "rounded-full border border-white bg-white px-3.5 py-2 text-xs font-medium text-black"
                      : "rounded-full border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
                  }
                >
                  {goal}
                </motion.button>
              );
            })}
            {customs.map((goal) => (
              <motion.button
                key={goal}
                type="button"
                aria-label={`Remove ${goal}`}
                onClick={() => toggle(goal)}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: EASE_OUT }}
                whileTap={{ scale: 0.96 }}
                className="group flex items-center gap-1.5 rounded-full border border-white bg-white px-3.5 py-2 text-xs font-medium text-black"
              >
                {goal}
                <X className="h-3 w-3 opacity-40 group-hover:opacity-90" aria-hidden="true" />
              </motion.button>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5, ease: EASE_OUT }}
            className="mt-5 flex w-full items-center gap-2"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addDraft();
                }
              }}
              placeholder="…or type your own"
              aria-label="Add a goal of your own"
              maxLength={60}
              className="min-w-0 flex-1 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-500"
            />
            <motion.button
              type="button"
              onClick={addDraft}
              disabled={!draft.trim()}
              whileTap={{ scale: 0.96 }}
              className="shrink-0 rounded-full border border-zinc-700 px-4 py-3 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:opacity-40"
            >
              Add
            </motion.button>
          </motion.div>

          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.5, ease: EASE_OUT }}
            whileTap={{ scale: 0.97 }}
            onClick={save}
            className="mt-7 w-full rounded-full bg-white px-9 py-3.5 font-sans text-sm font-medium text-black shadow-[0_0_36px_-8px_rgba(255,255,255,0.5)] transition-colors hover:bg-zinc-200"
          >
            Continue
          </motion.button>
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.85, duration: 0.5, ease: EASE_OUT }}
            onClick={onDone}
            className="mt-3 py-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Skip for now
          </motion.button>
        </div>
      </div>
    </div>
  );
}

// Acquisition source — stored on the local profile (hearAbout). Tap a row
// to save and advance immediately.
function SourceStep({ onDone }: { onDone: () => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const options = [
    { key: "friends", label: "Friends or family", Icon: Users },
    { key: "social", label: "Social media", Icon: Share2 },
    { key: "search", label: "Search engine", Icon: Search },
    { key: "press", label: "News or press", Icon: Newspaper },
    { key: "other", label: "Somewhere else", Icon: Globe },
  ];
  const pick = (key: string) => {
    if (picked) return;
    setPicked(key);
    storage.updateProfile({ hearAbout: key });
    timer.current = window.setTimeout(onDone, 350);
  };
  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-[#050508] outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-inset">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[64%]"
        style={{
          maskImage: "linear-gradient(to bottom, black 55%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent)",
        }}
      >
        <Constellation />
      </div>
      <div className="relative z-10 mt-auto md:my-auto flex w-full flex-col items-center px-6 pb-[max(4.5rem,env(safe-area-inset-bottom))]">
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.7, ease: EASE_OUT }}
          className="text-center font-sans text-3xl font-bold tracking-tight text-white md:text-5xl"
        >
          Where did you hear about us?
        </motion.h1>
        <div className="mt-6 flex w-full max-w-sm flex-col gap-2.5">
          {options.map(({ key, label, Icon }, i) => (
            <motion.button
              key={key}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.05, duration: 0.6, ease: EASE_OUT }}
              whileTap={{ scale: 0.98 }}
              onClick={() => pick(key)}
              aria-pressed={picked === key}
              className={
                picked && picked !== key
                  ? "flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3.5 text-sm text-zinc-600 opacity-40 shadow-md transition-colors"
                  : picked === key
                    ? "flex items-center gap-3 rounded-2xl border border-white/60 bg-zinc-800 px-4 py-3.5 text-sm font-medium text-white shadow-md transition-colors"
                    : "flex items-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3.5 text-sm text-zinc-200 shadow-md transition-colors hover:border-zinc-500 hover:bg-zinc-800"
              }
            >
              <Icon className="h-4 w-4 shrink-0 text-primary-500" />
              {label}
              {picked === key && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.4, ease: EASE_OUT }}
                  className="ml-auto"
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                </motion.span>
              )}
            </motion.button>
          ))}
        </div>
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55, duration: 0.6, ease: EASE_OUT }}
          onClick={() => { if (!picked) onDone(); }}
          className="mt-5 py-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          Skip
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
  // Mobile: top-anchored (natural reading order, no dead space under the
  // keyboard). Desktop: the whole stack centers vertically via
  // justify-center + flex-none, so every step lands mid-screen.
  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-background md:justify-center">
      <div className="mt-14 flex w-full justify-center md:mt-0"><p className="text-xs tracking-[0.5em] text-muted-foreground/40">ORLEIA</p></div>
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE_OUT }} className="mt-10 text-center font-serif text-3xl font-light tracking-tight md:text-4xl">What should we call you?</motion.h1>
      <p className="mt-3 text-center text-sm text-muted-foreground">Just a name — it stays on your device and greets you every morning.</p>
      <div className="mt-8 flex w-full flex-1 md:flex-none flex-col items-center px-6">
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
      <div className="w-full px-6 pb-10 md:pb-4 pt-4"><div className="mx-auto w-full max-w-sm flex flex-col gap-2">
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
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-background md:justify-center">
      <div className="mt-14 flex w-full justify-center md:mt-0"><p className="text-xs tracking-[0.5em] text-muted-foreground/40">ORLEIA</p></div>
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE_OUT }} className="mt-10 text-center font-serif text-3xl font-light tracking-tight md:text-4xl">Pick your look</motion.h1>
      <div className="mt-8 w-full flex-1 md:flex-none md:overflow-visible overflow-y-auto px-6 pb-4">
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
      <div className="w-full px-6 pb-10 md:pb-4 pt-4"><div className="mx-auto w-full max-w-sm"><button onClick={onDone} className="w-full rounded-full bg-foreground px-8 py-3 text-sm font-medium text-background transition-all hover:opacity-90 active:scale-[0.98]">Start using Orleia</button></div></div>
    </div>
  );
}
const INTRO_STEP_KEY = "orleia-intro-step";

export function IntroFlow({ onComplete }: { onComplete: () => void }) {
  // Flow order: dark constellation welcome → "everything, one place" →
  // goals (Noor adapts) → acquisition source → 13+ → name → look & feel.
  const [step, setStep] = useState<"welcome" | "unified" | "goals" | "hear" | "age" | "name" | "appearance">(() => { if (typeof window === "undefined") return "welcome"; const saved = localStorage.getItem(INTRO_STEP_KEY); if (saved === "appearance" || saved === "name") return saved; return "welcome"; });
  useEffect(() => { if (step === "welcome") localStorage.removeItem(INTRO_STEP_KEY); else localStorage.setItem(INTRO_STEP_KEY, step); }, [step]);
  const afterWelcome = () => setStep("unified");
  const afterUnified = () => setStep("goals");
  const afterHear = () => setStep(storage.isAgeConfirmed() ? "name" : "age");
  const finish = () => { localStorage.removeItem(INTRO_STEP_KEY); storage.completeOnboarding(); onComplete(); };
  // Crossfades between steps use an explicit symmetric ease — smooth on
  // the way out and back in, no snap at either end.
  return (
    <AnimatePresence mode="wait">
      {step === "welcome" && <motion.div key="welcome" exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}><WelcomeStep onDone={afterWelcome} /></motion.div>}
      {step === "unified" && <motion.div key="unified" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}><EverythingStep onDone={afterUnified} /></motion.div>}
      {step === "goals" && <motion.div key="goals" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}><GoalsStep onDone={() => setStep("hear")} /></motion.div>}
      {step === "hear" && <motion.div key="hear" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}><SourceStep onDone={afterHear} /></motion.div>}
      {step === "age" && <AgeGate key="age" onConfirmed={() => setStep("name")} />}
      {step === "name" && <motion.div key="name" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}><NameStep onDone={() => setStep("appearance")} /></motion.div>}
      {step === "appearance" && <motion.div key="appearance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}><AppearanceStep onDone={finish} /></motion.div>}
    </AnimatePresence>
  );
}