"use client";

// ============================================================
// Orleia Landing — minimal, alive, and substantial.
//
//   hero (grey vortex + big type + trust line)
//   → product bento (live micro-visuals: dashboard, breathing,
//     calendar, deck, privacy, tasks — all pure CSS, no images)
//   → stats strip
//   → Noor spotlight (mock conversation with citations)
//   → feature ribbon (infinite marquee)
//   → download (web / windows / linux)
//   → footer
// Keeps the theme + a11y contract with the app (flash-mount safe).
// ============================================================

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, useReducedMotion, useInView } from "framer-motion";
import { ArrowUpRight, ArrowRight, Menu, X, Shield, Check, Sparkles } from "lucide-react";
import { PAID_PLANS } from "@/lib/plans";
import { GMAIL_COMPOSE_HREF } from "@/lib/contact";
import InteractiveNeuralVortex from "@/components/ui/interactive-neural-vortex-background";

const STATS = [
  { value: "Free", label: "tools, Noor plans optional" },
  { value: "19", label: "interface languages" },
  { value: "3", label: "AI models, zero setup" },
  { value: "100%", label: "of your data, on your device" },
];

const RIBBON = [
  "Habits & streaks",
  "Mindfulness journal",
  "Tasks",
  "Projects",
  "Notes",
  "Deck presentations",
  "Calendar",
  "Noor AI — Novella 5.0",
  "Deep research",
  "Free to start",
];

const WinIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
    <path d="M0,0H11.377V11.372H0ZM12.623,0H24V11.372H12.623ZM0,12.623H11.377V24H0Zm12.623,0H24V24H12.623" />
  </svg>
);
const LinuxIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

function a11yPref(key: string): boolean {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem("orleia-" + key) === "true") return true;
  try {
    const th = JSON.parse(localStorage.getItem("orleia-data") || "{}").theme || {};
    if (key === "reduced-motion") return !!th.reducedMotion;
    if (key === "high-contrast") return !!th.highContrast;
  } catch {}
  return false;
}

/* Scroll-reveal wrapper */
function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ============================================================
   Bento micro-visuals — miniature app surfaces, pure DOM.
   ============================================================ */

function WindowChrome() {
  return (
    <div className="flex items-center gap-1.5 mb-4" aria-hidden>
      <span className="h-2 w-2 rounded-full bg-foreground/15" />
      <span className="h-2 w-2 rounded-full bg-foreground/15" />
      <span className="h-2 w-2 rounded-full bg-foreground/15" />
    </div>
  );
}

