"use client";

// ============================================================
// Wellness - breathing exercises & meditation
// Same design language as the rest of Orleia. Pure CSS animation
// (no framer) so it stays smooth on phones and tablets.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Wind,
  Flower2,
  Waves,
  Zap,
  Moon,
  X,
  Volume2,
  VolumeX,
  Play,
  Check,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type SessionMode = "breath" | "meditate";

interface BreathPhase {
  labelKey: string;
  seconds: number;
  target: number; // orb scale target: 1 = inflated, 0.62 = deflated
}

interface BreathExercise {
  id: string;
  nameKey: string;
  descKey: string;
  icon: typeof Wind;
  accent: string; // tailwind text/bg color for the icon chip
  phases: BreathPhase[];
}

const EXERCISES: BreathExercise[] = [
  {
    id: "box",
    nameKey: "journal.exBox",
    descKey: "journal.exBoxDesc",
    icon: Wind,
    accent: "text-primary bg-primary/10",
    phases: [
      { labelKey: "journal.inhale", seconds: 4, target: 1 },
      { labelKey: "journal.hold", seconds: 4, target: 1 },
      { labelKey: "journal.exhale", seconds: 4, target: 0.62 },
      { labelKey: "journal.hold", seconds: 4, target: 0.62 },
    ],
  },
  {
    id: "478",
    nameKey: "journal.ex478",
    descKey: "journal.ex478Desc",
    icon: Flower2,
    accent: "text-primary bg-primary/10",
    phases: [
      { labelKey: "journal.inhale", seconds: 4, target: 1 },
      { labelKey: "journal.hold", seconds: 7, target: 1 },
      { labelKey: "journal.exhale", seconds: 8, target: 0.62 },
    ],
  },
  {
    id: "calm",
    nameKey: "journal.exCalm",
    descKey: "journal.exCalmDesc",
    icon: Waves,
    accent: "text-primary bg-primary/10",
    phases: [
      { labelKey: "journal.inhale", seconds: 5, target: 1 },
      { labelKey: "journal.exhale", seconds: 5, target: 0.62 },
    ],
  },
  {
    id: "energy",
    nameKey: "journal.exEnergy",
    descKey: "journal.exEnergyDesc",
    icon: Zap,
    accent: "text-primary bg-primary/10",
    phases: [
      { labelKey: "journal.inhale", seconds: 4, target: 1 },
      { labelKey: "journal.exhale", seconds: 2, target: 0.62 },
    ],
  },
];

const BREATH_MINUTES = [1, 2, 5];
const MEDITATE_MINUTES = [3, 5, 10, 15];

// ------------------------------------------------------------
// Soft WebAudio chimes - no assets, tiny volume.
// ------------------------------------------------------------
let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function chime(freqs: number[], dur = 0.5, vol = 0.028) {
  try {
    const c = getCtx();
    if (!c) return;
    const now = c.currentTime;
    freqs.forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t0 = now + i * 0.14;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(c.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.1);
    });
  } catch {
    // audio unavailable - stay silent
  }
}

const softPhase = () => chime([440], 0.4, 0.022);
const softHold = () => chime([392], 0.35, 0.018);
const completionChime = () => chime([523.25, 659.25, 783.99], 1.3, 0.035);
const startChime = () => chime([392, 523.25], 0.8, 0.03);
const halfChime = () => chime([523.25], 0.6, 0.025);

// ------------------------------------------------------------
// Rain ambience - a subtle looping rain bed behind every session.
// Self-generated 60s loop (public/audio/rain.wav), loaded lazily
// on the first session. Fades in/out so it stays calm background.
// ------------------------------------------------------------
const RAIN_URL = "/audio/rain.mp3";
const RAIN_VOL = 0.12;

let rainBuffer: AudioBuffer | null = null;
let rainSource: AudioBufferSourceNode | null = null;
let rainGain: GainNode | null = null;
let rainLoading: Promise<void> | null = null;
let rainDesired = false;

async function loadRain(): Promise<void> {
  if (rainBuffer) return;
  if (rainLoading) return rainLoading;
  rainLoading = (async () => {
    try {
      const ctx = getCtx();
      if (!ctx) return;
      const res = await fetch(RAIN_URL);
      const arr = await res.arrayBuffer();
      rainBuffer = await ctx.decodeAudioData(arr);
    } catch {
      rainBuffer = null;
    } finally {
      rainLoading = null;
    }
  })();
  return rainLoading;
}

function setRainVolume(v: number) {
  if (!rainGain) return;
  try {
    const ctx = getCtx();
    rainGain.gain.setTargetAtTime(v, ctx ? ctx.currentTime : 0, 0.4);
  } catch {}
}

