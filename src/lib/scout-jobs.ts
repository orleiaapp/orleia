"use client";

// ============================================================
// Scout jobs — the second thing pets do that Noor doesn't.
//
// Noor answers when asked. Scout is HANDED a job and works it
// autonomously on the Noor agent loop (plan → web_search →
// read_url → deliver), multi-turn — without burning Noor chat
// messages (the loop's internal turns bypass the daily message
// cap; one job = one spend, not five).
//
// Dispatch model (client-first, local-first):
//   1. assignScoutJob()     — enqueue a pending job (cheap, instant)
//   2. runPendingScoutJob() — runs the OLDEST pending job on
//      runAgentLoop, streaming into the pet's thread
//   3. delivery             — an in-character summary in the thread +
//      a "Scout Findings" note + a WORKING receipt ("Delivered the
//      research note '<title>'") — trust +1.
//
// Cap-safety: runAgentLoop can throw NoorCapError. We never leave
// the job stuck: on cap/error the job goes back to pending, the
// thread gets an honest message, and retry is user-initiated
// (Run now) — no silent free-looping, no wasted credits.
//
// Active-jobs limit: 1 concurrent + up to 3 queued. Keeps spend
// sane and makes "Scout is working" legible.
// ============================================================

import type { AIModel, AISource, PetReceipt, ScoutJob } from "@/types";
import { storage } from "./storage";
import { generateId } from "./utils";
import { NoorCapError } from "./noor-cap";
import { runAgentLoop } from "./agent-loop";
import { MODEL_PROFILES, DEFAULT_MODEL } from "./ai-models";
import { roster, workingReceipt, recordWork } from "./pet-agent";

const MAX_PENDING = 3;

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
  return scoutJobs().filter((j) => j.status === "pending" || j.status === "running");
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

export type AssignResult = { ok: true; job: ScoutJob } | { ok: false; reason: "empty" | "limit" };