/* Big card: a miniature dashboard — greeting, habit streaks, tasks, Noor pill */
function DashboardMock() {
  const habits = [
    { name: "Morning run", streak: 12, pct: 86 },
    { name: "Read 20 pages", streak: 7, pct: 64 },
    { name: "No sugar", streak: 21, pct: 97 },
  ];
  return (
    <div className="flex h-full flex-col rounded-xl border border-border/50 bg-secondary/40 p-4 text-left">
      <WindowChrome />
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">Good evening</p>
        <p className="text-[10px] text-muted-foreground/50 shrink-0 whitespace-nowrap">Friday, Sep 14</p>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground/50">3 tasks left · all habits on track</p>

      <div className="mt-4 space-y-2.5">
        {habits.map((h) => (
          <div key={h.name} className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between text-[11px]">
                <span>{h.name}</span>
                <span className="text-muted-foreground/50">{h.streak}d streak</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-border/60 overflow-hidden">
                <div className="h-full rounded-full bg-foreground/50" style={{ width: h.pct + "%" }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2 border-t border-border/40 pt-3">
        <div className="flex items-center gap-2.5 text-[11px]">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[4px] bg-foreground text-background"><Check className="h-2.5 w-2.5" strokeWidth={3} /></span>
          <span className="line-through text-muted-foreground/40">Ship the redesign</span>
        </div>
        <div className="flex items-center gap-2.5 text-[11px]">
          <span className="h-3.5 w-3.5 rounded-[4px] border border-border" />
          <span>Call the bank</span>
        </div>
        <div className="flex items-center gap-2.5 text-[11px]">
          <span className="h-3.5 w-3.5 rounded-[4px] border border-border" />
          <span>Review Noor's research</span>
        </div>
      </div>

      <div className="mt-auto pt-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/60 px-3 py-1.5 text-[10px] text-muted-foreground">
          <Sparkles className="h-3 w-3" aria-hidden />
          Noor · 2 reminders scheduled for tonight
        </div>
      </div>
    </div>
  );
}

/* Breathing exercise — pulsing ring */
function BreathingMock() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-6">
      <div className="relative flex h-20 w-20 items-center justify-center" aria-hidden>
        <span className="absolute inset-0 rounded-full border border-foreground/25 animate-[breathe_5s_ease-in-out_infinite] motion-reduce:animate-none" />
        <span className="absolute inset-2.5 rounded-full border border-foreground/40 animate-[breathe_5s_ease-in-out_infinite_0.6s] motion-reduce:animate-none" />
        <span className="h-8 w-8 rounded-full bg-foreground/10 animate-[breathe_5s_ease-in-out_infinite_1.2s] motion-reduce:animate-none" />
      </div>
      <p className="text-[10px] font-mono tracking-widest text-muted-foreground/40">4 · 7 · 8 BREATHING</p>
    </div>
  );
}

/* Mini calendar */
function CalendarMock() {
  const active = new Set([3, 9, 10, 14, 15, 16, 21, 27]);
  return (
    <div className="flex h-full flex-col items-center justify-center py-5" aria-hidden>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 28 }, (_, i) => (
          <span
            key={i}
            className={
              "h-1.5 w-1.5 rounded-full " +
              (i === 13 ? "bg-foreground h-2.5 w-2.5 -mt-0.5" : active.has(i + 1) ? "bg-foreground/45" : "bg-foreground/10")
            }
          />
        ))}
      </div>
      <p className="mt-4 text-[10px] font-mono tracking-widest text-muted-foreground/40">SEPTEMBER</p>
    </div>
  );
}

/* Stacked deck slides */
function DeckMock() {
  return (
    <div className="relative flex h-full items-center justify-center py-8" aria-hidden>
      <div className="absolute h-16 w-24 rotate-[8deg] translate-x-3 rounded-lg border border-border/50 bg-secondary/30" />
      <div className="absolute h-16 w-24 rotate-[4deg] translate-x-1.5 rounded-lg border border-border/50 bg-secondary/50" />
      <div className="relative h-16 w-24 -rotate-3 rounded-lg border border-border/60 bg-card p-2.5 text-left">
        <div className="h-1.5 w-10 rounded-full bg-foreground/40" />
        <div className="mt-1.5 h-1 w-16 rounded-full bg-foreground/15" />
        <div className="mt-1 h-1 w-14 rounded-full bg-foreground/15" />
        <div className="mt-2.5 flex gap-1">
          <span className="h-4 w-6 rounded-sm bg-foreground/10" />
          <span className="h-4 w-6 rounded-sm bg-foreground/20" />
          <span className="h-4 w-6 rounded-sm bg-foreground/10" />
        </div>
      </div>
    </div>
  );
}

/* Privacy — device is the server */
function PrivacyMock() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-6 text-center" aria-hidden>
      <div className="relative">
        <Shield className="h-8 w-8 text-foreground/60" strokeWidth={1.25} />
        <span className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-foreground/70" />
      </div>
      <p className="font-mono text-xl font-semibold tracking-tight">0 servers</p>
      <p className="text-[10px] font-mono tracking-widest text-muted-foreground/40">YOUR DEVICE IS THE SERVER</p>
    </div>
  );
}

