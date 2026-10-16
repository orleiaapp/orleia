"use client";

// ============================================================
// TutorialFlow — the full first-run sequence: the walkthrough
// slides, then a REQUIRED pet-pick step ("every explorer needs a
// companion"), the confetti send-off, and the one-time plans
// takeover IMMEDIATELY after the confetti — celebration flows
// straight into the offer with no app flash in between. Users who
// already have a pet (e.g. chose one in Settings before a reset)
// skip the pick; plans still get their moment via ClientLayout.
// ============================================================

import { useState } from "react";
import { TutorialGuide } from "./TutorialGuide";
import { PetPickStep } from "./PetPickStep";
import { PetCelebrate } from "./PetCelebrate";
import { PlanIntro } from "./PlanIntro";
import { storage } from "@/lib/storage";
import { petById } from "@/lib/pets";

export function TutorialFlow({ onComplete }: { onComplete: () => void }) {
  const [pickingPet, setPickingPet] = useState(false);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [showPlans, setShowPlans] = useState(false);

  // After the pet is chosen: a confetti send-off, then the plans takeover
  // back-to-back. PlanIntro dismisses into onComplete, ending the tutorial
  // (and it self-completes immediately if the plans were already seen).
  if (picked) {
    if (showPlans) {
      return <PlanIntro onDone={onComplete} />;
    }
    return (
      <PetCelebrate
        petId={picked.id}
        displayName={picked.name}
        onEnter={() => setShowPlans(true)}
      />
    );
  }

  if (pickingPet) {
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

  return (
    <TutorialGuide
      onComplete={() => {
        // Walkthrough finished (or skipped) — the pet step is mandatory.
        if (storage.getData().profile?.pet) {
          onComplete();
          return;
        }
        setPickingPet(true);
      }}
    />
  );
}
