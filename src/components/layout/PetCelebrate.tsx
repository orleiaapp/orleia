"use client";

// ============================================================
// PetCelebrate — the confetti send-off after the tutorial's pet
// pick. A full-screen moment in the tour's dark editorial style:
// canvas confetti cannons from both bottom corners plus a centre
// pop, the newly adopted companion front and centre, and one line
// telling the explorer to go look around Orleia. The CTA hands
// back to TutorialFlow's onComplete (→ plan intro → workspace).
// ============================================================

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Compass } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { petById, petSvg } from "@/lib/pets";
import { EASE_OUT } from "@/lib/utils";

// Confetti palette: white + gold + soft accents that pop on #050508
// without clashing with the tour's monochrome chrome.
const COLORS = ["#ffffff", "#facc15", "#38bdf8", "#f472b6", "#c4b5fd", "#86efac"];

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  life: number;
  maxLife: number;
  sway: number;
};

export function PetCelebrate({
  petId,
  displayName,
  onEnter,
}: {
  petId: string;
  displayName: string;
  onEnter: () => void;
}) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pet = petById(petId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Reduced motion: the celebration copy still shows, the burst doesn't.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const pieces: Piece[] = [];
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const launch = (
      ox: number,
      oy: number,
      count: number,
      baseAngle: number,
      spread: number,
      power: number
    ) => {
      for (let i = 0; i < count; i++) {
        const angle = baseAngle + rand(-spread, spread);
        const speed = power * rand(0.6, 1.15);
        pieces.push({
          x: ox,
          y: oy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rot: rand(0, Math.PI * 2),
          vr: rand(-0.25, 0.25),
          w: rand(5, 9),
          h: rand(8, 15),
          color: COLORS[(Math.random() * COLORS.length) | 0],
          life: 0,
          maxLife: rand(170, 280),
          sway: rand(0, Math.PI * 2),
        });
      }
    };

    // Two corner cannons angled inward-up, then a centre fountain pop.
    const rad = Math.PI / 180;
    launch(width * 0.06, height + 8, 46, -62 * rad, 22 * rad, 17);
    launch(width * 0.94, height + 8, 46, -118 * rad, 22 * rad, 17);
    const pop = window.setTimeout(() => {
      launch(width * 0.5, height * 0.66, 34, -90 * rad, 150 * rad, 9);
    }, 420);

    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, width, height);
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        p.life++;
        p.vy += 0.16; // gravity
        p.vx *= 0.992; // air drag
        p.sway += 0.08;
        p.x += p.vx + Math.sin(p.sway) * 0.5;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.life > p.maxLife || p.y > height + 40) {
          pieces.splice(i, 1);
          continue;
        }
        const fade = Math.min(1, (p.maxLife - p.life) / 40);
        const squash = 0.35 + 0.65 * Math.abs(Math.cos(p.sway * 1.4));
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, squash); // fluttering-paper tumble
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (pieces.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(pop);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden bg-[#050508] px-4 pb-10 pt-10 text-white">
      {/* Confetti layer — pointer-free, behind the copy */}
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
      {/* Progress bar complete — matches TutorialGuide/PetPickStep */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-white/10">
        <div className="h-full w-full bg-white" />
      </div>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.6, ease: EASE_OUT }}
        className="relative text-center text-[10px] font-sans tracking-[0.35em] text-zinc-500 md:text-[11px]"
      >
        {t("tutorial.celebrate.kicker")}
      </motion.p>
      <motion.h2
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.6, ease: EASE_OUT }}
        className="relative mt-3 text-center font-sans text-4xl font-bold tracking-tight text-white md:text-6xl"
      >
        {t("tutorial.celebrate.title")}
      </motion.h2>

      {/* The new companion, front and centre */}
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.22, duration: 0.65, ease: EASE_OUT }}
        className="relative mt-8"
      >
        <div aria-hidden className="absolute -inset-6 rounded-full bg-white/5 blur-2xl" />
        {pet && (
          <div
            className="relative mx-auto h-36 w-36 md:h-44 md:w-44"
            dangerouslySetInnerHTML={{ __html: petSvg(pet, "h-full w-full") }}
          />
        )}
        <p className="relative mt-3 text-center text-sm text-zinc-400">
          <span className="font-semibold text-white">{displayName}</span>
        </p>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.38, duration: 0.6, ease: EASE_OUT }}
        className="relative mx-auto mt-5 max-w-md text-center text-sm leading-relaxed text-zinc-500 md:text-base"
      >
        {t("tutorial.celebrate.desc")}
      </motion.p>

      <motion.button
        type="button"
        onClick={onEnter}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.52, duration: 0.55, ease: EASE_OUT }}
        className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-medium text-black shadow-[0_0_36px_-8px_rgba(255,255,255,0.55)] transition-all hover:bg-zinc-200 active:scale-[0.98]"
      >
        <Compass className="h-4 w-4" />
        {t("tutorial.celebrate.cta")}
      </motion.button>
    </div>
  );
}
