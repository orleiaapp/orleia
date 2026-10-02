"use client";

// ============================================================
// PetReactions — makes the pet feel alive across the whole app.
// A global listener (mounted in ClientLayout) that watches the
// workspace for moments worth reacting to:
//   • You complete a task  → the pet cheers you on (rate-limited).
//   • You log a good mood  → the pet shares the joy.
//   • You log a rough mood → the pet sends a quiet, warm hug.
//   • Late at night        → agents keep working the night shift, silently.
//   • A hired agent proposes work → proposal card (confirm chip).
// Pure local-first: reactions cost nothing; proposals are
// confirm-first (pet-agent.ts never writes without a tap).
// ============================================================

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Clock, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { storage } from "@/lib/storage";
import { petById, petSvg } from "@/lib/pets";
import { getMoodScore, getToday } from "@/lib/utils";
import {
  evaluateAll,
  executeProposal,
  recordDismissal,
  snoozeRole,
  petNameFor,
  subscribePetProposals,
  roster,
  type PetProposal,
} from "@/lib/pet-agent";
import { ensureScoutRunner, scoutJobs } from "@/lib/scout-jobs";

type Reaction = { key: string; emoji: string; id: number };

const CHEER_COOLDOWN_MS = 20_000;
const HIDE_AFTER_MS = 2600;
// 24/7 employee cadence: every hired agent works a round at least this
// often while the app is open, even if nothing in the workspace changed.
const ROUND_INTERVAL_MS = 15 * 60 * 1000;

