"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Animated starfield: drifting stars that twinkle on their own beat, hairline
 * links between near neighbours, and occasional meteors. Pure canvas.
 *
 * Motion honours BOTH reduced-motion sources: the OS preference
 * (prefers-reduced-motion) and Orleia's own Settings → Accessibility toggle
 * (`html[data-reduced-motion]`, which the global CSS and MotionConfig already
 * obey — the canvas used to ignore it and kept drifting). Either source ON
 * freezes the sky to a single static frame; both are watched live, so
 * flipping the in-app toggle stops/starts the drift without a reload.
 *
 * Used by the onboarding welcome/goals/hear steps and by the global
 * "constellation" theme (ThemeBackdrop).
 */
export function Constellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Layout effect (never server-rendered — parents gate it client-side):
  // seed + draw synchronously before the browser paints, so the canvas is
  // never a blank frame on mount. The static CSS sky (.theme-sky) covers
  // the pre-hydration gap; this covers the mount frame.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const isReduced = () =>
      mq.matches ||
      document.documentElement.getAttribute("data-reduced-motion") === "true";
    let reduced = isReduced();
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
    // one static frame, or resume the drift. Live — no reload required.
    const syncMotion = () => {
      const next = isReduced();
      if (next === reduced) return;
      reduced = next;
      meteors = [];
      if (next) {
        stop();
        frame(0);
      } else {
        start();
      }
    };
    seed();
    if (reduced) frame(0);
    else start();
    const onResize = () => {
      seed();
      if (reduced) frame(0);
    };
    // Mobile browsers discard the canvas bitmap for hidden tabs; redraw the
    // moment the tab is shown again so the sky is back instantly, and stop
    // burning frames while hidden.
    const onVis = () => {
      if (document.hidden) stop();
      else if (reduced) frame(0);
      else start();
    };
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
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      obs.disconnect();
      mq.removeEventListener?.("change", syncMotion);
    };
  }, []);
  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden />;
}
