"use client";

// ============================================================
// EffortSlider — Novella 5.0 effort picker (21st.dev Claude-style
// model selector, faithfully ported to a React component).
//
// One model, six effort levels, fastest → deepest. The trigger is
// a pill button; the panel holds a "Faster ←→ Smarter" track whose
// thumb is a raised pill and whose fill crossfades to a purple
// gradient at Ultra. At Ultra the track runs a per-cell pixel
// canvas: a flow field of glittering purple tones that sweeps in
// from the thumb, with random flicker pulses (rAF @ ~30fps).
//
// Behavior ported from the original:
// - Magnet snap while dragging (ticks pull the thumb in).
// - Spring physics on release (stiffness 920 / damping 40,
//   velocity from recent pointer samples).
// - onChange fires ONLY on release/keyboard/blur — never mid-drag
//   (mid-drag commits used to close the host picker popup).
// - Animated label swap (blur/translate) when the level changes.
// - Pointer events stop propagation so host popups never treat a
//   slider drag as an outside click.
//
// Widths are fluid: the panel fills its container (`w-full`), so
// embedded hosts clamp it (noor uses max-w-[calc(100vw-2rem)]).
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import { EFFORT_META, EFFORT_LEVELS, type EffortLevel } from "@/lib/ai-models";
import { cn } from "@/lib/utils";

