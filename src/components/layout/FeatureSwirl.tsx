"use client";

import { useLayoutEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  FileText,
  Flower2,
  ListTodo,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/**
 * FeatureSwirl — the motion graphic on the onboarding welcome screen.
 *
 * Eight feature chips ride two counter-rotating, oppositely-tilted orbit
 * rings around a breathing core (a gyroscope, not a flat carousel): every
 * position is projected through a 640px CSS perspective, so chips sweeping
 * the near arc ride big/bright and chips on the far arc shrink and dim.
 * Hairline links flare up between neighbouring chips — the same near-neighbour
 * rule the Constellation starfield uses, so the graphic reads as part of the
 * sky rather than pasted on top of it. A gentle pointer parallax tilts the
 * whole rig a few degrees.
 *
 * Rendering contract (mirrors Constellation.tsx):
 *  - one rAF loop mutating styles on refs — zero React re-renders per frame;
 *  - draws a composed static frame synchronously in the layout effect, so the
 *    scene is never a blank frame on mount;
 *  - honours BOTH reduced-motion sources (OS preference + Orleia's own
 *    `html[data-reduced-motion]` toggle), watched live — either one ON
 *    freezes the swirl to one fully-visible frame;
 *  - stops rAF while the tab is hidden.
 *
 * Decorative: aria-hidden, and clicks pass through to the step's
 * click-anywhere-to-continue handler.
 */

type ChipDef = { label: string; Icon: LucideIcon };

/** One chip's place on its ring: base angle on the orbit, radius factor
 *  (organic 0.8–1.0 jitter so the ring never reads as a perfect circle),
 *  and a phase for the small vertical bob. */
type NodeDef = ChipDef & { ring: 0 | 1; phase: number; rf: number; bob: number };

const HALF_PI = Math.PI / 2;

const NODES: NodeDef[] = [
  // Outer ring — the headline features, slow clockwise drift.
  { label: "Tasks", Icon: ListTodo, ring: 0, phase: 0 * HALF_PI + 0.16, rf: 0.94, bob: 0 },
  { label: "Habits", Icon: CheckCircle2, ring: 0, phase: 1 * HALF_PI - 0.1, rf: 0.98, bob: 1.7 },
  { label: "Noor AI", Icon: Sparkles, ring: 0, phase: 2 * HALF_PI + 0.08, rf: 0.88, bob: 3.4 },
  { label: "Agents", Icon: Bot, ring: 0, phase: 3 * HALF_PI - 0.14, rf: 0.99, bob: 5.1 },
  // Inner ring — counter-rotating, tilted the opposite way so the two
  // paths weave through each other in depth.
  { label: "Notes", Icon: FileText, ring: 1, phase: 0.4 + 0 * HALF_PI + 0.2, rf: 0.82, bob: 0.8 },
  { label: "Journal", Icon: Flower2, ring: 1, phase: 0.4 + 1 * HALF_PI - 0.14, rf: 1.0, bob: 2.5 },
  { label: "Calendar", Icon: CalendarDays, ring: 1, phase: 0.4 + 2 * HALF_PI + 0.06, rf: 0.93, bob: 4.2 },
  { label: "Analytics", Icon: BarChart3, ring: 1, phase: 0.4 + 3 * HALF_PI - 0.1, rf: 0.8, bob: 5.9 },
];

const PAIRS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let i = 0; i < NODES.length; i++)
    for (let j = i + 1; j < NODES.length; j++) out.push([i, j]);
  return out;
})();

const P = 640; // perspective distance, px — tight enough that near/far chips
              // differ ~30% in size, which is what sells the depth.
const TILT0 = (32 * Math.PI) / 180; // outer ring, seen from above
const TILT1 = (-18 * Math.PI) / 180; // inner ring, opposite lean
const SPD0 = 0.26; // rad/s — outer revolution ≈ 24s
const SPD1 = -0.44; // rad/s — inner counter-revolution ≈ 14s
const LINK = 112; // px — beyond this two chips aren't connected
const FROZEN_MS = 1600; // the pose reduced-motion freezes to

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (v: number) => 1 - Math.pow(1 - v, 3);