/** Assign a job: enqueue immediately; the runner picks it up. */
export function assignScoutJob(agentId: string, topic: string, convId: string): AssignResult {
  const t = topic.trim();
  if (!t) return { ok: false, reason: "empty" };
  if (activeScoutJobs().length >= MAX_PENDING) return { ok: false, reason: "limit" };
  const job: ScoutJob = {
    id: generateId(),
    agentId,
    topic: t.slice(0, 500),
    status: "pending",
    convId,
    createdAt: new Date().toISOString(),
  };
  const jobs = jobsFromState();
  jobs.push(job);
  // Keep the ledger bounded: done/failed history is trimmed to the last 10.
  const done = jobs.filter((j) => j.status === "done" || j.status === "failed");
  const keep = new Set(done.slice(-10).map((j) => j.id));
  saveJobs([...jobs.filter((j) => !done.includes(j) || keep.has(j.id))]);
  pushJobReceipt(agentId, "proposed", `New job assigned: “${t.slice(0, 60)}”`);
  return { ok: true, job };
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

function scoutContext(): string {
  return (
    "You are running a SCOUT JOB for Orleia (a local-first productivity app). " +
    "This is a background research task the user assigned ahead of time. " +
    "Prefer web_search + read_url for facts; keep the final summary tight and skimmable. " +
    "Do NOT use ORLEIA_ACTION to change the user's tasks, notes, habits or calendar — " +
    "your entire deliverable is the text summary you finish with."
  );
}

/** First line of a delivery doubles as the note title. */
function deliveryTitle(text: string): string {
  const first = text.split("\n").find((l) => l.trim()) || "";
  return first.replace(/^[#*\-\s]+/, "").replace(/\*\*/g, "").slice(0, 80) || "Scout findings";
}

async function deliver(job: ScoutJob, text: string, sources: AISource[]): Promise<void> {
  // The user's own words are the best headline — plan lines from the
  // agent loop make lousy note titles.
  const title = job.topic.replace(/\s+/g, " ").slice(0, 80) || deliveryTitle(text);
  // 1. In-character delivery message in the pet's chat thread.
  const conv = storage.getData().aiConversations.find((c) => c.id === job.convId);
  const model = safeModel(storage.getData().selectedModel);
  if (conv) {
    storage.addMessage(job.convId, {
      role: "assistant",
      content: `🔔 Job's done — here's what I dug up on “${job.topic}”:\n\n${text}`,
      model,
      sources: sources.length ? sources : undefined,
    });
  }
  // 2. A real note, so the work outlives the chat thread.
  try {
    storage.createNote({
      title: `Scout Findings — ${title}`,
      content: `Research job: ${job.topic}\nDelivered: ${new Date().toLocaleString()}\n\n${text}`,
      contentHtml: "",
      folderId: null,
      projectId: null,
      tags: ["scout"],
      pinned: false,
      archived: false,
      favorite: false,
    });
  } catch {
    /* notes are best-effort */
  }
  // 3. Receipt + trust (a finished job is a working pet).
  updateScoutJob(job.id, {
    status: "done",
    finishedAt: new Date().toISOString(),
    resultTitle: title,
  });
  pushJobReceipt(job.agentId, "accepted", `Delivered the research note “${title}”`);
  // 4. If the pet's thread is open on the Noor page, sync it live so the
  //    delivery appears without a reload (same channel askNoorAnywhere uses).
  try {
    window.dispatchEvent(
      new CustomEvent("orleia:noor-bg", { detail: { type: "done", convId: job.convId, preview: title } })
    );
  } catch {
    /* non-browser */
  }
}

/** Run the OLDEST pending scout job (any agent). Returns the job, or null if none. */
export async function runPendingScoutJob(opts: ScoutRunOpts = {}): Promise<ScoutJob | null> {
  if (scoutJobs().some((j) => j.status === "running")) return null; // one at a time
  const job = jobsFromState()
    .filter((j) => j.status === "pending")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!job) return null;

  const agent = roster().find((a) => a.id === job.agentId);
  if (!agent) {
    updateScoutJob(job.id, { status: "failed", error: "Agent released", finishedAt: new Date().toISOString() });
    return job;
  }

  updateScoutJob(job.id, { status: "running" });
  opts.onStatus?.(`🔭 ${agent.name} is on the job…`);
  // 24/7 log: the agent's last-active stamp moves the moment it picks
  // up an assigned job (night work counts as work, employees don't sleep).
  // Silent: the delivery itself fires the user-facing receipt later.
  recordWork(agent.id, `Picked up job: ${job.topic.slice(0, 60)}`, 0, { silent: true });

  const model = safeModel(storage.getData().selectedModel);
  const history = (storage.getData().aiConversations.find((c) => c.id === job.convId)?.messages ?? []) as never[];
  const sources: AISource[] = [];

  try {
    const out = await runAgentLoop(
      `SCOUT JOB: ${job.topic}`,
      history as never,
      model,
      { onToken: () => {}, sources },
      scoutContext()
    );
    const text = (out || "").trim();
    if (!text) throw new Error("empty result");
    await deliver(job, text, sources);
    opts.onStatus?.(`✅ ${agent.name} delivered the findings.`);
  } catch (e) {
    const cap = e instanceof NoorCapError;
    // Cap/error: back to pending, honest message, user retries via Run now.
    updateScoutJob(job.id, { status: "pending", error: cap ? "daily cap" : "failed" });
    const conv = storage.getData().aiConversations.find((c) => c.id === job.convId);
    if (conv) {
      storage.addMessage(job.convId, {
        role: "assistant",
        content: cap
          ? `😵 Hit the daily message cap mid-job on “${job.topic}”. The job is safe and queued — tap Run now (or come back tomorrow) and I'll pick it up.`
          : `😈 I stumbled mid-job on “${job.topic}” (model hiccup). The job is re-queued — try Run now in a moment.`,
        model: safeModel(storage.getData().selectedModel),
      });
      try {
        window.dispatchEvent(
          new CustomEvent("orleia:noor-bg", { detail: { type: "done", convId: job.convId, preview: "job re-queued" } })
        );
      } catch {
        /* non-browser */
      }
    }
    opts.onStatus?.(cap ? "Job re-queued — daily cap reached." : "Job re-queued — model hiccup.");
  }
  return job;
}

// ---------------- Runner wiring ----------------

const RUNNER = "orleia:scout-runner";

/** Fire the runner; it no-ops if nothing is pending or a job is running. */
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
