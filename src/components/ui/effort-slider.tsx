"use client";

// ============================================================
// EffortSlider — Novella 5.0 effort picker (Claude-style slider).
//
// One model, six effort levels, fastest → deepest. A trigger button
// shows the current level; the panel holds a "Faster ←→ Smarter"
// slider with tick snaps. Standalone mode renders its own trigger;
// embedded mode renders just the panel body (used inside the Noor
// model picker). No entrance animations by design.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { EFFORT_META, EFFORT_LEVELS, type EffortLevel } from "@/lib/ai-models";
import { cn } from "@/lib/utils";

const LEVEL_COUNT = EFFORT_LEVELS.length; // 6

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

export function EffortSlider({ value, onChange, standalone = false, label, placement = "top", className }: EffortSliderProps) {
  const index = Math.max(0, EFFORT_LEVELS.indexOf(value));
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(index); // continuous 0..5 while dragging
  const posRef = useRef(pos);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    setPos(index);
    posRef.current = index;
  }, [index]);

  // Close on outside click (standalone popup).
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
      if (level && level !== value) onChange(level);
    },
    [onChange, value]
  );

  const onSliderInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number.parseFloat(e.target.value);
    // Magnetic snap: pull hard near a tick so detents feel physical.
    const nearest = Math.round(v);
    const delta = v - nearest;
    const snapped = Math.abs(delta) < 0.35 ? nearest : v;
    posRef.current = snapped;
    setPos(snapped);
    if (snapped === nearest) commit(snapped);
  };

  const onSliderPointerUp = () => {
    draggingRef.current = false;
    // Commit from the ref — never inside a setState updater (that would
    // update the parent during render).
    const cur = posRef.current;
    commit(Math.round(cur));
    posRef.current = Math.round(cur);
    setPos(Math.round(cur));
  };

  const meta = EFFORT_META[EFFORT_LEVELS[clamp(Math.round(pos), 0, LEVEL_COUNT - 1)]];

  const panel = (
    <div
      className={cn(
        "w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-background p-4 shadow-xl",
        standalone && placement === "top" && "absolute bottom-[calc(100%+0.5rem)] right-0 z-50",
        standalone && placement === "bottom" && "absolute top-[calc(100%+0.5rem)] left-0 z-50",
        className
      )}
      role="group"
      aria-label="Effort settings"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">
          Effort
          <span className="ml-2 font-semibold text-foreground/90">{meta.name}</span>
        </p>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Novella 5.0</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Faster</span>
        <span>Smarter</span>
      </div>
      <div className="relative mt-1.5 h-11">
        <div className="absolute inset-x-0 inset-y-2 overflow-hidden rounded-[10px] border border-border/70 bg-secondary" aria-hidden>
          {/* Fill up to the thumb */}
          <div
            className="absolute inset-y-0 left-0 bg-primary-500/20"
            style={{ width: `calc(${(clamp(pos, 0, LEVEL_COUNT - 1) / (LEVEL_COUNT - 1)) * 100}% + 3px)` }}
          />
          {/* Ticks */}
          <div className="absolute inset-0 flex items-center justify-between px-2">
            {EFFORT_LEVELS.map((lv) => (
              <span
                key={lv}
                className={cn(
                  "h-1 w-1 rounded-full",
                  lv === "ultra" ? "bg-primary-500" : "bg-muted-foreground/40"
                )}
              />
            ))}
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={LEVEL_COUNT - 1}
          step={0.01}
          value={clamp(pos, 0, LEVEL_COUNT - 1)}
          onChange={onSliderInput}
          onPointerDown={() => (draggingRef.current = true)}
          onPointerUp={onSliderPointerUp}
          onBlur={() => commit(pos)}
          aria-label="Effort level"
          aria-valuetext={meta.name}
          className="absolute inset-0 w-full appearance-none bg-transparent [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-md [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-border [&::-moz-range-thumb]:bg-background [&::-moz-range-thumb]:shadow-md [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-md [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-border [&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow-md"
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
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent"
      >
        {label ? `${label} · ` : ""}
        {EFFORT_META[value].name}
      </button>
      {open && panel}
    </div>
  );
}

export default EffortSlider;
