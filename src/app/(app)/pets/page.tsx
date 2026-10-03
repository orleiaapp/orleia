"use client";

// ============================================================
// Pets — the agent roster + job catalog.
//
// Kept deliberately plain: no entrance animations, short copy.
// Agents are 24/7 employees (work timed rounds, log shifts);
// everything they change is confirm-first. Hiring is the paid
// feature (slots via billing tier).
// ============================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PawPrint, Plus, Check, X, Clock, ShieldCheck, Lock, ChevronRight, MessageSquare, Send, Play } from "lucide-react";
import { storage } from "@/lib/storage";
import { useHydrated } from "@/lib/use-hydrated";
import { useI18n } from "@/lib/i18n";
import { formatRelative, cn } from "@/lib/utils";
import { PetChat } from "@/components/pets/pet-chat";
import { PETS, petById, petSvg } from "@/lib/pets";
import { PET_JOBS, type JobDef } from "@/lib/pet-jobs";
import {
  hireAgent,
  releaseAgent,
  roster,
  receipts,
  slotStatus,
  runRoleNow,
  ensurePetConversation,
  isQuietHours,
  type HireResult,
  type SlotStatus,
} from "@/lib/pet-agent";
import {
  assignScoutJob,
  scoutJobs,
  kickScoutRunner,
  ensureScoutRunner,
} from "@/lib/scout-jobs";
import type { PetAgent, PetReceipt } from "@/types";

