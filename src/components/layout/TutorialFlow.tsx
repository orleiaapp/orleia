"use client";

// ============================================================
// TutorialFlow — the full first-run sequence: the walkthrough
// slides, then the one-time plans takeover (the offer lands while
// the user is still in first-run mode), then a REQUIRED pet-pick
// step ("every explorer needs a companion") and its send-off.
// Users who already have a pet (e.g. chose one in Settings before
// a reset) skip the pick and leave as soon as plans are handled.
// ============================================================

import { useState } from "react";
import { TutorialGuide } from "./TutorialGuide";
import { PetPickStep } from "./PetPickStep";
import { PetCelebrate } from "./PetCelebrate";
import { PlanIntro } from "./PlanIntro";
import { storage } from "@/lib/storage";
import { petById } from "@/lib/pets";

export function TutorialFlow({ onComplete }: { onComplete: () => void }) {
  const [walkDone, setWalkDone] = useState(false);
  const [plansDone, setPlansDone] = useState(false);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);

  // Pet chosen → the send-off: companion + copy, no fireworks.
  if (picked) {
    return <PetCelebrate petId={picked.id} displayName={picked.name} onEnter={onComplete} />;
  }

  // Plans BEFORE the pet pick. PlanIntro self-completes instantly when the
  // plans were already seen, so this step can never stall the flow.
  if (walkDone && !plansDone) {
    return (
      <PlanIntro
        onDone={() => {
          // Users who already own a pet skip the pick entirely.
          if (storage.getData().profile?.pet) {
            onComplete();
            return;
          }
          setPlansDone(true);
        }}
      />
    );
  }

  // Pet pick — mandatory for everyone else.
  if (walkDone) {
    return (
      <PetPickStep
        onDone={(id) => {
          const profile = storage.getData().profile;
          setPicked({
            id,
            name: (profile?.petName || "").trim() || petById(id)?.name || "",
          });
        }}
      />
    );
  }

  // The walkthrough comes first.
  return <TutorialGuide onComplete={() => setWalkDone(true)} />;
}