export function PetReactions() {
  const { t } = useI18n();
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [petKey, setPetKey] = useState("");
  const [proposal, setProposal] = useState<PetProposal | null>(null);
  // Scout job finished while the user was elsewhere → celebration toast.
  const [scoutDone, setScoutDone] = useState<{ name: string; title: string; petId?: string } | null>(null);
  const [working, setWorking] = useState(false);
  const prev = useRef<{ done: number; mood: number | null }>({ done: -1, mood: null });
  const lastCheer = useRef(0);
  const hidTimer = useRef<number | null>(null);
  const evalTimer = useRef<number | null>(null);
  const lastEval = useRef(0);

  useEffect(() => {
    const snapshot = () => {
      const d = storage.getData();
      const today = getToday();
      return {
        done: d.tasks.filter((x: any) => x.status === "done").length,
        mood: (d.journalEntries.find((e: any) => e.date === today)?.mood as string) || null,
        pet: d.profile?.pet || "",
        petName: (d.profile?.petName || "").trim(),
      };
    };

    prev.current = (() => {
      const s = snapshot();
      return { done: s.done, mood: s.mood ? getMoodScore(s.mood as any) : null };
    })();
    setPetKey(snapshot().pet);

    const show = (key: string, emoji: string) => {
      setReaction({ key, emoji, id: Date.now() });
      if (hidTimer.current) window.clearTimeout(hidTimer.current);
      hidTimer.current = window.setTimeout(() => setReaction(null), HIDE_AFTER_MS);
    };

    /** Run agent evaluators (no-op while the roster is empty). */
    const runEvaluators = () => {
      if (document.hidden) return;
      lastEval.current = Date.now();
      evaluateAll().then((props) => {
        if (props.length) setProposal((cur) => cur || props[0]);
      }).catch(() => {});
    };
    const scheduleEvaluators = () => {
      if (evalTimer.current) window.clearTimeout(evalTimer.current);
      evalTimer.current = window.setTimeout(runEvaluators, 1500);
    };

    const onVisible = () => {
      if (!document.hidden) scheduleEvaluators();
    };

    // Scout runner: picks up assigned jobs as soon as they land.
    const stopRunner = ensureScoutRunner();

    // Scout delivery toast: poll for jobs that just finished (storage
    // writes in the pet's thread don't touch task data, so the general
    // subscription below won't fire for them).
    let lastDoneId = "";
    for (const j of scoutJobs()) {
      if (j.status === "done" && j.finishedAt && Date.now() - new Date(j.finishedAt).getTime() < 30_000) {
        lastDoneId = j.id;
        break;
      }
    }
    const pollDone = window.setInterval(() => {
      const j = scoutJobs().find(
        (x) => x.status === "done" && x.finishedAt && Date.now() - new Date(x.finishedAt).getTime() < 30_000 && x.id !== lastDoneId
      );
      if (!j) return;
      lastDoneId = j.id;
      const agent = roster().find((x) => x.id === j.agentId);
      setScoutDone({
        name: agent?.name || petNameFor(j.agentId),
        title: (j.resultTitle || "Findings").slice(0, 42),
        petId: agent?.petId,
      });
      window.setTimeout(() => setScoutDone(null), 5000);
    }, 2000);

    const unsub = storage.subscribe(() => {
      const s = snapshot();
      setPetKey(s.pet);
      const pet = petById(s.pet);
      if (!pet) return;
      const name = s.petName || pet.name;
      const hour = new Date().getHours();
      const asleep = hour >= 23 || hour < 5;

      const done = s.done;
      const moodScore = s.mood ? getMoodScore(s.mood as any) : null;

      // Task completed → cheer (rate-limited so batch completions feel natural).
      if (prev.current.done >= 0 && done > prev.current.done && !asleep) {
        const now = Date.now();
        if (now - lastCheer.current > CHEER_COOLDOWN_MS) {
          lastCheer.current = now;
          show("pet.alive.cheer", "🎉");
        }
      }

      // Mood logged this session → empathic reaction (once per change).
      if (moodScore !== null && moodScore !== prev.current.mood && !asleep) {
        if (moodScore >= 67) show("pet.alive.happyMood", "😊");
        else if (moodScore <= 33) show("pet.alive.gentle", "💛");
      }

      prev.current = { done, mood: moodScore };

      // Data changed → hired agents may have something to say (debounced).
      scheduleEvaluators();
    });

    // User-initiated runs ("Run now") bypass evaluateAll's dedupe and
    // arrive here as a fresh proposal event.
    const unsubProposals = subscribePetProposals((p) => {
      setProposal((cur) => cur || p);
    });

    document.addEventListener("visibilitychange", onVisible);
    // Open-time check too (storage.subscribe only fires on writes).
    scheduleEvaluators();

    // 24/7 rounds: hired agents check in on a fixed cadence while the
    // app is open - even when nothing changed - like employees on shift
    // rather than chatbots poked by activity. Quiet hours still apply
    // (night work is silent) inside evaluateAll/recordWork.
    const roundTimer = window.setInterval(() => {
      if (!document.hidden && Date.now() - lastEval.current > ROUND_INTERVAL_MS) runEvaluators();
    }, 60_000);

    return () => {
      unsub();
      unsubProposals();
      stopRunner();
      window.clearInterval(pollDone);
      window.clearInterval(roundTimer);
      document.removeEventListener("visibilitychange", onVisible);
      if (hidTimer.current) window.clearTimeout(hidTimer.current);
      if (evalTimer.current) window.clearTimeout(evalTimer.current);
    };
  }, []);

  // Proposal cards / toasts wear the AGENT's pet (proposal.agentId →
  // roster.petId); the cosmetic companion is only the fallback.
  const agentPet = petById(roster().find((a) => a.id === proposal?.agentId)?.petId || "");
  const toastPet = petById(scoutDone?.petId || "");
  const pet = petById(petKey) || agentPet || toastPet;
  if (!pet || (!reaction && !proposal && !scoutDone)) return null;
  const name = petNameFor(petKey);

  /** t() has no param interpolation — do it here. */
  const interpolate = (s: string) =>
    s.replace("{name}", String(proposal?.params?.name ?? name)).replace(/\{count\}/g, String(proposal?.params?.count ?? ""));

  const hideProposal = () => setProposal(null);

  const onConfirm = () => {
    if (!proposal || working) return;
    setWorking(true);
    try {
      executeProposal(proposal);
    } finally {
      setWorking(false);
      hideProposal();
    }
  };

  const onSnooze = () => {
    if (proposal) snoozeRole(proposal.role);
    hideProposal();
  };

  const onDismiss = () => {
    if (proposal) recordDismissal(proposal);
    hideProposal();
  };

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] print:hidden" aria-live="polite">
      <AnimatePresence>
        {proposal && (
          <motion.div
            key={`prop-${proposal.key}`}
            initial={{ opacity: 0, y: 14, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="card pointer-events-auto mb-2 w-[min(20rem,calc(100vw-2rem))] p-3.5 shadow-lg"
          >
            <div className="flex items-start gap-2.5">
              <span
                className="h-9 w-9 shrink-0"
                dangerouslySetInnerHTML={{ __html: petSvg(pet, "h-full w-full") }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug text-foreground">
                  {proposal.emoji}{" "}
                  {interpolate(proposal.titleKey ? t(proposal.titleKey, proposal.title) : proposal.title)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {interpolate(proposal.bodyKey ? t(proposal.bodyKey, proposal.body) : proposal.body)}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={onConfirm}
                disabled={working}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                <Check className="h-3.5 w-3.5" />
                {t("petagent.confirm", "Do it")}
              </button>
              <button
                onClick={onSnooze}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-hover"
              >
                <Clock className="h-3.5 w-3.5" />
                {t("petagent.later", "Later")}
              </button>
              <button
                onClick={onDismiss}
                aria-label={t("petagent.dismiss", "Dismiss")}
                className="inline-flex items-center justify-center rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-sidebar-hover hover:text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
        {scoutDone && !proposal && (
          <motion.div
            key="scout-done"
            initial={{ opacity: 0, y: 14, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="card flex items-center gap-2.5 py-2 pl-2.5 pr-3.5 shadow-lg"
          >
            <span
              className="h-8 w-8 shrink-0"
              dangerouslySetInnerHTML={{ __html: petSvg(petById(scoutDone.petId || "") || pet, "h-full w-full") }}
            />
            <span className="text-xs font-medium text-foreground">
              🎉 {t("petagent.scout.doneToast", "{name} delivered “{title}”")
                .replace("{name}", scoutDone.name)
                .replace("{title}", scoutDone.title)}
            </span>
          </motion.div>
        )}
        {reaction && !proposal && !scoutDone && (
          <motion.div
            key={reaction.id}
            initial={{ opacity: 0, y: 14, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="card flex items-center gap-2.5 py-2 pl-2.5 pr-3.5 shadow-lg"
          >
            <span
              className="h-8 w-8 shrink-0"
              dangerouslySetInnerHTML={{ __html: petSvg(pet, "h-full w-full") }}
            />
            <span className="text-xs font-medium text-foreground">
              {reaction.emoji} {t(reaction.key).replace("{name}", name)}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
