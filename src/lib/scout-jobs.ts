"use client";

// ============================================================
// Pet missions — what pets do that Noor doesn't.
//
// Noor answers when asked. A hired pet is HANDED a mission and works it
// autonomously on the agent loop (plan → web_search → read_url →
// workspace_* → deliver), multi-turn, without burning a chat message per
// internal step.
//
// Confirm-first, by design (owner instruction 2026-10):
//   assign → the pet posts a PLAN in its thread and waits
//   approve → the mission becomes runnable
//   run → the agent loop executes it for real
//   deliver → in-character summary + a note + a WORKING receipt
// Nothing with a side effect (a written file, a new task, a calendar
// event) happens before the user taps Approve.
//
// Three mission kinds, chosen from the wording of the request:
//   research  read-only: web + pages → cited note (the original Scout job)
//   files     writes a real deliverable into the granted device folder
//   organize  creates real workspace items: tasks, events, a note
//
// Cap-safety: runAgentLoop can throw NoorCapError. We never leave a
// mission stuck: on cap/error it goes back to pending, the thread gets an
// honest message, and retry is user-initiated (Run now) — no silent
// free-looping, no wasted credits.
// ============================================================

import type { AIMessage, AIModel, AISource, PetMissionKind, PetReceipt, ScoutJob } from "@/types";
import { storage } from "./storage";
import { generateId } from "./utils";
import { NoorCapError } from "./noor-cap";
import { runAgentLoop } from "./agent-loop";
import { MODEL_PROFILES, DEFAULT_MODEL } from "./ai-models";
import { roster, workingReceipt, recordWork } from "./pet-agent";
import { describeWorkspace, getGrantedDirName, isWorkspaceActive } from "./agent-device";

const MAX_ACTIVE = 4;

// ---------------- Store helpers ----------------

function jobsFromState(): ScoutJob[] {
  const state = (storage.getData() as any).petAgents;
  const jobs = state?.scoutJobs;
  return Array.isArray(jobs) ? jobs : [];
}

function saveJobs(jobs: ScoutJob[]): void {
  const d = storage.getData() as any;
  const state = d.petAgents;
  if (!state) return;
  state.scoutJobs = jobs;
  storage.saveData();
}

export function scoutJobs(agentId?: string): ScoutJob[] {
  const jobs = jobsFromState();
  return agentId ? jobs.filter((j) => j.agentId === agentId) : jobs;
}

export function pendingScoutJob(agentId?: string): ScoutJob | undefined {
  return scoutJobs(agentId).find((j) => j.status === "pending");
}

export function activeScoutJobs(): ScoutJob[] {
  return scoutJobs().filter(
    (j) => j.status === "awaiting_approval" || j.status === "pending" || j.status === "running"
  );
}

// ---------------- Mission planning ----------------

/**
 * Decide what kind of mission this is from the goal's wording. This is
 * deliberately deterministic: the approval card must appear instantly and
 * cost nothing, and the plan must never be a model hallucination the user
 * is asked to rubber-stamp.
 */
const FILES_RE =
  /\b(write|save|export|create|make|draft|generate|download)\b[\s\S]{0,60}\b(file|folder|pdf|docx|csv|txt|markdown|spreadsheet|deck)\b|\b(my (?:computer|device|laptop|desktop|folder|files)|on (?:my )?(?:disk|hard drive)|to my folder|in my folder)\b/i;
const ORGANIZE_RE =
  /\b(schedule|calendar|remind(?:er)?|book (?:a|an|the)|meeting|appointment|time-?block|to-?do|task list|plan my (?:day|week|month)|organi[sz]e my)\b/i;

export interface MissionPlan {
  kind: PetMissionKind;
  steps: string[];
}

