"use client";

// ============================================================
// TutorialFlow — the full first-run sequence: the walkthrough
// slides, then a REQUIRED pet-pick step ("every explorer needs a
// companion"). Users who already have a pet (e.g. chose one in
// Settings before a reset) skip the pick.
// ============================================================

import { useState } from "react";
import { TutorialGuide } from "./TutorialGuide";
import { PetPickStep } from "./PetPickStep";
import { PetCelebrate } from "./PetCelebrate";
import { storage } from "@/lib/storage";
import { petById } from "@/lib/pets";

export function TutorialFlow({ onComplete }: { onComplete: () => void }) {
  const [pickingPet, setPickingPet] = useState(false);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);

  // After the pet is chosen: a confetti send-off that tells the user to go
  // look around Orleia. Only shown for an ACTUAL pick (returning users who
  // already own a pet skip the step entirely and never see it).
  if (picked) {
    return <PetCelebrate petId={picked.id} displayName={picked.name} onEnter={onComplete} />;
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