export default function PetsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const hydrated = useHydrated();
  const [agents, setAgents] = useState<PetAgent[]>([]);
  const [logs, setLogs] = useState<PetReceipt[]>([]);
  const [slots, setSlots] = useState<SlotStatus | null>(null);
  const [hiring, setHiring] = useState<JobDef | null>(null); // job awaiting pet pick
  const [pickPet, setPickPet] = useState<string>("");
  const [notice, setNotice] = useState<string>("");
  const [busy, setBusy] = useState(false);
  // Tabs: team roster vs WhatsApp-style agent chat.
  const [tab, setTab] = useState<"team" | "chat">("team");
  // Assign-a-job (Scout): dialog state + a tick to refresh live job chips.
  const [assignFor, setAssignFor] = useState<PetAgent | null>(null);
  const [jobTopic, setJobTopic] = useState("");
  const [, setJobsTick] = useState(0);

  const refresh = () => {
    setAgents([...roster()]);
    setLogs([...receipts()]);
  };

  useEffect(() => {
    if (!hydrated) return;
    refresh();
    slotStatus().then(setSlots).catch(() => {});
    // Job runner + live status ticks (queued → working → done).
    const stopRunner = ensureScoutRunner();
    const tick = window.setInterval(() => setJobsTick((n) => n + 1), 3000);
    return () => {
      stopRunner();
      window.clearInterval(tick);
    };
  }, [hydrated]);

  const petId = (storage.getData() as any).profile?.pet || "";
  const cosmetic = petById(petId);

  const startHire = (job: JobDef) => {
    setNotice("");
    setPickPet(petId || PETS[0]?.id || "");
    setHiring(job);
  };

  const confirmHire = async () => {
    if (!hiring || !pickPet || busy) return;
    setBusy(true);
    try {
      const res: HireResult = await hireAgent(pickPet, hiring.role);
      if (res.ok) {
        setHiring(null);
        refresh();
        slotStatus().then(setSlots).catch(() => {});
        setNotice(t("pets.hired", "Hired! Your agent is on duty."));
      } else if (res.reason === "slots") {
        setNotice(t("pets.needPlan", "Your plan's agent slots are full — upgrade to hire more pets."));
      } else if (res.reason === "taken") {
        setNotice(t("pets.roleTaken", "You already hired a pet for this job."));
      } else if (res.reason === "duplicate_pet") {
        setNotice(t("pets.petBusy", "That pet already has a job."));
      } else {
        setNotice(t("pets.notHireable", "This job isn't hiring yet."));
      }
    } finally {
      setBusy(false);
    }
  };

  const onRelease = (agentId: string) => {
    releaseAgent(agentId);
    refresh();
    slotStatus().then(setSlots).catch(() => {});
  };

  // Scout: open the assign-job dialog. Other roles: fire their evaluator
  // right now (proposal pops via PetReactions, wherever the user is).
  const runNow = (a: PetAgent) => {
    if (a.role === "scout") {
      setJobTopic("");
      setAssignFor(a);
      return;
    }
    const ok = runRoleNow(a.id);
    if (!ok) {
      setNotice(
        t("pets.nothingToRun", "Nothing to run right now — {pet} speaks up automatically when there's something.").replace("{pet}", a.name)
      );
    }
  };

  const submitAssign = () => {
    if (!assignFor) return;
    const topic = jobTopic.trim();
    if (!topic) return;
    const res = assignScoutJob(assignFor.id, topic, ensurePetConversation(assignFor));
    if (!res.ok) {
      setNotice(
        res.reason === "limit"
          ? t("pets.jobLimit", "Scout already has a job queued — let it finish first.")
          : t("pets.jobEmpty", "Describe the job first.")
      );
      return;
    }
    setAssignFor(null);
    setJobTopic("");
    refresh();
    setNotice(
      t("pets.jobAssigned", "Job assigned — findings will land in {pet}'s thread and your notes.").replace("{pet}", assignFor.name)
    );
    kickScoutRunner();
  };

  if (!hydrated) return <div className="min-h-screen" />;

  const used = agents.length;
  const max = slots?.slots ?? 0;
  const quiet = isQuietHours();

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-foreground">
          <PawPrint className="h-7 w-7 text-primary-500" />
          {t("pets.title", "Pets")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("pets.subtitleShort", "Hire agents that work around the clock. They propose — you confirm.")}
        </p>
      </div>

      {/* Tabs: team roster vs chat */}
      <div className="flex gap-1 rounded-xl bg-secondary/60 p-1">
        <button
          onClick={() => setTab("team")}
          className={cn(
            "flex-1 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors",
            tab === "team" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t("pets.tabTeam", "Team")}
        </button>
        <button
          onClick={() => setTab("chat")}
          className={cn(
            "flex-1 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors",
            tab === "chat" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t("pets.tabChat", "Chat")}
        </button>
      </div>

      {tab === "chat" ? (
        <PetChat agents={agents} onChanged={refresh} />
      ) : (
        <>
      {/* Cosmetic pet nudge: pick a companion first */}
      {!cosmetic && (
        <div className="card flex items-center gap-3 p-4">
          <PawPrint className="h-5 w-5 shrink-0 text-primary-500" />
          <p className="text-sm text-muted-foreground">
            {t("pets.noPetYet", "Pick a companion on the Habits page first — it becomes the face of your agents.")}
          </p>
        </div>
      )}

      {/* Slots */}
      {slots && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary-500" />
          <span>
            {t("pets.slots", "{{used}} of {{max}} agent slots used")
              .replace("{{used}}", String(used))
              .replace("{{max}}", String(max))}
            {" · "}
            <span className="capitalize">{slots.tier.tier}</span>
          </span>
        </div>
      )}

      {notice && (
        <div className="card border-primary-500/30 bg-primary-500/5 p-3 text-sm text-foreground">{notice}</div>
      )}

      {/* Roster */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("pets.roster", "On duty")}
        </h2>
        {agents.length === 0 ? (
          <div className="card flex items-center gap-3 p-4 text-sm text-muted-foreground">
            <PawPrint className="h-5 w-5 shrink-0 opacity-60" />
            {t("pets.rosterEmpty", "No agents hired yet. Pick a job from the catalog below.")}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {agents.map((agent) => {
              const job = PET_JOBS.find((j) => j.role === agent.role);
              const pet = petById(agent.petId);
              const activeJob =
                agent.role === "scout"
                  ? scoutJobs(agent.id).find((j) => j.status === "pending" || j.status === "running")
                  : undefined;
              return (
                <div key={agent.id} className="card p-4">
                  <div className="flex items-center gap-3">
                    {pet && (
                      <span className="h-9 w-9 shrink-0" dangerouslySetInnerHTML={{ __html: petSvg(pet, "h-full w-full") }} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">
                        <span style={{ color: job?.color }}>{job?.icon}</span>{" "}
                        {t(`petjob.${agent.role}.name`, job?.name || agent.role)}
                      </p>
                    </div>
                    <button
                      onClick={() => runNow(agent)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
                      title={
                        agent.role === "scout"
                          ? t("pets.assignHint", "Assign Scout a web research job")
                          : t("pets.runNowHint", "Run this agent's job right now")
                      }
                    >
                      {agent.role === "scout" ? <Send className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      {agent.role === "scout" ? t("pets.assign", "Job") : t("pets.runNow", "Run")}
                    </button>
                    <button
                      onClick={() => router.push(`/noor?pet=${agent.id}`)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
                      title={t("pets.chatHint", "Chat with your agent")}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      {t("pets.chat", "Chat")}
                    </button>
                    <button
                      onClick={() => onRelease(agent.id)}
                      className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-sidebar-hover hover:text-foreground"
                      aria-label={t("pets.release", "Release")}
                      title={t("pets.release", "Release")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {activeJob && (
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{activeJob.status === "running" ? "🔭" : "⏳"}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {activeJob.status === "running"
                          ? t("pets.jobWorking", "Working on:")
                          : t("pets.jobQueued", "Queued:")}{" "}
                        <span className="font-medium text-foreground">{activeJob.topic}</span>
                      </span>
                    </div>
                  )}
                  {/* 24/7 status: last shift + trust, one plain line. */}
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className={quiet ? "h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" : "h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"} />
                    <span>
                      {agent.lastActiveAt
                        ? t("petagent.lastActive", "Last active") + " " + formatRelative(agent.lastActiveAt)
                        : t("petagent.lastActiveNever", "Starting first shift…")}
                    </span>
                    <span className="ml-auto">
                      {t("pets.trust", "Trust")} {agent.trust}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Job catalog */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("pets.catalog", "Job catalog")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {PET_JOBS.map((job) => {
            const hired = agents.some((a) => a.role === job.role);
            const slotsFull = slots ? used >= max : false;
            return (
              <div key={job.role} className="card p-4">
                <div className="flex items-center gap-3">
                  <span className="text-xl leading-none">{job.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {t(`petjob.${job.role}.name`, job.name)}
                      {job.soon && (
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {t("pets.soon", "Soon")}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{t(`petjob.${job.role}.tagline`, job.tagline)}</p>
                  </div>
                  {hired ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary-500">
                      <Check className="h-3.5 w-3.5" /> {t("pets.hiredOnDuty", "On duty")}
                    </span>
                  ) : job.hireable ? (
                    <button
                      onClick={() => startHire(job)}
                      disabled={busy}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {slotsFull ? <Lock className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      {slotsFull ? t("pets.upgradeToHire", "Unlock") : t("pets.hire", "Hire")}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground/70">
                      <Clock className="h-3.5 w-3.5" /> {t("pets.comingSoon", "Soon")}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Receipts */}
      {logs.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("pets.receipts", "Activity")}
          </h2>
          <div className="card divide-y divide-border">
            {logs.slice(0, 8).map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                <span className="w-14 shrink-0 text-muted-foreground/70">
                  {new Date(r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="min-w-0 flex-1 text-foreground">{r.summary}</span>
              </div>
            ))}
          </div>
        </section>
      )}
        </>
      )}

      {/* Assign-a-job dialog (Scout) */}
      {assignFor && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setAssignFor(null)}
        >
          <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground">{t("pets.assignTitle", "Assign a job")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(
                "pets.assignSubtitle",
                "{pet} will search the web and deliver a findings note — no Noor messages spent."
              ).replace("{pet}", assignFor.name)}
            </p>
            <textarea
              value={jobTopic}
              onChange={(e) => setJobTopic(e.target.value)}
              rows={3}
              autoFocus
              placeholder={t(
                "pets.assignPlaceholder",
                "e.g. \"Find the 3 best-rated budget electric bikes in the EU under €1,500, with prices\""
              )}
              className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary-500/50 focus:outline-none"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={submitAssign}
                disabled={!jobTopic.trim()}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" /> {t("pets.assignSend", "Send to work")}
              </button>
              <button
                onClick={() => setAssignFor(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-hover"
              >
                {t("common.cancel", "Cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hire dialog: pick which pet wears the badge */}
      {hiring && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => !busy && setHiring(null)}
        >
          <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground">{t("pets.pickAgent", "Who takes this job?")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(`petjob.${hiring.role}.name`, hiring.name)} — {t(`petjob.${hiring.role}.tagline`, hiring.tagline)}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {PETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPickPet(p.id)}
                  aria-pressed={pickPet === p.id}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-colors ${
                    pickPet === p.id ? "border-primary-500 bg-primary-500/10" : "border-border hover:bg-sidebar-hover"
                  }`}
                >
                  <span className="h-10 w-10" dangerouslySetInnerHTML={{ __html: petSvg(p, "h-full w-full") }} />
                  <span className="text-[11px] font-medium text-foreground">
                    {(storage.getData() as any).profile?.petName?.trim() && petId === p.id
                      ? (storage.getData() as any).profile.petName.trim()
                      : p.name}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={confirmHire}
                disabled={busy}
                className="flex-1 rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {t("pets.confirmHire", "Hire")}
              </button>
              <button
                onClick={() => setHiring(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-hover"
              >
                {t("common.cancel", "Cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
