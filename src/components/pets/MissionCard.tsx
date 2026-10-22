"use client";

import type { AIMessage } from "@/types";

export const MISSION_KIND_LABEL: Record<string, string> = {
  research: "Read-only research",
  files: "Writes a real file",
  organize: "Creates workspace items",
};

/**
 * A pet's mission plan. Confirm-first: approving is the ONLY thing that
 * puts a mission in the runner's queue; cancelling leaves zero side effects.
 * Shared by the Noor thread and the Pets-page chat so both surfaces can
 * approve the same mission.
 */
export function MissionCard({
  msg,
  onApprove,
  onCancel,
  compact = false,
}: {
  msg: AIMessage;
  onApprove: () => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  const m = msg.mission;
  if (!m) return null;
  if (msg.missionResolved) {
    const approved = msg.missionResolved === "approved";
    return (
      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className={approved ? "text-emerald-500" : ""}>{approved ? "\u2713" : "\u2715"}</span>
        {approved ? "Approved" : "Cancelled"} · {m.title.slice(0, 48)}
      </div>
    );
  }
  return (
    <div
      className={
        compact
          ? "mt-1.5 rounded-2xl border border-border bg-card/90 p-3"
          : "mt-3 rounded-2xl border border-border bg-card/80 p-3"
      }
    >
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60">
        {m.agentName} has a plan · {MISSION_KIND_LABEL[m.kind] || m.kind}
      </p>
      <p className="mt-1 text-sm font-medium">{m.title}</p>
      <ol className="mt-2 space-y-1">
        {m.steps.map((s, i) => (
          <li key={i} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
            <span className="shrink-0 text-muted-foreground/50">{i + 1}.</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <div className="mt-2.5 flex gap-2">
        <button
          onClick={onApprove}
          className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background transition-all hover:opacity-90 active:scale-95"
        >
          Approve &amp; run
        </button>
        <button
          onClick={onCancel}
          className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground/50">
        Nothing runs until you approve. Your AI usage counts once the mission starts.
      </p>
    </div>
  );
}
