"use client";

// ============================================================
// EffortSlider — Novella 5.0 effort picker.
//
// Slider ported 1:1 from the 21st.dev "ChatGPT model selector"
// (chatgpt-model-selector): pill knob on a rounded track, tick
// dots, accent-colored fill with a streaming white sparkle canvas
// inside it, spring snap on release (linear() spring easing), and
// an Ultra state that crossfades the fill to a violet gradient and
// pops a ring of bead confetti from the knob.
//
// Colors follow the user's accent: the fill is rgb(var(--primary));
// at Ultra the violet is derived by blending the accent toward the
// original's violet, so it stays "a similar colour to the accent".
//
// Interaction (from the original):
// - knob follows the pointer freely; the nearest stop previews the
//   labels/theme live and commits as you cross it
// - release springs to the nearest stop (380ms spring)
// - keyboard arrows commit instantly (no animation)
// - reduced motion: static sparkle frame, no snap/confetti
// ============================================================

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { EFFORT_META, EFFORT_LEVELS, type EffortLevel } from "@/lib/ai-models";
import { cn } from "@/lib/utils";

const N = EFFORT_LEVELS.length; // 6 effort stops
const KNOB = 34; // knob diameter (px) — from the original
const LAST = N - 1;

type RGB = [number, number, number];

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
/** The original component's ultra violet anchor (#8B73F3). */
const VIOLET: RGB = [139, 115, 243];

const mixRGB = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const rgbStr = (c: RGB, a = 1) =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** The user's accent color, as live RGB channels read from --primary. */
function useAccent(): RGB {
  const [rgb, setRgb] = useState<RGB>([99, 102, 241]);
  useEffect(() => {
    const read = () => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
      const parts = raw.split(/[\s,]+/).map(Number);
      if (parts.length >= 3 && parts.every(n => Number.isFinite(n))) {
        setRgb([parts[0], parts[1], parts[2]]);
      }
    };
    read();
    // Re-read when the theme/accent attribute or dark class changes.
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-accent", "style"] });
    return () => obs.disconnect();
  }, []);
  return rgb;
}

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setIsDark(root.classList.contains("dark"));
    read();
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

export interface EffortSliderProps {
  /** Selected effort level. */
  value: EffortLevel;
  onChange: (level: EffortLevel) => void;
  /** Standalone: render the trigger button + popup panel. */
  standalone?: boolean;
  /** standalone trigger label prefix. */
  label?: string;
  /** Which way the standalone popup opens. */
  placement?: "top" | "bottom";
  className?: string;
}

interface Bead {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  ttl: number;
  color: string;
}