/* Noor spotlight — mock conversation */
function NoorSpotlight() {
  return (
    <div className="relative mx-auto max-w-2xl rounded-2xl border border-border/50 bg-card/50 p-5 md:p-7 shadow-2xl">
      <div className="space-y-4 text-left">
        <div className="flex justify-end">
          <p className="max-w-[75%] rounded-2xl rounded-br-sm bg-secondary px-4 py-2.5 text-sm">
            What&apos;s left on my website project?
          </p>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60">
            <Sparkles className="h-3 w-3" aria-hidden />
          </span>
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-border/40 bg-background/60 px-4 py-2.5 text-sm">
            <p>
              Two tasks left: <span className="text-muted-foreground">fix the nav bug</span> and{" "}
              <span className="text-muted-foreground">ship v2.3</span>. The nav bug blocks the release — want me to move it to tomorrow morning?
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] font-mono text-muted-foreground/60">from Projects</span>
              <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] font-mono text-muted-foreground/60">from Tasks</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 pl-9" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1 w-1 rounded-full bg-foreground/40 animate-[blink_1.4s_infinite]" style={{ animationDelay: i * 0.2 + "s" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => a11yPref("reduced-motion"));
  const [highContrast, setHighContrast] = useState<boolean>(() => a11yPref("high-contrast"));
  const [showStickyCta, setShowStickyCta] = useState(false);

  /* Landing is permanently dark; restore the app's saved theme on unmount
     (the dashboard flash-mounts this component before its domain check). */
  useEffect(() => {
    const root = document.documentElement;
    const isLandingHost =
      typeof window !== "undefined" &&
      (window.location.hostname === "orleia.app" ||
        window.location.hostname === "www.orleia.app" ||
        window.location.hostname.includes("orleia-suite") ||
        window.location.hostname.includes("orleia-landing"));
    if (isLandingHost) root.classList.add("dark");
    return () => {
      try {
        const th = JSON.parse(localStorage.getItem("orleia-data") || "{}").theme || {};
        const isDark =
          th.theme === "dark" ||
          !th.theme ||
          (th.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
        root.classList.toggle("dark", isDark);
      } catch {
        root.classList.add("dark");
      }
    };
  }, []);

  /* Keep the app's own theme store in sync with accessibility choices. */
  useEffect(() => {
    localStorage.setItem("orleia-reduced-motion", String(reducedMotion));
    document.documentElement.setAttribute("data-reduced-motion", String(reducedMotion));
    try {
      const raw = localStorage.getItem("orleia-data");
      if (raw) {
        const d = JSON.parse(raw);
        d.theme = { ...(d.theme || {}), reducedMotion, highContrast };
        localStorage.setItem("orleia-data", JSON.stringify(d));
      }
    } catch {}
  }, [reducedMotion, highContrast]);

  useEffect(() => {
    localStorage.setItem("orleia-high-contrast", String(highContrast));
    document.documentElement.classList.toggle("high-contrast", highContrast);
  }, [highContrast]);

  const systemReduce = useReducedMotion();
  const quiet = systemReduce || reducedMotion;

  const scrollTo = (id: string) => {
    setMobileNavOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: quiet ? "auto" : "smooth" });
  };

  /* Sticky mobile CTA — appears after the hero, hides near the footer. */
  useEffect(() => {
    const onScroll = () => {
      const pastHero = window.scrollY > window.innerHeight * 0.9;
      const nearFooter =
        window.innerHeight + window.scrollY >
        document.documentElement.scrollHeight - window.innerHeight * 0.6;
      setShowStickyCta(pastHero && !nearFooter);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const ease = [0.16, 1, 0.3, 1] as const;
  const enter = quiet ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 } };

  return (      <div className="min-h-screen bg-black overflow-x-clip">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[999] focus:bg-foreground focus:text-background focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-medium focus:outline-none focus:ring-2 focus:ring-ring">
        Skip to main content
      </a>

      {/* ===== NAV ===== */}
      <nav aria-label="Main navigation" className="fixed top-0 inset-x-0 z-50 bg-black/60 backdrop-blur-xl border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/orleia-wordmark.png" alt="Orleia" className="h-5 w-auto dark:invert" />
          </Link>
          <div className="hidden md:flex items-center gap-7">
            <button onClick={() => scrollTo("product")} className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors">Product</button>
            <button onClick={() => scrollTo("noor")} className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors">Noor</button>
            <button onClick={() => scrollTo("accessibility")} className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors">Accessibility</button>
            <button onClick={() => scrollTo("download")} className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors">Download</button>
            <button onClick={() => setHighContrast(!highContrast)} aria-pressed={highContrast} aria-label="Toggle high contrast" className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors">Contrast</button>
            <button onClick={() => setReducedMotion(!reducedMotion)} aria-pressed={reducedMotion} aria-label="Toggle reduced motion" className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors">Motion</button>
            <a href="https://app.orleia.app" className="inline-flex items-center gap-1.5 bg-foreground text-background px-4 py-2 text-xs font-medium rounded-full transition-all hover:opacity-90 active:scale-[0.97]">
              Open App <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
          <button onClick={() => setMobileNavOpen(!mobileNavOpen)} aria-label={mobileNavOpen ? "Close menu" : "Open menu"} className="md:hidden flex h-9 w-9 items-center justify-center rounded-full border border-border/50">
            {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      {mobileNavOpen && (
        <div className="fixed top-14 inset-x-0 z-40 md:hidden px-4">
          <div className="rounded-2xl border border-border bg-card p-3 shadow-2xl">
            {[
              { label: "Product", id: "product" },
              { label: "Noor", id: "noor" },
              { label: "Accessibility", id: "accessibility" },
              { label: "Download", id: "download" },
            ].map((item) => (
              <button key={item.id} onClick={() => scrollTo(item.id)} className="block w-full rounded-lg px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors text-left">
                {item.label}
              </button>
            ))}
            <button onClick={() => setHighContrast(!highContrast)} aria-pressed={highContrast} className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors text-left">
              High contrast
              <span className={"relative h-5 w-9 rounded-full transition-colors " + (highContrast ? "bg-foreground" : "bg-muted")}><span className={"absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-background transition-transform " + (highContrast ? "translate-x-4" : "")} /></span>
            </button>
            <button onClick={() => setReducedMotion(!reducedMotion)} aria-pressed={reducedMotion} className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors text-left">
              Reduced motion
              <span className={"relative h-5 w-9 rounded-full transition-colors " + (reducedMotion ? "bg-foreground" : "bg-muted")}><span className={"absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-background transition-transform " + (reducedMotion ? "translate-x-4" : "")} /></span>
            </button>
            <a href="https://app.orleia.app" className="block w-full rounded-full bg-foreground px-4 py-3 text-sm font-medium text-background text-center mt-2">Open App</a>
          </div>
        </div>
      )}

      <main id="main-content">
        {/* ===== HERO ===== */}
        <section className="relative min-h-[92vh] supports-[height:100svh]:min-h-[92svh] flex flex-col items-center justify-center px-6 pt-20 pb-28 overflow-hidden bg-black">
          <InteractiveNeuralVortex />
          <motion.h1
            {...enter}
            transition={{ duration: 1, delay: 0.1, ease }}
            className="relative z-10 text-center font-bold leading-[0.9] tracking-[-0.06em] select-none"
          >
            <span className="block text-[clamp(4rem,17vw,15rem)] text-white">ORLEIA</span>
          </motion.h1>
          <motion.p {...enter} transition={{ duration: 0.7, delay: 0.35, ease }} className="relative z-10 mt-5 md:mt-7 text-base md:text-lg text-white/55 max-w-md mx-auto leading-relaxed text-center">
            Habits, tasks, notes, and Noor — one workspace that lives on your device, not on our servers.
          </motion.p>
          <motion.div {...enter} transition={{ duration: 0.7, delay: 0.5, ease }} className="relative z-10 mt-7 md:mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="https://app.orleia.app" className="inline-flex items-center gap-2 bg-white text-black px-7 py-3 text-sm font-medium rounded-full transition-all hover:opacity-90 active:scale-[0.97]">
              Open Orleia <ArrowRight className="h-4 w-4" />
            </a>
            <button onClick={() => scrollTo("download")} className="inline-flex items-center gap-2 px-7 py-3 text-sm font-medium rounded-full border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors">
              Download
            </button>
          </motion.div>
          <motion.p {...enter} transition={{ duration: 0.7, delay: 0.65, ease }} className="relative z-10 mt-6 md:mt-8 text-[10px] font-mono tracking-[0.25em] text-white/30 uppercase">
            Free to start · No account · No tracking
          </motion.p>
          <motion.button
            onClick={() => scrollTo("product")}
            aria-label="Scroll to product"
            {...enter}
            transition={{ duration: 0.7, delay: 0.8, ease }}
            className="relative z-10 mt-8 md:mt-10 text-white/25 hover:text-white/60 transition-colors motion-safe:animate-bounce"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
          </motion.button>
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-b from-transparent to-black z-10 pointer-events-none" />
        </section>

        {/* ===== PRODUCT BENTO ===== */}
        <section id="product" className="relative py-24 md:py-32 px-6">
          <div className="relative mx-auto max-w-6xl">
            <Reveal>
              <p className="text-center text-[10px] font-mono tracking-[0.3em] text-muted-foreground/40 uppercase">The whole day, one screen</p>
              <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight text-center">Everything, connected.</h2>
            </Reveal>
            <div className="mt-10 md:mt-14 grid gap-4 md:grid-cols-3">
              <Reveal className="md:col-span-2 md:row-span-2" delay={0}>
                <div className="h-full rounded-2xl border border-border/50 bg-card/40 p-5 md:p-6 transition-colors hover:border-border">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Your dashboard</h3>
                    <span className="text-[10px] font-mono text-muted-foreground/30">LIVE</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">Streaks, tasks, and Noor — picked up where you left off.</p>
                  <div className="mt-5"><DashboardMock /></div>
                </div>
              </Reveal>
              <Reveal delay={0.08}>
                <div className="h-full rounded-2xl border border-border/50 bg-card/40 p-6 transition-colors hover:border-border">
                  <h3 className="text-lg font-semibold text-center">Mindfulness</h3>
                  <BreathingMock />
                </div>
              </Reveal>
              <Reveal delay={0.16}>
                <div className="h-full rounded-2xl border border-border/50 bg-card/40 p-6 transition-colors hover:border-border">
                  <h3 className="text-lg font-semibold text-center">Calendar</h3>
                  <CalendarMock />
                </div>
              </Reveal>
              <Reveal delay={0}>
                <div className="h-full rounded-2xl border border-border/50 bg-card/40 p-6 transition-colors hover:border-border">
                  <PrivacyMock />
                </div>
              </Reveal>
              <Reveal delay={0.08}>
                <div className="h-full rounded-2xl border border-border/50 bg-card/40 p-6 transition-colors hover:border-border">
                  <h3 className="text-lg font-semibold text-center">Deck</h3>
                  <DeckMock />
                </div>
              </Reveal>
              <Reveal delay={0.16}>
                <div className="h-full rounded-2xl border border-border/50 bg-card/40 p-6 transition-colors hover:border-border">
                  <h3 className="text-lg font-semibold text-center">Projects</h3>
                  <div className="flex h-full flex-col items-center justify-center gap-2 py-6" aria-hidden>
                    {["Website", "Apartment", "Podcast"].map((p, i) => (
                      <div key={p} className="flex w-full max-w-[200px] items-center gap-2.5 rounded-lg border border-border/40 bg-secondary/40 px-3 py-2" style={{ opacity: 1 - i * 0.18 }}>
                        <span className="h-1.5 w-1.5 rounded-full bg-foreground/50" />
                        <span className="text-xs">{p}</span>
                        <span className="ml-auto text-[10px] font-mono text-muted-foreground/40">{[7, 3, 12][i]} items</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>

            {/* ===== STATS ===== */}
            <Reveal delay={0.1}>
              <div className="mt-10 md:mt-16 grid grid-cols-2 md:grid-cols-4 rounded-2xl border border-border/40 divide-y md:divide-y-0 md:divide-x divide-border/40 overflow-hidden">
                {STATS.map((s) => (
                  <div key={s.label} className="px-6 py-7 text-center">
                    <p className="text-3xl md:text-4xl font-bold tracking-tight">{s.value}</p>
                    <p className="mt-1.5 text-[11px] text-muted-foreground/50 leading-snug">{s.label}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ===== NOOR SPOTLIGHT ===== */}
        <section id="noor" className="relative py-24 md:py-32 px-6 overflow-hidden border-t border-white/10">
          <div className="relative mx-auto max-w-6xl">
            <Reveal>
              <p className="text-center text-[10px] font-mono tracking-[0.3em] text-muted-foreground/40 uppercase">Meet Noor</p>
              <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight text-center max-w-2xl mx-auto">
                An AI that actually knows your workspace.
              </h2>
              <p className="mt-4 text-muted-foreground text-center max-w-lg mx-auto">
                Noor reads your habits, tasks, and projects — and acts inside the app, not just chats about it.
              </p>
            </Reveal>
            <Reveal delay={0.12} className="mt-10 md:mt-12">
              <NoorSpotlight />
            </Reveal>
            <Reveal delay={0.2}>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
                {["Novella 5.0 — one model, six effort levels", "Deep research with citations", "Creates tasks, habits & events"].map((f) => (
                  <span key={f} className="inline-flex items-center gap-2 text-xs text-muted-foreground/60">
                    <span className="h-1 w-1 rounded-full bg-foreground/40" aria-hidden />
                    {f}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ===== WHY ORLEIA ===== */}
        <section id="why" className="relative py-24 md:py-32 px-6 border-t border-white/10">
          <div className="relative mx-auto max-w-6xl">
            <Reveal>
              <p className="text-center text-[10px] font-mono tracking-[0.3em] text-muted-foreground/40 uppercase">Why us</p>
              <h2 className="mt-3 text-center text-3xl md:text-4xl font-bold tracking-tight">Not another cloud app.</h2>
              <p className="mx-auto mt-4 max-w-xl text-center text-muted-foreground leading-relaxed">
                Every other AI workspace needs your data more than you do. Orleia inverts that:
                the workspace lives on your device, and the AI comes to it.
              </p>
            </Reveal>
            <div className="mt-14 grid gap-4 md:grid-cols-3">
              {[
                {
                  title: "Your data stays yours",
                  body: "Notes, tasks, journal, habits — stored locally, no account required, no analytics on your content. Delete the app and it's gone. That's not a policy, it's the architecture.",
                },
                {
                  title: "AI without the privacy tax",
                  body: "Noor reads your live workspace and acts on it — planning weeks, creating tasks, answering about your projects — through a guarded pipeline with model allowlists and daily caps.",
                },
                {
                  title: "Built by someone who uses it",
                  body: "Orleia is an independent project, shipped fast and opinionated. Free forever for every tool; the only thing that scales is Noor itself.",
                },
              ].map((c, i) => (
                <Reveal key={c.title} delay={0.08 * i}>
                  <div className="h-full rounded-2xl border border-border/60 bg-white/[0.02] p-6">
                    <h3 className="font-semibold">{c.title}</h3>
                    <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed">{c.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={0.2}>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-2xl border border-border/40 px-6 py-5 text-center">
                <div>
                  <p className="text-2xl font-bold tracking-tight">260+</p>
                  <p className="text-[11px] text-muted-foreground/50">people use Orleia worldwide</p>
                </div>
                <div className="hidden sm:block h-8 w-px bg-border/60" aria-hidden />
                <div>
                  <p className="text-2xl font-bold tracking-tight">19</p>
                  <p className="text-[11px] text-muted-foreground/50">interface languages</p>
                </div>
                <div className="hidden sm:block h-8 w-px bg-border/60" aria-hidden />
                <div>
                  <p className="text-2xl font-bold tracking-tight">100%</p>
                  <p className="text-[11px] text-muted-foreground/50">of your data, on your device</p>
                </div>
                <div className="hidden sm:block h-8 w-px bg-border/60" aria-hidden />
                <div>
                  <p className="text-2xl font-bold tracking-tight">0</p>
                  <p className="text-[11px] text-muted-foreground/50">trackers, ads, or accounts required</p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ===== PRICING ===== */}
        <section id="pricing" className="relative py-24 md:py-32 px-6 border-t border-white/10">
          <div className="relative mx-auto max-w-6xl">
            <Reveal>
              <p className="text-center text-[10px] font-mono tracking-[0.3em] text-muted-foreground/40 uppercase">Pricing</p>
              <h2 className="mt-3 text-center text-3xl md:text-4xl font-bold tracking-tight">Free forever. Noor, if you want more.</h2>
              <p className="mx-auto mt-4 max-w-xl text-center text-muted-foreground leading-relaxed">
                Every tool in Orleia is free, with no account. Plans only raise the ceiling on Noor, your AI companion.
              </p>
            </Reveal>
            <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Reveal>
                <div className="h-full rounded-2xl border border-border/60 bg-white/[0.02] p-6 flex flex-col">
                  <p className="text-sm font-semibold">Free</p>
                  <p className="mt-3 text-3xl font-bold tracking-tight">$0</p>
                  <p className="mt-1 text-xs text-muted-foreground/50">forever</p>
                  <ul className="mt-5 space-y-2.5 text-sm text-muted-foreground flex-1">
                    {["All tools, unlimited", "30 Noor messages a day", "Local-first, no account", "19 languages"].map((p) => (
                      <li key={p} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />{p}
                      </li>
                    ))}
                  </ul>
                  <a href="https://app.orleia.app" className="mt-6 inline-flex items-center justify-center gap-2 rounded-full border border-border/60 px-5 py-2.5 text-sm font-medium hover:border-foreground/40 transition-colors">Start free</a>
                </div>
              </Reveal>
              {PAID_PLANS.map((plan, i) => (
                <Reveal key={plan.tier} delay={0.08 * (i + 1)}>
                  <div className={`h-full rounded-2xl border p-6 flex flex-col ${plan.popular ? "border-foreground/40 bg-white/[0.04]" : "border-border/60 bg-white/[0.02]"}`}>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{plan.name}</p>
                      {plan.popular && <span className="rounded-full bg-foreground text-background px-2 py-0.5 text-[10px] font-medium">Most popular</span>}
                    </div>
                    <p className="mt-3 text-3xl font-bold tracking-tight">${plan.monthly}</p>
                    <p className="mt-1 text-xs text-muted-foreground/50">per month · ${plan.yearly} billed yearly</p>
                    <p className="mt-3 text-xs text-muted-foreground/70 leading-relaxed">{plan.blurb}</p>
                    <ul className="mt-5 space-y-2.5 text-sm text-muted-foreground flex-1">
                      {plan.perks.map((p) => (
                        <li key={p} className="flex items-start gap-2">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />{p}
                        </li>
                      ))}
                    </ul>
                    <a href="https://app.orleia.app" className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-90 transition-opacity">Get {plan.name}</a>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={0.2}>
              <p className="mt-8 text-center text-xs text-muted-foreground/50">
                Cancel anytime, in one click, inside the app. Your data stays on your device on every plan.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ===== ACCESSIBILITY ===== */}
        <section id="accessibility" aria-labelledby="a11y-heading" className="relative py-24 md:py-32 px-6 border-t border-white/10">
          <div className="relative mx-auto max-w-6xl">
            <Reveal>
              <p className="text-center text-[10px] font-mono tracking-[0.3em] text-muted-foreground/40 uppercase">Accessibility</p>
              <h2 id="a11y-heading" className="mt-3 text-3xl md:text-4xl font-bold tracking-tight text-center">
                Built for everyone, by default.
              </h2>
              <p className="mt-4 text-muted-foreground text-center max-w-lg mx-auto">
                Not a settings page afterthought — accessibility is part of the product.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="mt-10 md:mt-12 grid grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl mx-auto">
                {["High contrast mode", "Reduced motion", "Dyslexia-friendly font", "19 interface languages", "Screen-reader friendly", "Full keyboard control"].map((f) => (
                  <div key={f} className="flex items-center gap-2.5 rounded-xl border border-white/10 px-4 py-3.5">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-white/25">
                      <Check className="h-2.5 w-2.5 text-white/70" strokeWidth={3} aria-hidden />
                    </span>
                    <span className="text-sm text-muted-foreground">{f}</span>
                  </div>
                ))}
              </div>
            </Reveal>
            <Reveal delay={0.18}>
              <div className="mt-10 md:mt-12 max-w-3xl mx-auto">
                <p className="text-center text-[10px] font-mono tracking-[0.25em] text-muted-foreground/40 uppercase mb-5">Keyboard-first</p>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  {[
                    { k: "Ctrl K", d: "Search" },
                    { k: "Ctrl ⇧ N", d: "New note" },
                    { k: "Ctrl ⇧ T", d: "New task" },
                    { k: "Ctrl ⇧ H", d: "New habit" },
                    { k: "Ctrl B", d: "Sidebar" },
                    { k: "Ctrl ,", d: "Settings" },
                    { k: "Ctrl ⇧ A", d: "Noor" },
                  ].map((s) => (
                    <span key={s.k} className="inline-flex items-center gap-2 rounded-full border border-white/10 py-1.5 pl-3 pr-4">
                      <kbd className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-white/80">{s.k}</kbd>
                      <span className="text-xs text-muted-foreground/70">{s.d}</span>
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ===== FEATURE RIBBON (infinite marquee) ===== */}
        <section id="features" className="relative py-16 md:py-20 border-t border-white/10 overflow-hidden">
          <Reveal>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-center px-6">Everything you need.</h2>
            <p className="mt-3 text-muted-foreground text-center">Nothing you don&apos;t.</p>
          </Reveal>
          <div className="mt-12 relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 w-14 md:w-28 bg-[linear-gradient(90deg,black,transparent)] z-10" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-14 md:w-28 bg-[linear-gradient(270deg,black,transparent)] z-10" />
            <div
              className="flex whitespace-nowrap will-change-transform animate-[marquee_36s_linear_infinite] motion-reduce:animate-none hover:[animation-play-state:paused]"
              style={{ width: "max-content" }}
            >
              {[0, 1].map((copy) => (
                <div key={copy} className="flex shrink-0" aria-hidden={copy === 1}>
                  {RIBBON.map((item) => (
                    <span key={item + copy} className="mx-7 inline-flex items-center gap-3 text-base md:text-lg text-muted-foreground/70">
                      <span className="h-1.5 w-1.5 rounded-full bg-foreground/40" />
                      {item}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <style jsx global>{`
            @keyframes marquee {
              from { transform: translateX(0); }
              to { transform: translateX(-50%); }
            }
            @keyframes breathe {
              0%, 100% { transform: scale(1); opacity: 0.45; }
              50% { transform: scale(1.18); opacity: 1; }
            }
            @keyframes blink {
              0%, 80%, 100% { opacity: 0.2; }
              40% { opacity: 1; }
            }
          `}</style>
        </section>

        {/* ===== DOWNLOAD ===== */}
        <section id="download" className="relative py-24 md:py-32 px-6">
          <div className="relative mx-auto max-w-6xl text-center">
            <Reveal>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Use it everywhere.</h2>
              <p className="mt-3 text-muted-foreground">Web, desktop, phone. Same workspace, same data.</p>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <a href="https://app.orleia.app" className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium rounded-full border border-border/60 hover:border-foreground/40 transition-colors">
                  Web app <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
                <a href="https://github.com/lexisworkspace/lexis/releases/download/v2.5.0/Orleia-2.5.0-win-x64.exe" download className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium rounded-full border border-border/60 hover:border-foreground/40 transition-colors">
                  <WinIcon /> Windows
                </a>
                <a href="https://github.com/lexisworkspace/lexis/releases/download/v2.5.0/Orleia-2.5.0-linux-x64.tar.gz" download className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium rounded-full border border-border/60 hover:border-foreground/40 transition-colors">
                  <LinuxIcon /> Linux
                </a>
              </div>
              <p className="mt-6 text-xs text-muted-foreground/40">On mobile, add Orleia to your home screen from the browser.</p>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ===== FOOTER ===== */}
      <footer role="contentinfo" className="border-t border-white/10 px-6 py-10">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <img src="/orleia-wordmark.png" alt="Orleia" className="h-4 w-auto self-start dark:invert opacity-60" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {["privacy", "terms", "cookies", "refund", "gdpr", "ccpa", "eula", "disclaimer", "accessibility"].map((p) => (
              <Link key={p} href={`/${p}`} className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors capitalize">{p}</Link>
            ))}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("orleia:open-cookie-settings"))}
              className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              Cookie settings
            </button>
            <Link href="/pricing" className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors">Pricing</Link>
            <Link href="/changelog" className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors">Changelog</Link>
            <a href={GMAIL_COMPOSE_HREF} className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors">Contact</a>
          </div>
        </div>
        <div className="mx-auto max-w-6xl mt-6">
          <p className="text-[10px] text-muted-foreground/25">© {new Date().getFullYear()} Orleia — free, local-first, no tracking.</p>
        </div>
      </footer>

      {/* ===== STICKY MOBILE CTA ===== */}
      <motion.div
        initial={false}
        animate={{ y: showStickyCta ? 0 : 96 }}
        transition={{ duration: quiet ? 0 : 0.25, ease: "easeOut" }}
        className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-white/10 bg-black/80 backdrop-blur-md px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <a
          href="https://app.orleia.app"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-medium text-black active:scale-[0.98] transition-transform"
        >
          Open Orleia <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
      </motion.div>
    </div>
  );
}