function startRain(): void {
  void (async () => {
    try {
      const ctx = getCtx();
      if (!ctx || rainSource) return;
      rainDesired = true;
      await loadRain();
      // session may have closed while the file was loading - don't leak rain
      if (!rainDesired) return;
      if (!ctx || !rainBuffer) return;
      const src = ctx.createBufferSource();
      src.buffer = rainBuffer;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(ctx.destination);
      src.start();
      rainSource = src;
      rainGain = g;
      setRainVolume(RAIN_VOL);
    } catch {}
  })();
}

function stopRain() {
  rainDesired = false;
  if (!rainSource) return;
  const src = rainSource;
  const g = rainGain;
  rainSource = null;
  rainGain = null;
  setRainVolume(0);
  window.setTimeout(() => {
    try {
      src.stop();
    } catch {}
    try {
      src.disconnect();
    } catch {}
    try {
      g?.disconnect();
    } catch {}
  }, 900);
}

function setRainMuted(muted: boolean) {
  setRainVolume(muted ? 0 : RAIN_VOL);
}

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ------------------------------------------------------------
// Main section
// ------------------------------------------------------------
export function Wellness({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const [session, setSession] = useState<null | {
    mode: SessionMode;
    exerciseId?: string;
    minutes: number;
  }>(null);

  return (
    <div>
      {!embedded && (
        <div className="mb-4">
          <h2 className="font-semibold tracking-tight">{t("journal.wellness")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{t("journal.wellnessDesc")}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {EXERCISES.map((ex) => (
          <ExerciseCard key={ex.id} exercise={ex} onStart={(mins) => setSession({ mode: "breath", exerciseId: ex.id, minutes: mins })} />
        ))}
        <MeditationCard onStart={(mins) => setSession({ mode: "meditate", minutes: mins })} />
      </div>

      {session && (
        <SessionOverlay session={session} onClose={() => setSession(null)} />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Cards
// ------------------------------------------------------------
function ExerciseCard({
  exercise,
  onStart,
}: {
  exercise: BreathExercise;
  onStart: (minutes: number) => void;
}) {
  const { t } = useI18n();
  const [minutes, setMinutes] = useState(1);
  const Icon = exercise.icon;
  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", exercise.accent)}>
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">{t(exercise.nameKey)}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t(exercise.descKey)}</p>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {BREATH_MINUTES.map((m) => (
            <button
              key={m}
              onClick={() => setMinutes(m)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                minutes === m
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m}
            </button>
          ))}
          <span className="ml-0.5 text-xs text-muted-foreground">{t("journal.minutes")}</span>
        </div>
        <button
          onClick={() => onStart(minutes)}
          className="flex items-center gap-1.5 rounded-xl border border-foreground/20 bg-background/40 px-3.5 py-1.5 text-sm font-medium text-foreground/60 backdrop-blur-md transition-all hover:border-foreground/40 hover:text-foreground active:scale-95"
        >
          <Play className="h-3.5 w-3.5" />
          {t("journal.start")}
        </button>
      </div>
    </div>
  );
}

function MeditationCard({ onStart }: { onStart: (minutes: number) => void }) {
  const { t } = useI18n();
  const [minutes, setMinutes] = useState(5);
  return (
    <div className="card sm:col-span-2 flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Moon className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">{t("journal.meditation")}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t("journal.meditationDesc")}</p>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {MEDITATE_MINUTES.map((m) => (
            <button
              key={m}
              onClick={() => setMinutes(m)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                minutes === m
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m}
            </button>
          ))}
          <span className="ml-0.5 text-xs text-muted-foreground">{t("journal.minutes")}</span>
        </div>
        <button
          onClick={() => onStart(minutes)}
          className="flex items-center gap-1.5 rounded-xl border border-foreground/20 bg-background/40 px-3.5 py-1.5 text-sm font-medium text-foreground/60 backdrop-blur-md transition-all hover:border-foreground/40 hover:text-foreground active:scale-95"
        >
          <Play className="h-3.5 w-3.5" />
          {t("journal.start")}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// ParticleBreath — canvas particle field for breathing sessions.
// Particles drift outward on inhale and pull inward on exhale,
// orbiting a glowing core. Color follows the user's --primary accent.
// ------------------------------------------------------------
interface Particle {
  ang: number;
  baseR: number; // 0..1 fraction of max radius
  size: number;
  drift: number; // rad/s tangential drift
  wobAmp: number;
  wobSpeed: number;
  wobPhase: number;
  bright: boolean;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function ParticleBreath({
  from,
  to,
  start,
  seconds,
  meditate = false,
}: {
  from: number;
  to: number;
  start: number;
  seconds: number;
  meditate?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drive = useRef({ from, to, start, seconds, meditate });
  drive.current = { from, to, start, seconds, meditate };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = document.documentElement.getAttribute("data-reduced-motion") === "true";

    // deterministic particle field
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const parts: Particle[] = Array.from({ length: 110 }, () => ({
      ang: rand() * Math.PI * 2,
      baseR: 0.3 + rand() * 0.7,
      size: 0.8 + rand() * 1.8,
      drift: (rand() - 0.5) * 0.14,
      wobAmp: 2 + rand() * 5,
      wobSpeed: 0.4 + rand() * 0.9,
      wobPhase: rand() * Math.PI * 2,
      bright: rand() < 0.16,
    }));

    let raf = 0;
    let time = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduced) time += dt;

      const { from: f, to: tt, start: st, seconds: secs, meditate: med } = drive.current;
      /* Breath level is computed from the real clock every frame (not from
         React state), so the motion is butter-smooth instead of stepping at
         the 200ms state-tick rate. */
      const level = med
        ? 0.55 + 0.33 * Math.sin((time / 10) * Math.PI * 2 - Math.PI / 2)
        : f + (tt - f) * easeInOut(Math.min(1, Math.max(0, (now - st) / (secs * 1000))));

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(w, h) / 2 - 10;

      // accent color from the app's --primary token
      const raw = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
      const rgb = raw || "99 102 241";

      // glowing core, scaled by breath level
      const coreR = maxR * (0.3 + 0.42 * level);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      grad.addColorStop(0, `rgb(${rgb} / ${0.5 * level + 0.12})`);
      grad.addColorStop(0.55, `rgb(${rgb} / ${0.22 * level + 0.05})`);
      grad.addColorStop(1, `rgb(${rgb} / 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      // faint structural ring
      ctx.strokeStyle = `rgb(${rgb} / 0.14)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * (0.55 + 0.4 * level), 0, Math.PI * 2);
      ctx.stroke();

      // particles
      for (const pt of parts) {
        if (!reduced) pt.ang += pt.drift * dt;
        const wob = Math.sin(time * pt.wobSpeed * Math.PI + pt.wobPhase) * pt.wobAmp;
        const r = pt.baseR * maxR * (0.42 + 0.58 * level) + wob;
        const x = cx + Math.cos(pt.ang) * r;
        const y = cy + Math.sin(pt.ang) * r;
        const tw = reduced ? 0.8 : 0.65 + 0.35 * Math.sin(time * 1.4 + pt.wobPhase);
        const alpha = (0.2 + 0.6 * level) * tw;
        ctx.beginPath();
        if (pt.bright) {
          ctx.shadowColor = `rgb(${rgb} / 0.8)`;
          ctx.shadowBlur = 8;
        }
        ctx.fillStyle = `rgb(${rgb} / ${alpha.toFixed(3)})`;
        ctx.arc(x, y, pt.size * (0.85 + 0.35 * level), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}

// ------------------------------------------------------------
// Session overlay
// ------------------------------------------------------------
function SessionOverlay({
  session,
  onClose,
}: {
  session: { mode: SessionMode; exerciseId?: string; minutes: number };
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [muted, setMuted] = useState(false);
  const [completed, setCompleted] = useState(false);

  const exercise = useMemo(
    () => EXERCISES.find((e) => e.id === session.exerciseId) ?? EXERCISES[0],
    [session.exerciseId]
  );
  const totalSeconds = session.minutes * 60;

  // ---- breathing timer state ----
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [phaseMs, setPhaseMs] = useState(0);
  const [totalMs, setTotalMs] = useState(0);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  // ring the starting chime once on mount
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const timer = setTimeout(() => {
      if (!mutedRef.current) startChime();
      if (session.mode === "meditate") {
        halfTimer.current = setTimeout(() => {
          if (!mutedRef.current) halfChime();
        }, (totalSeconds * 1000) / 2);
      }
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const halfTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (halfTimer.current) clearTimeout(halfTimer.current);
    };
  }, []);

  // rain ambience for the whole session
  useEffect(() => {
    startRain();
    return () => stopRain();
  }, []);

  // master tick - drives both modes
  useEffect(() => {
    if (completed) return;
    const tick = window.setInterval(() => {
      setTotalMs((v) => {
        const next = v + 200;
        if (session.mode === "breath" && next >= totalSeconds * 1000) {
          setCompleted(true);
          if (!mutedRef.current) completionChime();
        }
        if (session.mode === "meditate" && next >= totalSeconds * 1000) {
          setCompleted(true);
          if (!mutedRef.current) completionChime();
        }
        return next;
      });
      if (session.mode === "breath") {
        setPhaseMs((v) => {
          const next = v + 200;
          const phase = exercise.phases[phaseIdx % exercise.phases.length];
          if (next >= phase.seconds * 1000) {
            const newIdx = (phaseIdx + 1) % exercise.phases.length;
            setPhaseIdx(newIdx);
            const nextPhase = exercise.phases[newIdx];
            if (!mutedRef.current) (nextPhase.target >= 1 ? softPhase : softHold)();
            return 0;
          }
          return next;
        });
      }
    }, 200);
    return () => window.clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed, phaseIdx]);

  const phase = exercise.phases[phaseIdx % exercise.phases.length];
  const prevTarget = exercise.phases[(phaseIdx - 1 + exercise.phases.length) % exercise.phases.length].target;
  const scale = phase.target;
  /* Real-clock timestamp of when the current phase began — the particle
     field interpolates against this every frame for smooth motion. */
  const phaseStartedAt = useMemo(() => performance.now() - phaseMs, [phaseIdx]); // eslint-disable-line react-hooks/exhaustive-deps
  const phaseLeft = Math.max(1, Math.ceil(phase.seconds - phaseMs / 1000));
  const progress = Math.min(100, (totalMs / (totalSeconds * 1000)) * 100);
  const remaining = Math.max(0, totalSeconds - Math.floor(totalMs / 1000));

  // meditation pulse (pure CSS transition toggled by interval)
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (session.mode !== "meditate" || completed) return;
    const i = window.setInterval(() => setPulse((p) => !p), 4000);
    return () => window.clearInterval(i);
  }, [session.mode, completed]);

  const title =
    session.mode === "breath"
      ? t(exercise.nameKey)
      : `${t("journal.meditation")} · ${session.minutes} ${t("journal.minutes")}`;

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-4 pb-24 md:pb-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Controls bar — BOTTOM on mobile (< md): the floating glass top bar
          (hamburger/search/settings/bell, z-70 at root level) paints OVER
          anything inside the card's z-50 stacking context, so a top bar here
          was unreachable under the default top buttons. md+ has no floating
          bar, so it returns to the top there. */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 sm:px-6 md:top-0 md:bottom-auto md:pb-3">
        <span className="text-sm font-medium text-white/80">{title}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setRainMuted(next);
            }}
            aria-label={muted ? "Unmute" : "Mute"}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 active:scale-95"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {completed ? (
        <div className="flex flex-col items-center text-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-primary/20">
            <Check className="h-10 w-10 text-primary" strokeWidth={2} />
          </div>
          <h3 className="text-2xl font-bold text-white">{t("journal.sessionComplete")}</h3>
          <p className="text-sm text-white/60 mt-1">{session.minutes} {t("journal.minutes")}</p>
          <button onClick={onClose} className="btn-primary mt-8 px-6">
            {t("common.cancel")}
          </button>
        </div>
      ) : session.mode === "breath" ? (
        <>
          {/* particle breath field */}
          <div className="relative flex h-64 w-64 sm:h-80 sm:w-80 items-center justify-center">
            <ParticleBreath from={prevTarget} to={phase.target} start={phaseStartedAt} seconds={phase.seconds} />
            <div
              className="absolute inset-16 flex items-center justify-center rounded-full bg-primary/85 blur-[2px] shadow-[0_0_90px_30px_rgb(var(--primary)/0.35)]"
              style={{ transition: `transform ${phase.seconds}s ease-in-out, box-shadow ${phase.seconds}s ease-in-out`, transform: `scale(${0.62 + 0.38 * scale})` }}
            >
              <span className="font-mono text-3xl font-bold text-primary-foreground tabular-nums">
                {phaseLeft}
              </span>
            </div>
          </div>
          <p className="mt-8 text-lg font-medium text-white/90">{t(phase.labelKey)}</p>
          <p className="mt-1 text-xs text-white/50">{t("journal.breatheGentle")}</p>
          <div className="mt-8 w-full max-w-xs">
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-white/50">
              <span className="font-mono tabular-nums">{formatClock(remaining)}</span>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* meditation — slow particle drift, same field, calmer rhythm */}
          <div className="relative flex h-64 w-64 sm:h-80 sm:w-80 items-center justify-center">
            <ParticleBreath from={0.22} to={0.88} start={0} seconds={10} meditate />
            <div
              className="absolute inset-20 flex items-center justify-center rounded-full bg-primary/85 shadow-[0_0_90px_30px_rgb(var(--primary)/0.3)]"
              style={{ transition: "transform 4s ease-in-out, box-shadow 4s ease-in-out", transform: pulse ? "scale(1.05)" : "scale(0.97)" }}
            >
              <div className="flex h-full items-center justify-center">
                <Moon className="h-10 w-10 text-primary-foreground/90" strokeWidth={1.5} />
              </div>
            </div>
          </div>
          <p className="mt-8 text-lg font-medium text-white/90">{t("journal.breatheGentle")}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-white/50">
            <Clock className="h-3 w-3" />
            <span className="font-mono tabular-nums">{formatClock(remaining)}</span>
          </p>
          <div className="mt-8 w-full max-w-xs">
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