export function EffortSlider({
  value,
  onChange,
  standalone = false,
  label,
  placement = "top",
  className,
}: EffortSliderProps) {
  const index = Math.max(0, EFFORT_LEVELS.indexOf(value));
  const [open, setOpen] = useState(false);
  const accent = useAccent();
  const isDark = useIsDark();

  // ---- slider geometry / gesture state (ported from the original) ----
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const sparkRef = useRef<HTMLCanvasElement | null>(null);
  const confettiRef = useRef<HTMLCanvasElement | null>(null);
  const [trackW, setTrackW] = useState(0);
  const [dragPos, setDragPos] = useState<number | null>(null);
  const dragPosRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const activePointerRef = useRef<number | null>(null);
  const geomRef = useRef<{ left: number; width: number } | null>(null);
  const [snapping, setSnapping] = useState(false);
  const snapTimer = useRef<number>(0);
  const burstTimer = useRef<number>(0);

  // ---- confetti burst state ----
  const beadsRef = useRef<Bead[]>([]);
  const confRaf = useRef<number>(0);
  const confLast = useRef<number>(0);
  const confBox = useRef<{ w: number; h: number; dpr: number } | null>(null);
  const lastBurstRef = useRef<number>(0);
  const burstFiredRef = useRef(false); // once per gesture
  const selfCommitRef = useRef(false); // our own release/keyboard commit
  const mountedRef = useRef(false);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // ---- Ultra colors: accent blended toward the original's violet ----
  const ultraBase = mixRGB(accent, VIOLET, 0.5);
  const ultraGrad = `linear-gradient(90deg, ${rgbStr(mixRGB(ultraBase, BLACK, 0.34))} 0%, ${rgbStr(
    mixRGB(ultraBase, WHITE, 0.22)
  )} 65%, ${rgbStr(mixRGB(ultraBase, WHITE, 0.08))} 100%)`;
  const ultraText = isDark ? mixRGB(ultraBase, WHITE, 0.45) : mixRGB(ultraBase, BLACK, 0.3);
  const ultraColorsRef = useRef<string[]>([]);
  ultraColorsRef.current = [
    rgbStr(mixRGB(ultraBase, WHITE, 0.42)),
    rgbStr(mixRGB(ultraBase, WHITE, 0.3)),
    rgbStr(mixRGB(ultraBase, WHITE, 0.52)),
    rgbStr(mixRGB(ultraBase, WHITE, 0.18)),
  ];

  const isUltra = index === LAST;

  // ---- geometry (px-based, knob-inset span like the original) ----
  const min = KNOB / 2;
  const max = Math.max(min, trackW - KNOB / 2);
  const span = Math.max(1, max - min);
  const pos = dragPos ?? index / LAST;
  const knobCx = min + pos * span;
  const fillW = knobCx + KNOB / 2;

  // ---- label swap animation (kept from the previous panel) ----
  const [labelName, setLabelName] = useState(EFFORT_META[value]?.name ?? "");
  const [labelAnim, setLabelAnim] = useState<"in" | "out" | null>(null);
  const lastNameRef = useRef(EFFORT_META[value]?.name ?? "");
  useEffect(() => {
    const nextName = EFFORT_META[value]?.name ?? "";
    if (nextName !== lastNameRef.current) {
      lastNameRef.current = nextName;
      setLabelAnim("out");
      const t = setTimeout(() => {
        setLabelName(nextName);
        setLabelAnim("in");
      }, 140);
      return () => clearTimeout(t);
    }
  }, [value]);

  // ---- track width via ResizeObserver (re-seeds canvases like the original) ----
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const ro = new ResizeObserver(() => setTrackW(track.clientWidth));
    ro.observe(track);
    setTrackW(track.clientWidth);
    return () => ro.disconnect();
  }, []);

  const commit = useCallback(
    (i: number) => {
      const clamped = clamp(Math.round(i), 0, LAST);
      const level = EFFORT_LEVELS[clamped];
      if (level && level !== value) onChangeRef.current(level);
    },
    [value]
  );

  // ---- confetti burst (ported: ring of beads from the knob rim) ----
  const fireBurst = useCallback(() => {
    if (prefersReducedMotion()) return;
    const slider = sliderRef.current;
    const cvs = confettiRef.current;
    const knob = knobRef.current;
    if (!slider || !cvs || !knob) return;
    if (!slider.getClientRects().length) return; // hidden (e.g. mirrored picker)
    const now = performance.now();
    if (now - lastBurstRef.current < 350) return; // no rapid-fire spam
    lastBurstRef.current = now;

    const MX = 32, MY = 40;
    const sw = slider.offsetWidth;
    const sh = slider.offsetHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = sw + MX * 2;
    const h = sh + MY * 2;
    if (!confBox.current || confBox.current.w !== w || confBox.current.h !== h || confBox.current.dpr !== dpr) {
      cvs.width = w * dpr;
      cvs.height = h * dpr;
      confBox.current = { w, h, dpr };
    }
    // knob's live on-screen position (computed style, not the transition target)
    const knobLeft = parseFloat(getComputedStyle(knob).left) || sw / 2;
    const cx = knobLeft + MX;
    const cy = sh / 2 + MY;
    // ring of chunky lavender-ish beads, dissolving within ~0.2s
    const colors = ultraColorsRef.current;
    const R = KNOB / 2;
    const COUNT = 14;
    for (let i = 0; i < COUNT; i++) {
      const ang = (i / COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const sp = 105 + Math.random() * 45;
      beadsRef.current.push({
        x: cx + Math.cos(ang) * R,
        y: cy + Math.sin(ang) * R,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 25,
        size: 4.5 + Math.random(),
        life: 0,
        ttl: 0.2 + Math.random() * 0.08,
        color: colors[i % colors.length],
      });
    }
    if (!confRaf.current) {
      confLast.current = now;
      confRaf.current = requestAnimationFrame(confettiTick);
    }
    // settle-time micro-pulse on the knob; skipped mid-drag
    if (!draggingRef.current && knob.animate) {
      knob.animate(
        [{ scale: "1" }, { scale: "1.05" }, { scale: "1" }],
        { duration: 180, easing: "cubic-bezier(0.32, 0.72, 0, 1)" }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confettiTick = useCallback((t: number) => {
    const cvs = confettiRef.current;
    const box = confBox.current;
    if (!cvs || !box) {
      confRaf.current = 0;
      return;
    }
    const ctx = cvs.getContext("2d");
    if (!ctx) {
      confRaf.current = 0;
      return;
    }
    const dt = clamp((t - confLast.current) / 1000, 0, 0.032);
    confLast.current = t;
    ctx.setTransform(box.dpr, 0, 0, box.dpr, 0, 0);
    ctx.clearRect(0, 0, box.w, box.h);
    beadsRef.current = beadsRef.current.filter(p => {
      p.life += dt;
      if (p.life >= p.ttl) return false;
      const damp = Math.exp(-6 * dt); // frame-rate-independent decay
      p.vx *= damp;
      p.vy = p.vy * damp - 20 * dt; // slight upward lift, no gravity
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = p.life / p.ttl;
      ctx.globalAlpha = Math.pow(1 - k, 1.5);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
      return true;
    });
    ctx.globalAlpha = 1;
    if (beadsRef.current.length) {
      confRaf.current = requestAnimationFrame(confettiTick);
    } else {
      confRaf.current = 0;
      ctx.clearRect(0, 0, box.w, box.h);
    }
  }, []);

  const maybeBurst = useCallback(
    (immediate: boolean) => {
      if (immediate) {
        fireBurst();
      } else {
        clearTimeout(burstTimer.current);
        burstTimer.current = window.setTimeout(fireBurst, 400); // after the spring settles
      }
    },
    [fireBurst]
  );

  // ---- external value changes: spring to the new stop (+ celebrate Ultra) ----
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (draggingRef.current) return;
    if (selfCommitRef.current) {
      selfCommitRef.current = false;
      return;
    }
    if (!prefersReducedMotion()) {
      setSnapping(true);
      clearTimeout(snapTimer.current);
      snapTimer.current = window.setTimeout(() => setSnapping(false), 460);
    }
    if (index === LAST) maybeBurst(false);
  }, [index, maybeBurst]);

  useEffect(
    () => () => {
      clearTimeout(snapTimer.current);
      clearTimeout(burstTimer.current);
      cancelAnimationFrame(confRaf.current);
      confRaf.current = 0;
    },
    []
  );

  // ---- gesture handlers (ported) ----
  const stopSnap = useCallback(() => {
    clearTimeout(snapTimer.current);
    setSnapping(false);
  }, []);

  const dragTo = useCallback(
    (e: ReactPointerEvent) => {
      const g = geomRef.current;
      if (!g || g.width <= KNOB) return;
      // fraction along the track is scale-invariant
      const frac = (e.clientX - g.left) / g.width;
      const p = clamp((frac * g.width - KNOB / 2) / (g.width - KNOB), 0, 1);
      dragPosRef.current = p;
      setDragPos(p);
      // live preview: the nearest stop commits as you cross it
      const nearest = Math.round(p * LAST);
      if (nearest !== index) commit(nearest);
    },
    [commit, index]
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerRef.current !== null) return; // single active pointer
      activePointerRef.current = e.pointerId;
      e.preventDefault();
      sliderRef.current?.focus({ preventScroll: true });
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      draggingRef.current = true;
      setDragging(true);
      burstFiredRef.current = false;
      const rect = trackRef.current?.getBoundingClientRect();
      if (rect) geomRef.current = { left: rect.left, width: rect.width };
      stopSnap();
      dragTo(e);
    },
    [dragTo, stopSnap]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (draggingRef.current && e.pointerId === activePointerRef.current) dragTo(e);
    },
    [dragTo]
  );

  const release = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current || e.pointerId !== activePointerRef.current) return;
      draggingRef.current = false;
      activePointerRef.current = null;
      geomRef.current = null;
      setDragging(false);
      const p = dragPosRef.current ?? index / LAST;
      dragPosRef.current = null;
      setDragPos(null);
      const target = clamp(Math.round(p * LAST), 0, LAST);
      // settle-then-pop: celebrate when the knob LANDS at Ultra, once per gesture
      const celebrate = target === LAST && !burstFiredRef.current;
      if (celebrate) burstFiredRef.current = true;
      const farFromStop = Math.abs(p * LAST - target) * (span / LAST) > 2;
      if (!prefersReducedMotion()) {
        setSnapping(true);
        clearTimeout(snapTimer.current);
        snapTimer.current = window.setTimeout(() => setSnapping(false), 460);
      }
      if (EFFORT_LEVELS[target] !== value) selfCommitRef.current = true;
      commit(target);
      if (celebrate) maybeBurst(!farFromStop);
    },
    [commit, index, maybeBurst, span, value]
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (step !== undefined) {
        e.preventDefault();
        if (EFFORT_LEVELS[clamp(index + step, 0, LAST)] !== value) selfCommitRef.current = true;
        commit(index + step);
        if (clamp(index + step, 0, LAST) === LAST) maybeBurst(true);
      } else if (e.key === "Home") {
        e.preventDefault();
        if (EFFORT_LEVELS[0] !== value) selfCommitRef.current = true;
        commit(0);
      } else if (e.key === "End") {
        e.preventDefault();
        if (EFFORT_LEVELS[LAST] !== value) selfCommitRef.current = true;
        commit(LAST);
        maybeBurst(true);
      }
    },
    [commit, index, maybeBurst, value]
  );

  const meta = EFFORT_META[EFFORT_LEVELS[index]];
  const springEase = "var(--effort-spring, cubic-bezier(0.32, 0.72, 0, 1))";
  const knobTransition = `${snapping && !dragging ? `left 380ms ${springEase}, ` : ""}scale 140ms cubic-bezier(0.32, 0.72, 0, 1)`;

  const slider = (
    <div
      ref={sliderRef}
      role="slider"
      tabIndex={0}
      aria-label="Effort level"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={LAST}
      aria-valuenow={index}
      aria-valuetext={`${meta.name} — ${meta.blurb}`}
      className={cn(
        "relative h-[38px] touch-none select-none rounded-full outline-none",
        dragging ? "cursor-grabbing" : "cursor-grab",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary/60"
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onKeyDown={onKeyDown}
    >
      {/* track */}
      <div
        ref={trackRef}
        className="absolute left-0 right-0 top-1/2 h-7 -translate-y-1/2 overflow-hidden rounded-full bg-[#e1e1e4] dark:bg-white/10"
      >
        {/* ticks (visible on the unfilled portion, like the original) */}
        <div className="pointer-events-none absolute inset-0">
          {EFFORT_LEVELS.map((_, i) => (
            <span
              key={i}
              className="absolute top-1/2 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c0c0c2] dark:bg-white/25"
              style={{ left: min + (i / LAST) * span }}
            />
          ))}
        </div>
        {/* fill — the user's accent color */}
        <div
          className="absolute bottom-0 left-0 top-0 overflow-hidden rounded-full"
          style={{ width: fillW, background: "rgb(var(--primary))" }}
        >
          {/* ultra gradient, crossfaded over the solid accent */}
          <div
            className="absolute inset-0 transition-opacity duration-300"
            style={{ background: ultraGrad, opacity: isUltra ? 1 : 0 }}
            aria-hidden
          />
          {/* sparkles stream (canvas sized to the full track, clipped by the fill) */}
          <SparkleCanvas trackRef={trackRef} innerRef={sparkRef} trackW={trackW} />
        </div>
      </div>
      {/* knob */}
      <div
        ref={knobRef}
        className="pointer-events-none absolute top-1/2 h-[34px] w-[34px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
        style={{
          left: knobCx,
          boxShadow:
            "0 0 0 0.5px rgba(26,29,33,0.03), 0 1px 2px rgba(26,29,33,0.10), 0 2px 6px rgba(26,29,33,0.14)",
          transition: knobTransition,
          scale: dragging ? "1.04" : "1",
        }}
      >
        {/* deeper drag shadow, crossfaded via opacity (never animates box-shadow) */}
        <div
          className="absolute inset-0 rounded-full transition-opacity duration-150"
          style={{
            boxShadow: "0 2px 3px rgba(26,29,33,0.10), 0 4px 10px rgba(26,29,33,0.14)",
            opacity: dragging ? 1 : 0,
          }}
        />
      </div>
      {/* celebration burst overlay (never intercepts input) */}
      <canvas
        ref={confettiRef}
        className="pointer-events-none absolute z-10"
        style={{ left: -32, top: -40 }}
        aria-hidden
      />
    </div>
  );

  const panel = (
    <div
      className={cn(
        "w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-background p-4 shadow-xl",
        standalone && "absolute z-50 w-72 max-w-[calc(100vw-2rem)]",
        standalone && placement === "top" && "bottom-[calc(100%+0.5rem)] right-0",
        standalone && placement === "bottom" && "right-0 top-[calc(100%+0.5rem)]",
        className
      )}
      role="group"
      aria-label="Effort settings"
      onPointerDown={e => e.stopPropagation()}
      onPointerUp={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {/* Header: animated level label, tinted at Ultra like the original tier */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground" aria-live="polite">
          Effort
          <span
            key={labelName + String(labelAnim)}
            className={cn(
              "ml-2 inline-block font-semibold",
              labelAnim === "in" && "effort-label-in",
              labelAnim === "out" && "effort-label-out"
            )}
            style={isUltra ? { color: rgbStr(ultraText) } : undefined}
          >
            {labelName || meta.name}
          </span>
        </p>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Novella 5.0</span>
      </div>

      {/* Header labels layer: Faster/Smarter on hover-drag, Ultra warning at max */}
      <div className="relative mt-1 h-4">
        <div className={cn("effort-hdr justify-between", !isUltra && "is-active")}>
          <span className="text-[11px] text-muted-foreground">Faster</span>
          <span className="text-[11px] text-muted-foreground">Smarter</span>
        </div>
        <div className={cn("effort-hdr justify-center", isUltra && "is-active")} aria-hidden={!isUltra}>
          <span
            className="text-xs font-semibold tracking-tight"
            style={{
              backgroundImage: `linear-gradient(90deg, ${rgbStr(mixRGB(ultraBase, BLACK, 0.12))}, ${rgbStr(
                mixRGB(ultraBase, WHITE, 0.18)
              )})`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Consumes usage limits faster
          </span>
        </div>
      </div>

      <div className="mt-1.5">{slider}</div>

      <p className="mt-1.5 text-xs text-muted-foreground">{meta.blurb}</p>
    </div>
  );

  if (!standalone) return panel;

  return (
    <div className="relative">
      <StandaloneTrigger
        open={open}
        setOpen={setOpen}
        label={label}
        levelName={EFFORT_META[value].name}
        isUltra={isUltra}
      />
      {open && panel}
    </div>
  );
}

/**
 * Sparkle stream inside the fill — ported from the original
 * (`#seedParticles` / `#drawSparkles`): soft white dots streaming
 * leftward at a constant fast pace with in-place twinkles. Sized to
 * the FULL track so particles already exist where the fill expands.
 */
function SparkleCanvas({
  trackRef,
  innerRef,
  trackW,
}: {
  trackRef: { current: HTMLDivElement | null };
  innerRef: { current: HTMLCanvasElement | null };
  trackW: number;
}) {
  useEffect(() => {
    const canvas = innerRef.current;
    const track = trackRef.current;
    if (!canvas || !track) return;
    const w = track.clientWidth;
    const h = track.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // sparse field across the full track
    const count = Math.max(6, Math.round(w / 24));
    const parts = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: 4 + Math.random() * (h - 8),
      r: 0.8 + Math.random() * 0.9,
      phase: Math.random() * Math.PI * 2,
      twinkle: 2.5 + Math.random() * 4.5,
      flow: 85 + Math.random() * 50,
    }));

    let visible = true;
    const io = new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? true;
    });
    io.observe(track);

    let raf = 0;
    let last = performance.now();
    const draw = (t: number, staticFrame = false) => {
      const dt = staticFrame ? 0 : clamp((t - last) / 1000, 0, 0.032);
      last = t;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#fff";
      const sec = t / 1000;
      for (const p of parts) {
        p.x -= p.flow * dt;
        if (p.x < -3) p.x += w + 6;
        // squared sine: mostly invisible with brief bright pops
        const s = 0.5 + 0.5 * Math.sin(staticFrame ? p.phase * 3 : sec * p.twinkle + p.phase);
        ctx.globalAlpha = 0.06 + 0.74 * s * s;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    if (prefersReducedMotion()) {
      draw(performance.now(), true);
      return () => io.disconnect();
    }
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible) return; // pause while hidden (mirrored pickers)
      draw(t);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [innerRef, trackRef, trackW]);

  return <canvas
    ref={el => {
      innerRef.current = el;
    }}
    className="absolute inset-y-0 left-0 h-full"
    aria-hidden
  />;
}

function StandaloneTrigger({
  open,
  setOpen,
  label,
  levelName,
  isUltra,
}: {
  open: boolean;
  setOpen: (fn: (o: boolean) => boolean) => void;
  label?: string;
  levelName: string;
  isUltra: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => setOpen(o => !o)}
      aria-expanded={open}
      aria-haspopup="dialog"
      className={cn(
        "relative inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
        isUltra ? "text-[#1a1a1a]" : "bg-secondary text-foreground hover:bg-accent"
      )}
      style={isUltra ? { backgroundColor: "#efefed" } : undefined}
    >
      {label ? `${label} · ` : ""}
      {levelName}
    </button>
  );
}

export default EffortSlider;