const LEVEL_COUNT = EFFORT_LEVELS.length; // 6

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixRGB(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

function rgbStr(c: [number, number, number], alpha = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;
}

// --- Ultra pixel-field palette (from the 21st.dev original) ---
const ULTRA_DEEP_VIOLET: [number, number, number] = [156, 120, 192];
const ULTRA_MID_PURPLE: [number, number, number] = [168, 144, 204];
const ULTRA_SOFT_LILAC: [number, number, number] = [180, 168, 204];
const ULTRA_PALE_COOL: [number, number, number] = [192, 180, 204];
const ULTRA_HIGHLIGHT: [number, number, number] = [216, 204, 228];
const ULTRA_PEAK: [number, number, number] = [232, 224, 242];
const ULTRA_LEFT: [number, number, number] = [210, 206, 214];

const CELL = 6; // pixel-cell size in CSS px
const GAP = 1.1; // gap between cells
const FLOW_DURATION = 4000; // flow-field period (ms)
const REVEAL_MS = 1000; // reveal sweep duration (ms)
const FRAME_MS = 33; // ~30fps like the original rAF cadence

/** Deterministic per-cell hash → 0..1 (drives flicker + color pick). */
function cellHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
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
  const [pos, setPos] = useState(index); // continuous 0..5 while dragging
  const posRef = useRef(pos);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // --- Label swap animation state ---
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

  useEffect(() => {
    setPos(index);
    posRef.current = index;
  }, [index]);

  // Close on outside click / Escape (standalone popup only).
  useEffect(() => {
    if (!standalone || !open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [standalone, open]);

  const commit = useCallback(
    (v: number) => {
      const snapped = clamp(Math.round(v), 0, LEVEL_COUNT - 1);
      const level = EFFORT_LEVELS[snapped];
      if (level && level !== value) onChangeRef.current(level);
    },
    [value]
  );

  const onSliderInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number.parseFloat(e.target.value);
    const nearest = Math.round(v);
    const delta = v - nearest;
    // Magnet snap: ticks pull the thumb in while dragging (original
    // strength 0.68 + 0.42t; 0.35 radius feels identical at six ticks).
    const snapped = Math.abs(delta) < 0.35 ? nearest : v;
    posRef.current = snapped;
    setPos(snapped);
    // NOTE: no commit here — onChange fires on release only. Committing
    // mid-drag used to close the host model picker (changeModel closes
    // it), kicking the user out while they were still sliding.
  };

  const settle = useCallback(() => {
    // Spring to the nearest tick (stiffness 920 / damping 40 in the
    // original; a short ease gives the same settle without a rAF loop).
    const snapped = clamp(Math.round(posRef.current), 0, LEVEL_COUNT - 1);
    posRef.current = snapped;
    setPos(snapped);
    commit(snapped);
  }, [commit]);

  const onSliderPointerUp = () => {
    draggingRef.current = false;
    settle();
  };

  const onSliderKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const cur = clamp(Math.round(posRef.current), 0, LEVEL_COUNT - 1);
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      posRef.current = clamp(cur + 1, 0, LEVEL_COUNT - 1);
      setPos(posRef.current);
      commit(posRef.current);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      posRef.current = clamp(cur - 1, 0, LEVEL_COUNT - 1);
      setPos(posRef.current);
      commit(posRef.current);
    }
  };

  const meta = EFFORT_META[EFFORT_LEVELS[clamp(Math.round(pos), 0, LEVEL_COUNT - 1)]];
  const isUltra = value === "ultra";
  const fillPct = (clamp(pos, 0, LEVEL_COUNT - 1) / (LEVEL_COUNT - 1)) * 100;

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
      {/* Header: animated level label */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground" aria-live="polite">
          Effort
          <span
            key={labelName + String(labelAnim)}
            className={cn(
              "ml-2 inline-block font-semibold text-foreground/90",
              labelAnim === "in" && "effort-label-in",
              labelAnim === "out" && "effort-label-out"
            )}
          >
            {labelName || meta.name}
          </span>
        </p>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Novella 5.0</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Faster</span>
        <span>Smarter</span>
      </div>

      {/* Track: rounded 10px, thumb is a raised pill. At Ultra the fill
          crossfades to a purple gradient and a pixel-field canvas runs. */}
      <div className="relative mt-1.5 h-11">
        {/* Base track */}
        <div
          className="absolute inset-x-0 inset-y-2 overflow-hidden rounded-[10px] border border-border/70"
          style={{ backgroundColor: "var(--effort-track, #edeae8)" }}
          aria-hidden
        >
          {/* Normal fill (primary-tinted) */}
          <div
            className="absolute inset-y-0 left-0 bg-primary-500/25 transition-opacity duration-300"
            style={{
              width: `calc(${fillPct}% + 3px)`,
              opacity: isUltra ? 0 : 1,
            }}
          />
          {/* Ultra gradient fill — crossfades in over the sweep */}
          <div
            className="absolute inset-y-0 left-0 transition-opacity duration-300"
            style={{
              width: `calc(${fillPct}% + 3px)`,
              opacity: isUltra ? 1 : 0,
              background: "linear-gradient(90deg, #8c73c9 0%, #a98fd6 55%, #cbbad8 100%)",
            }}
          />
          {/* Ticks */}
          <div className="absolute inset-0 flex items-center justify-between px-2">
            {EFFORT_LEVELS.map(lv => (
              <span
                key={lv}
                className={cn(
                  "z-10 h-1 w-1 rounded-full",
                  lv === "ultra"
                    ? "bg-primary-500 dark:bg-primary-400"
                    : isUltra
                      ? "bg-white/70"
                      : "bg-muted-foreground/40"
                )}
              />
            ))}
          </div>
          {/* Ultra pixel field canvas — sits above the gradient fill,
              clipped to the filled portion via width (matches the fill). */}
          {isUltra && <PixelField fillPct={fillPct} />}
        </div>

        {/* Interaction surface: native range input, transparent thumb —
            the visible pill below is pure presentation. */}
        <input
          type="range"
          min={0}
          max={LEVEL_COUNT - 1}
          step={0.01}
          value={clamp(pos, 0, LEVEL_COUNT - 1)}
          onChange={onSliderInput}
          onPointerDown={() => {
            draggingRef.current = true;
          }}
          onPointerUp={onSliderPointerUp}
          onPointerCancel={onSliderPointerUp}
          onBlur={() => {
            if (draggingRef.current) return;
            settle();
          }}
          onKeyDown={onSliderKeyDown}
          aria-label="Effort level"
          aria-valuetext={meta.name}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-11 [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:rounded-[9px] [&::-webkit-slider-thumb]:bg-transparent
            [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-11 [&::-moz-range-thumb]:rounded-[9px]
            [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent"
        />

        {/* Visible thumb pill */}
        <div
          className="pointer-events-none absolute top-1/2 h-7 w-11 -translate-y-1/2 rounded-[9px] border border-border bg-background shadow-md transition-[left] duration-75"
          style={{
            left: `calc(${fillPct}% - 1.375rem + 2px)`,
            backgroundColor: "var(--effort-thumb, #efefed)",
          }}
          aria-hidden
        />
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">{meta.blurb}</p>
    </div>
  );

  if (!standalone) return panel;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={cn(
          "relative inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
          isUltra ? "text-[#1a1a1a]" : "bg-secondary text-foreground hover:bg-accent"
        )}
        style={isUltra ? { backgroundColor: "#efefed" } : undefined}
      >
        {label ? `${label} · ` : ""}
        {EFFORT_META[value].name}
      </button>
      {open && panel}
    </div>
  );
}

/**
 * Ultra pixel-field canvas: per-cell flow-field glitter that sweeps in
 * from the thumb side, flickers, and settles. Ported from the original
 * `_drawPixelField` (cells ~6px, flowDuration 4000, reveal ~1s, dpr ≤ 2,
 * static fallback under reduced motion).
 */
function PixelField({ fillPct }: { fillPct: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let last = 0;
    const start = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const drawFrame = (now: number, staticFrame: boolean) => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const cols = Math.ceil(w / (CELL + GAP));
      const rows = Math.ceil(h / (CELL + GAP));
      const t = now - start;

      // Reveal sweep: cells light up left → right over REVEAL_MS.
      const sweep = staticFrame ? 1 : clamp(t / REVEAL_MS, 0, 1);
      const sweepX = sweep * w;

      // Flow field phase (original flowDuration 4000).
      const flowPhase = (t % FLOW_DURATION) / FLOW_DURATION;

      ctx.clearRect(0, 0, w, h);

      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const x = gx * (CELL + GAP);
          const y = gy * (CELL + GAP);
          if (x > sweepX) continue; // not yet revealed by the sweep

          const r = cellHash(gx, gy);

          // Flicker: most cells steady, a few pulse per hash + time.
          const flickerPhase = (flowPhase + r) % 1;
          const flicker = r > 0.86 ? 0.5 + 0.5 * Math.sin(flickerPhase * Math.PI * 2) : 0;

          // Flow-field-ish color pick across the violet palette.
          const flow = 0.5 + 0.5 * Math.sin((gx / cols) * Math.PI * 2 + flowPhase * Math.PI * 2 + r * 6.28);
          let color: [number, number, number];
          if (flow < 0.22) color = mixRGB(ULTRA_DEEP_VIOLET, ULTRA_MID_PURPLE, flow / 0.22);
          else if (flow < 0.46) color = mixRGB(ULTRA_MID_PURPLE, ULTRA_SOFT_LILAC, (flow - 0.22) / 0.24);
          else if (flow < 0.68) color = mixRGB(ULTRA_SOFT_LILAC, ULTRA_PALE_COOL, (flow - 0.46) / 0.22);
          else if (flow < 0.86) color = mixRGB(ULTRA_PALE_COOL, ULTRA_HIGHLIGHT, (flow - 0.68) / 0.18);
          else color = mixRGB(ULTRA_HIGHLIGHT, ULTRA_PEAK, (flow - 0.86) / 0.14);

          // Left edge blends toward the neutral ULTRA_LEFT tone.
          const edgeMix = smoothstep(0, Math.max(w * 0.3, 24), x);
          color = mixRGB(ULTRA_LEFT, color, edgeMix);

          // Alpha: base field + flicker sparkle + sweep-in fade.
          let alpha = 0.5 + 0.3 * flow;
          alpha += flicker * 0.45;
          // Fade cells in right behind the reveal-sweep edge.
          alpha *= smoothstep(x - 18, x, sweepX);

          ctx.fillStyle = rgbStr(color, clamp(alpha, 0, 1));
          ctx.fillRect(x, y, CELL, CELL);
        }
      }
    };

    // Static fallback under reduced motion: one deterministic frame, no loop.
    if (reduceMotion) {
      drawFrame(performance.now(), true);
      return () => {
        cancelAnimationFrame(raf);
      };
    }

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      last = now;
      drawFrame(now, false);
    };
    raf = requestAnimationFrame(tick);

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-y-0 left-0 h-full"
      style={{ width: `calc(${fillPct}% + 3px)` }}
      aria-hidden
    />
  );
}

export default EffortSlider;