function shortTopic(topic: string, max = 70): string {
  const t = topic.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

export function planMission(topic: string): MissionPlan {
  if (FILES_RE.test(topic)) {
    const folder = getGrantedDirName();
    return {
      kind: "files",
      steps: [
        "Research and draft the deliverable in full",
        folder
          ? `Write it as a real file inside “${folder}”`
          : "Write it as a real file in your granted folder (you'll pick one)",
        "Leave a note here pointing at the file",
      ],
    };
  }
  if (ORGANIZE_RE.test(topic)) {
    return {
      kind: "organize",
      steps: [
        "Work out the exact items — titles, dates and times — from your request",
        "Create them in your workspace: tasks, calendar events or a note",
        "Report back with exactly what was created",
      ],
    };
  }
  return {
    kind: "research",
    steps: [
      `Search the web for current, credible sources on “${shortTopic(topic, 50)}”`,
      "Read the most relevant pages in full",
      "Write a cited brief and deliver it as a note in this thread",
    ],
  };
}

// ---------------- Receipts ----------------

function pushJobReceipt(agentId: string, kind: PetReceipt["kind"], summary: string): void {
  const agent = roster().find((a) => a.id === agentId) || null;
  const r: PetReceipt = {
    id: generateId(),
    agentId,
    role: agent?.role || "scout",
    kind,
    summary,
    createdAt: new Date().toISOString(),
  };
  try {
    workingReceipt(r);
  } catch {
    /* receipts are best-effort */
  }
}

// ---------------- Assign ----------------

export type AssignResult =
  | { ok: true; job: ScoutJob }
  | { ok: false; reason: "empty" | "limit" };

/** Assign a mission: it is staged for approval; nothing runs yet. */
export function assignScoutJob(agentId: string, topic: string, convId: string): AssignResult {
  const t = topic.trim();
  if (!t) return { ok: false, reason: "empty" };
  if (activeScoutJobs().length >= MAX_ACTIVE) return { ok: false, reason: "limit" };
  const plan = planMission(t);
  const job: ScoutJob = {
    id: generateId(),
    agentId,
    topic: t.slice(0, 500),
    status: "awaiting_approval",
    kind: plan.kind,
    plan: plan.steps,
    convId,
    createdAt: new Date().toISOString(),
  };
  const jobs = jobsFromState();
  jobs.push(job);
  // Keep the ledger bounded: finished history is trimmed to the last 10.
  const done = jobs.filter(
    (j) => j.status === "done" || j.status === "failed" || j.status === "cancelled"
  );
  const keep = new Set(done.slice(-10).map((j) => j.id));
  saveJobs([...jobs.filter((j) => !done.includes(j) || keep.has(j.id))]);
  pushJobReceipt(agentId, "proposed", `Planned a mission: “${shortTopic(t, 60)}”`);
  return { ok: true, job };
}

/**
 * Post the approval card into the mission's thread. Callers invoke this
 * AFTER the user's own message is stored, so the plan always follows the
 * request instead of jumping above it.
 */
export function postMissionPlan(job: ScoutJob): void {
  const agent = roster().find((a) => a.id === job.agentId);
  const conv = storage.getData().aiConversations.find((c) => c.id === job.convId);
  if (!conv) return;
  const msg: AIMessage = {
    id: generateId(),
    role: "assistant",
    content: "I've got a plan for this. Nothing runs until you approve it.",
    timestamp: new Date().toISOString(),
    model: safeModel(storage.getData().selectedModel),
    agentId: job.agentId,
    mission: {
      jobId: job.id,
      agentName: agent?.name || "Scout",
      title: job.topic,
      steps: job.plan || planMission(job.topic).steps,
      kind: job.kind || "research",
    },
  };
  storage.addMessage(job.convId, msg);
  // Live sync: an open thread picks the card up without a reload.
  try {
    window.dispatchEvent(
      new CustomEvent("orleia:noor-bg", {
        detail: { type: "done", convId: job.convId, preview: "plan ready" },
      })
    );
  } catch {
    /* non-browser */
  }
}

// ---------------- Approve / cancel ----------------

export function approveScoutJob(id: string): boolean {
  const job = jobsFromState().find((j) => j.id === id);
  if (!job || job.status !== "awaiting_approval") return false;
  updateScoutJob(id, { status: "pending", decidedAt: new Date().toISOString() });
  pushJobReceipt(job.agentId, "accepted", `Approved the mission “${shortTopic(job.topic, 60)}”`);
  return true;
}

export function cancelScoutJob(id: string): boolean {
  const job = jobsFromState().find((j) => j.id === id);
  if (!job || job.status !== "awaiting_approval") return false;
  updateScoutJob(id, {
    status: "cancelled",
    decidedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  });
  pushJobReceipt(job.agentId, "dismissed", `Cancelled the mission “${shortTopic(job.topic, 60)}”`);
  return true;
}

export function updateScoutJob(id: string, patch: Partial<ScoutJob>): ScoutJob | undefined {
  const jobs = jobsFromState();
  const job = jobs.find((j) => j.id === id);
  if (!job) return undefined;
  Object.assign(job, patch);
  saveJobs(jobs);
  return job;
}

// ---------------- Run ----------------

export interface ScoutRunOpts {
  onStatus?: (s: string) => void;
}

function safeModel(stored?: string): AIModel {
  return stored && stored in MODEL_PROFILES ? (stored as AIModel) : DEFAULT_MODEL;
}

function missionContext(job: ScoutJob, agentName: string, folderName: string | null): string {
  const kind = job.kind || "research";
  const plan = (job.plan || [])
    .map((s, i) => `${i + 1}. ${s}`)
    .join("\n");
  const header =
    `You are ${agentName}, a hired agent inside Orleia (a local-first productivity app). ` +
    `This is a background mission the user assigned and then APPROVED.\n\nAPPROVED PLAN:\n${plan}\n\n` +
    `Execute the plan. Keep the final summary tight and skimmable. `;

  if (kind === "files") {
    return (
      header +
      `You are allowed to write REAL files on the user's device. Use ` +
      `ORLEIA_TOOL {"action":"workspace_list"} first to see the granted folder, then ` +
      `ORLEIA_TOOL {"action":"workspace_write","params":{"path":"<name>.md","content":"..."}} ` +
      `to create the finished deliverable. Plain-text formats only (md, txt, csv, json, html). ` +
      (folderName
        ? `The folder is “${folderName}”. `
        : `No folder is connected right now — say so plainly and deliver the full text as a note instead. `) +
      `Write the COMPLETE deliverable, not an outline. Never touch files unrelated to this mission and never delete anything.`
    );
  }
  if (kind === "organize") {
    return (
      header +
      `You are allowed to create REAL workspace items. Emit ORLEIA_ACTION lines — ` +
      `{"action":"create_task","params":{...}}, {"action":"create_event","params":{...}} or ` +
      `{"action":"create_note","params":{...}} — for exactly the items the user asked for, with real dates and times. ` +
      `Never delete or rewrite anything that already exists, never create duplicates (check the workspace stats in your context first), ` +
      `and finish by listing what you created.`
    );
  }
  return (
    header +
    `Prefer web_search + read_url for facts. Your deliverable is the text summary you finish with; ` +
    `do NOT change the user's tasks, notes, habits or calendar on a research mission.`
  );
}

/** First line of a delivery doubles as the note title. */
function deliveryTitle(text: string): string {
  const first = text.split("\n").find((l) => l.trim()) || "";
  return (
    first
      .replace(/^[#*\-\s]+/, "")
      .replace(/\*\*/g, "")
      .slice(0, 80) || "Mission findings"
  );
}

const DELIVERY_LEAD: Record<PetMissionKind, string> = {
  research: "🔔 Job's done — here's what I dug up on",
  files: "📁 Mission complete — the deliverable is in your folder. Here's the summary of",
  organize: "✅ Done — the items are in your workspace. Here's what I set up from",
};

async function deliver(
  job: ScoutJob,
  text: string,
  sources: AISource[],
  /** files kind only: did the folder actually change during the run? */
  fileState: "written" | "missing" | null = null
): Promise<void> {
  const kind = job.kind || "research";
  // The user's own words are the best headline — plan lines from the
  // agent loop make lousy note titles.
  const title = job.topic.replace(/\s+/g, " ").slice(0, 80) || deliveryTitle(text);
  // 1. In-character delivery message in the pet's chat thread.
  const conv = storage.getData().aiConversations.find((c) => c.id === job.convId);
  const model = safeModel(storage.getData().selectedModel);
  if (conv) {
    const lead =
      kind === "files" && fileState === "missing"
        ? "📝 I couldn't confirm a file landed in your folder — the full deliverable is saved as a note. Here's the summary of"
        : DELIVERY_LEAD[kind];
    storage.addMessage(job.convId, {
      role: "assistant",
      content: `${lead} “${title}”:\n\n${text}`,
      model,
      sources: sources.length ? sources : undefined,
    });
  }
  // 2. A real note, so the work outlives the chat thread.
  try {
    storage.createNote({
      title: `Mission Findings — ${title}`,
      content:
        `Mission: ${job.topic}\nKind: ${kind}\nDelivered: ${new Date().toLocaleString()}\n\n${text}`,
      contentHtml: "",
      folderId: null,
      projectId: null,
      tags: ["pets", "mission"],
      pinned: false,
      archived: false,
      favorite: false,
    });
  } catch {
    /* notes are best-effort */
  }
  // 3. Receipt + trust (a finished mission is a working pet).
  updateScoutJob(job.id, {
    status: "done",
    finishedAt: new Date().toISOString(),
    resultTitle: title,
  });
  const summary =
    kind === "files"
      ? fileState === "written"
        ? `Delivered “${title}” as a file in the workspace folder`
        : `Delivered “${title}” as a note (no file landed)`
      : kind === "organize"
        ? `Set up “${title}” in the workspace`
        : `Delivered the research note “${title}”`;
  pushJobReceipt(job.agentId, "accepted", summary);
  // 4. If the pet's thread is open, sync it live so the delivery appears
  //    without a reload (same channel askNoorAnywhere uses).
  try {
    window.dispatchEvent(
      new CustomEvent("orleia:noor-bg", { detail: { type: "done", convId: job.convId, preview: title } })
    );
  } catch {
    /* non-browser */
  }
}

/** Run the OLDEST approved mission (any agent). Returns the job, or null if none. */
export async function runPendingScoutJob(opts: ScoutRunOpts = {}): Promise<ScoutJob | null> {
  if (scoutJobs().some((j) => j.status === "running")) return null; // one at a time
  const job = jobsFromState()
    .filter((j) => j.status === "pending")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!job) return null;

  const agent = roster().find((a) => a.id === job.agentId);
  if (!agent) {
    updateScoutJob(job.id, {
      status: "failed",
      error: "Agent released",
      finishedAt: new Date().toISOString(),
    });
    return job;
  }

  updateScoutJob(job.id, { status: "running" });
  opts.onStatus?.(`🔭 ${agent.name} is on the job…`);
  // 24/7 log: the agent's last-active stamp moves the moment it picks up an
  // approved mission (night work counts as work, employees don't sleep).
  recordWork(agent.id, `Picked up mission: ${job.topic.slice(0, 60)}`, 0, { silent: true });

  const model = safeModel(storage.getData().selectedModel);
  const history = (
    storage.getData().aiConversations.find((c) => c.id === job.convId)?.messages ?? []
  ) as never[];
  const sources: AISource[] = [];
  const folderName = (await isWorkspaceActive().catch(() => false)) ? getGrantedDirName() : null;
  // Snapshot the folder so a "files" mission can report the truth instead of
  // trusting the model's claim that it wrote something.
  const folderBefore =
    job.kind === "files" && folderName ? await describeWorkspace().catch(() => null) : null;

  try {
    const out = await runAgentLoop(
      `MISSION: ${job.topic}`,
      history as never,
      model,
      { onToken: () => {}, sources },
      missionContext(job, agent.name, folderName)
    );
    const text = (out || "").trim();
    if (!text) throw new Error("empty result");
    const folderAfter =
      job.kind === "files" && folderName ? await describeWorkspace().catch(() => null) : null;
    // No folder connected still reports "missing": the delivery must never
    // claim a file exists when nothing was written.
    const fileState: "written" | "missing" | null =
      job.kind !== "files"
        ? null
        : folderName && folderAfter && folderBefore && folderAfter !== folderBefore
          ? "written"
          : "missing";
    await deliver(job, text, sources, fileState);
    opts.onStatus?.(`✅ ${agent.name} delivered the mission.`);
  } catch (e) {
    const cap = e instanceof NoorCapError;
    // Cap/error: back to pending, honest message, user retries via Run now.
    updateScoutJob(job.id, { status: "pending", error: cap ? "daily cap" : "failed" });
    const conv = storage.getData().aiConversations.find((c) => c.id === job.convId);
    if (conv) {
      storage.addMessage(job.convId, {
        role: "assistant",
        content: cap
          ? `😵 Hit the daily message cap mid-mission on “${job.topic}”. The mission is safe and queued — tap Run now (or come back tomorrow) and I'll pick it up.`
          : `😈 I stumbled mid-mission on “${job.topic}” (model hiccup). It's re-queued — try Run now in a moment.`,
        model: safeModel(storage.getData().selectedModel),
      });
      try {
        window.dispatchEvent(
          new CustomEvent("orleia:noor-bg", {
            detail: { type: "done", convId: job.convId, preview: "mission re-queued" },
          })
        );
      } catch {
        /* non-browser */
      }
    }
    opts.onStatus?.(cap ? "Mission re-queued — daily cap reached." : "Mission re-queued — model hiccup.");
  }
  return job;
}

// ---------------- Runner wiring ----------------

const RUNNER = "orleia:scout-runner";

/** Fire the runner; it no-ops if nothing is approved or one is running. */
export function kickScoutRunner(): void {
  try {
    window.dispatchEvent(new CustomEvent(RUNNER));
  } catch {
    /* non-browser */
  }
}

/** Idempotent; call once from the pets page (or any pet surface). */
export function ensureScoutRunner(): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => {
    void runPendingScoutJob().catch(() => {});
  };
  window.addEventListener(RUNNER, handler);
  return () => window.removeEventListener(RUNNER, handler);
}
