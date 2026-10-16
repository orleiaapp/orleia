"use client";

// ============================================================
// PetCelebrate — the send-off after the tutorial's pet pick. A
// full-screen moment in the tour's dark editorial style: the newly
// adopted companion front and centre, and one line telling the
// explorer to go look around Orleia. The CTA hands back to
// TutorialFlow's onComplete (→ workspace).
// ============================================================

import { motion } from "framer-motion";
import { Compass } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { petById, petSvg } from "@/lib/pets";
import { EASE_OUT } from "@/lib/utils";

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
  const pet = petById(petId);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden bg-[#050508] px-4 pb-10 pt-10 text-white">
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