export function FeatureSwirl({ className }: { className?: string }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<(HTMLDivElement | null)[]>([]);
  const ringRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lineRefs = useRef<(SVGLineElement | null)[]>([]);

  useLayoutEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const isReduced = () =>
      mq.matches ||
      document.documentElement.getAttribute("data-reduced-motion") === "true";
    let reduced = isReduced();
    let raf = 0;
    let lastT = 0;
    let clock = reduced ? FROZEN_MS : 0; // frozen pose while reduced
    let w = 1;
    let h = 1;
    let cx = 0;
    let cy = 0;
    let R1 = 80;
    let R2 = 46;
    // Parallax: current and target scene tilt (radians), lerped each frame.
    let yaw = 0;
    let pitch = 0;
    let tYaw = 0;
    let tPitch = 0;

    // Per-frame projection buffers (chip screen positions + depth) reused by
    // the link pass — no allocation inside the loop.
    const pxs = new Array<number>(NODES.length).fill(0);
    const pys = new Array<number>(NODES.length).fill(0);
    const ds = new Array<number>(NODES.length).fill(0);
    const fis = new Array<number>(NODES.length).fill(0);

    const measure = () => {
      const rect = scene.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      cx = w / 2;
      cy = h / 2;
      R1 = Math.min(w * 0.42, h * 0.46);
      R2 = R1 * 0.58;
      const rings = ringRefs.current;
      if (rings[0]) rings[0].style.width = rings[0].style.height = `${R1 * 2}px`;
      if (rings[1]) rings[1].style.width = rings[1].style.height = `${R2 * 2}px`;
    };

    const draw = () => {
      const t = reduced ? FROZEN_MS : clock;
      const s = t / 1000;
      const cP = Math.cos(pitch);
      const sP = Math.sin(pitch);
      const cY = Math.cos(yaw);
      const sY = Math.sin(yaw);
      const a0 = s * SPD0;
      const a1 = s * SPD1;
      const fiG = reduced ? 1 : easeOutCubic(clamp01((t - 150) / 850));
      const chips = chipRefs.current;

      // Chips: orbit → pitch → yaw → perspective, with depth-driven
      // opacity/blur/z-order and a staggered entrance fade.
      for (let i = 0; i < NODES.length; i++) {
        const n = NODES[i];
        const R = n.ring === 0 ? R1 : R2;
        const tilt = n.ring === 0 ? TILT0 : TILT1;
        const a = n.phase + (n.ring === 0 ? a0 : a1);
        const r = R * n.rf;
        const sa = Math.sin(a);
        const x0 = r * Math.cos(a);
        const y0 = r * sa * Math.sin(tilt);
        const z0 = r * sa * Math.cos(tilt);
        const y1 = y0 * cP - z0 * sP;
        const z1 = y0 * sP + z0 * cP;
        const X = x0 * cY + z1 * sY;
        const Z = -x0 * sY + z1 * cY;
        const Y = y1 + (reduced ? 0 : Math.sin(s * 0.9 + n.bob) * 4.5);

        const d01 = clamp01((Z / R1) * 0.5 + 0.5);
        const fi = reduced ? 1 : easeOutCubic(clamp01((t - 150 - i * 60) / 850));
        ds[i] = d01;
        fis[i] = fi;

        const el = chips[i];
        if (el) {
          el.style.transform = `translate(-50%,-50%) translate3d(${X.toFixed(2)}px, ${Y.toFixed(2)}px, ${Z.toFixed(2)}px)`;
          el.style.opacity = (fi * (reduced ? 0.92 : 0.4 + 0.6 * d01)).toFixed(3);
          const blur = (1 - d01) * 1.4;
          el.style.filter = reduced || blur < 0.15 ? "" : `blur(${blur.toFixed(2)}px)`;
          // Kept positive so chips always paint above the link layer.
          el.style.zIndex = String(100 + Math.round(Z));
        }
        // Manual perspective divide — must match the CSS `perspective: 640px`
        // exactly, since the SVG links live outside that 3D context.
        const k = P / (P - Z);
        pxs[i] = cx + X * k;
        pys[i] = cy + Y * k;
      }

      // Orbit hairlines: same tilt math as the chips (a circle rotated by
      // 90° − tilt about X lands exactly on the chip path), plus parallax.
      const rings = ringRefs.current;
      const yawDeg = (yaw * 180) / Math.PI;
      const pitchDeg = (pitch * 180) / Math.PI;
      for (let k = 0; k < 2; k++) {
        const el = rings[k];
        if (!el) continue;
        const base = 90 - ((k === 0 ? TILT0 : TILT1) * 180) / Math.PI;
        el.style.transform = `translate(-50%,-50%) rotateY(${yawDeg.toFixed(2)}deg) rotateX(${(pitchDeg + base).toFixed(2)}deg)`;
        el.style.opacity = fiG.toFixed(3);
      }

      // Near-neighbour links — Constellation's quadratic falloff, gated by
      // both chips' entrance fades so lines never lead invisible chips in.
      const lines = lineRefs.current;
      for (let p = 0; p < PAIRS.length; p++) {
        const el = lines[p];
        if (!el) continue;
        const [i, j] = PAIRS[p];
        const dx = pxs[i] - pxs[j];
        const dy = pys[i] - pys[j];
        const d = Math.hypot(dx, dy);
        let op = 0;
        if (d < LINK) {
          const f = 1 - d / LINK;
          op = f * f * 0.5 * (0.5 * (ds[i] + ds[j])) * fis[i] * fis[j];
        }
        el.setAttribute("x1", pxs[i].toFixed(1));
        el.setAttribute("y1", pys[i].toFixed(1));
        el.setAttribute("x2", pxs[j].toFixed(1));
        el.setAttribute("y2", pys[j].toFixed(1));
        el.style.opacity = op.toFixed(3);
      }
    };

    const frame = (t: number) => {
      const dt = lastT === 0 ? 16 : Math.min(64, t - lastT);
      lastT = t;
      if (!reduced) {
        clock += dt;
        // Pointer parallax, frame-rate independent lerp toward the target.
        const k = 1 - Math.pow(0.92, dt / 16);
        yaw += (tYaw - yaw) * k;
        pitch += (tPitch - pitch) * k;
      }
      draw();
      if (!reduced && raf) raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (raf || reduced) return;
      lastT = 0; // fresh dt baseline (post-hidden gap must not jump)
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
    };

    // Reduced-motion flipped (OS preference OR the in-app toggle): freeze to
    // the composed pose, or resume the swirl. Live — no reload required.
    const syncMotion = () => {
      const next = isReduced();
      if (next === reduced) return;
      reduced = next;
      if (next) {
        stop();
        clock = FROZEN_MS;
        yaw = pitch = tYaw = tPitch = 0;
        draw();
      } else {
        start();
      }
    };

    const onMove = (e: PointerEvent) => {
      if (reduced) return;
      tYaw = ((e.clientX / window.innerWidth) - 0.5) * 0.22;
      tPitch = (0.5 - (e.clientY / window.innerHeight)) * 0.15;
    };
    const onResize = () => {
      measure();
      draw();
    };
    // Mobile browsers discard the canvas/layer state for hidden tabs; stop
    // burning frames while hidden and resume cleanly when shown.
    const onVis = () => {
      if (document.hidden) stop();
      else if (reduced) draw();
      else start();
    };

    measure();
    draw(); // synchronous composed frame before first paint
    if (!reduced) start();
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVis);
    const obs = new MutationObserver(syncMotion);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-reduced-motion"],
    });
    mq.addEventListener?.("change", syncMotion);
    return () => {
      stop();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      obs.disconnect();
      mq.removeEventListener?.("change", syncMotion);
    };
  }, []);

  return (
    <div
      ref={sceneRef}
      aria-hidden="true"
      className={`relative mx-auto h-48 w-full max-w-md sm:h-60 ${className ?? ""}`}
      style={{ perspective: `${P}px` }}
    >
      {/* Neighbour links between chips — drawn under the pills (z auto < 100). */}
      <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" aria-hidden="true">
        {PAIRS.map(([i, j], p) => (
          <line
            key={`${i}-${j}`}
            ref={(el) => {
              lineRefs.current[p] = el;
            }}
            stroke="#fff"
            strokeWidth={1}
            style={{ opacity: 0 }}
          />
        ))}
      </svg>

      {/* Orbit hairlines — static ellipses that track the parallax tilt. */}
      {[0, 1].map((k) => (
        <div
          key={k}
          ref={(el) => {
            ringRefs.current[k] = el;
          }}
          className={`absolute left-1/2 top-1/2 rounded-full border ${
            k === 0 ? "border-white/10" : "border-white/[0.06]"
          }`}
        />
      ))}

      {/* The core: a breathing star the whole rig orbits. Framer drives the
          pulse, so MotionConfig's reduced-motion switch freezes it. */}
      <span className="pointer-events-none absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 sm:h-44 sm:w-44">
        <motion.span
          className="block h-full w-full rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, rgba(255,255,255,0.13), rgba(255,255,255,0.04) 45%, transparent 72%)",
          }}
          animate={{ scale: [1, 1.07, 1], opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut" }}
        />
      </span>
      <span className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2">
        <motion.span
          className="block h-full w-full rounded-full bg-white shadow-[0_0_18px_5px_rgba(255,255,255,0.45)]"
          animate={{ opacity: [0.75, 1, 0.75] }}
          transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut" }}
        />
      </span>

      {/* Feature chips — direct children of the perspective element so the
          640px projection applies to their translate3d. */}
      {NODES.map((n, i) => (
        <div
          key={n.label}
          ref={(el) => {
            chipRefs.current[i] = el;
          }}
          className="absolute left-1/2 top-1/2 will-change-transform"
          style={{ transform: "translate(-50%,-50%)" }}
        >
          <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-zinc-900/85 px-3 py-1.5 text-[11px] font-medium text-zinc-200 shadow-[0_2px_14px_rgba(0,0,0,0.45)] backdrop-blur-sm">
            <n.Icon className="h-3.5 w-3.5 text-primary-500" />
            {n.label}
          </span>
        </div>
      ))}
    </div>
  );
}
