"use client";

// ============================================================
// AgeGate — one-time 13+ self-declaration before the workspace.
// Orleia is anonymous and local-first, so we deliberately do NOT
// collect birthdates or IDs (data-minimization for minors). The
// declaration is stored in localStorage only, which also keeps
// the gate resilient: it re-asks if storage is unavailable.
// Shown for first-launch users BEFORE onboarding can begin.
// ============================================================

import { useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { storage } from "@/lib/storage";
import { EASE_OUT } from "@/lib/utils";

export function AgeGate({ onConfirmed }: { onConfirmed: () => void }) {
  const [error, setError] = useState(false);

  const decline = () => {
    setError(true);
  };

  const confirm = () => {
    storage.markAgeConfirmed();
    onConfirmed();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm"
      >
        <ShieldCheck className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold tracking-tight">Before you start</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Orleia is intended for people aged <span className="font-semibold text-foreground">13 and over</span>. Please
          confirm you meet this age requirement to continue.
        </p>

        {error && (
          <p className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-xs text-amber-600 dark:text-amber-400">
            Thanks for your honesty — Orleia isn&apos;t available for you yet. You can close this page and come back
            when you&apos;re older.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            onClick={confirm}
            className="rounded-xl border border-border py-3 text-sm font-medium transition-colors hover:border-foreground/50"
          >
            I&apos;m 13 or older — continue
          </button>
          <button
            onClick={decline}
            className="py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            I&apos;m under 13
          </button>
        </div>

        <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground/70">
          This answer stays on your device — Orleia never asks for your birthdate.
        </p>
      </motion.div>
    </div>
  );
}
