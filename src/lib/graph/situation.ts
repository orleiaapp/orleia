// ============================================================
// Orleia Brain - situation model
// Turns AppData + GraphIndex into a deterministic "today" snapshot.
// Consumed by the dashboard AND injected into Noor's context.
// ============================================================

import type { AppData } from "@/types";
import type { Edge, GraphIndex } from "./types";
import { calculateStreak, getMoodScore, getToday } from "@/lib/utils";

export interface RiskItem {
  kind: "habit" | "task";
  id: string;
  title: string;
  detail: string;
  reason?: string;
  href: string;
  streak?: number;
}

export interface ConnectionItem {
  aTitle: string;
  aHref: string;
  bTitle: string;
  bHref: string;
  reason: string;
  weight: number;
}
export interface TaskMention {
  id: string;
  title: string;
  /** Weighted mention count (recent mentions count double). */
  score: number;
  /** Raw count of mention edges touching this task. */
  count: number;
  /** Mentions in the last 7 days. */
  recent: number;
}

export interface SituationModel {
  date: string;
  productivity: number;
  habitsLogged: number;
  habitsTotal: number;
  tasksDone: number;
  tasksTotal: number;
  journalToday: boolean;
  moodLine: string;
  risks: RiskItem[];
  connections: ConnectionItem[];
  recentNotes: string[];
  overdueCount: number;
  atRiskStreakCount: number;
  /** Tasks repeatedly mentioned in notes/journal, weighted by recency. */
  taskMentions: TaskMention[];
  /** 14-day journal mood trend. */
  moodTrend: 'improving' | 'declining' | 'steady' | 'insufficient-data';
}

const kindHref: Record<string, string> = {
  note: "/notes",
  task: "/tasks",
  habit: "/habits",
  journal: "/journal",
};

function titleOf(graph: GraphIndex, key: string): string {
  return graph.entities.get(key)?.title || key;
}

function bestReason(graph: GraphIndex, key: string): string | undefined {
  const all: Edge[] = [
    ...(graph.edgesBySource.get(key) || []),
    ...(graph.edgesByTarget.get(key) || []),
  ];
  all.sort((a, b) => b.weight - a.weight);
  const e = all.find((x) => x.type !== "structural");
  return e?.reason;
}

/** Habits scheduled today that aren't logged yet, with streak pressure. */
function atRiskHabits(data: AppData, graph: GraphIndex): RiskItem[] {
  const today = getToday();
  const ranked: { streak: number; item: RiskItem }[] = [];
  for (const h of data.habits) {
    if (h.archived) continue;
    const loggedDates = data.habitLogs
      .filter((l) => l.habitId === h.id)
      .map((l) => l.date);
    const streak = calculateStreak(loggedDates);
    const loggedToday = data.habitLogs.some((l) => l.habitId === h.id && l.date === today);
    if (loggedToday || streak.current < 2) continue;
    const reason = bestReason(graph, `habit:${h.id}`);
    ranked.push({
      streak: streak.current,
      item: {
        kind: "habit",
        id: h.id,
        title: h.name,
        detail: `${streak.current}-day streak - log today to keep it`,
        reason,
        href: "/habits",
        streak: streak.current,
      },
    });
  }
  return ranked
    .sort((a, b) => b.streak - a.streak)
    .map((x) => x.item)
    .slice(0, 4);
}

function overdueTasks(data: AppData, graph: GraphIndex): RiskItem[] {
  const today = getToday();
  const out: RiskItem[] = [];
  for (const t of data.tasks) {
    if (t.status === "done" || t.status === "archived" || !t.dueDate) continue;
    if (t.dueDate >= today) continue;
    const days = Math.round((new Date(today).getTime() - new Date(t.dueDate).getTime()) / 86400000);
    out.push({
      kind: "task",
      id: t.id,
      title: t.title,
      detail: days === 0 ? "due today" : `${days}d overdue`,
      reason: bestReason(graph, `task:${t.id}`),
      href: "/tasks",
    });
  }
  return out.slice(0, 4);
}

function topConnections(graph: GraphIndex, limit = 4): ConnectionItem[] {
  const crossKind = graph.allEdges.filter(
    (e) => e.source.split(":")[0] !== e.target.split(":")[0] && e.type !== "structural"
  );
  crossKind.sort((a, b) => b.weight - a.weight);
  const seen = new Set<string>();
  const out: ConnectionItem[] = [];
  for (const e of crossKind) {
    const a = e.source < e.target ? e.source : e.target;
    const b = e.source < e.target ? e.target : e.source;
    const k = `${a}|${b}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      aTitle: titleOf(graph, e.source),
      aHref: kindHref[e.source.split(":")[0]] || "/",
      bTitle: titleOf(graph, e.target),
      bHref: kindHref[e.target.split(":")[0]] || "/",
      reason: e.reason,
      weight: e.weight,
    });
    if (out.length >= limit) break;
  }
  return out;
}

function moodLine(data: AppData): string {
  const recent = data.journalEntries
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 7);
  if (recent.length === 0) return "";
  const scores = recent.map((j) => getMoodScore(j.mood)).filter((s) => s > 0);
  if (scores.length === 0) return "";
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const trend = scores.length >= 2 ? scores[0] - scores[scores.length - 1] : 0;
  const dir = trend > 4 ? "rising" : trend < -4 ? "dipping" : "steady";
  // getMoodScore returns 0-100; present on the 0-10 scale the app uses.
  return `avg mood ${(avg / 10).toFixed(1)}/10, ${dir}`;
}

const MS_DAY = 86400000;

/** Tasks mentioned in journal/notes via graph 'mention' edges, recency-weighted. */
function repeatedMentions(data: AppData, graph: GraphIndex): TaskMention[] {
  const today = getToday();
  const now = new Date(today).getTime();
  const taskIds = new Set(
    data.tasks
      .filter((t) => t.status !== 'done' && t.status !== 'archived')
      .map((t) => t.id)
  );
  const score = new Map<string, { count: number; recent: number }>();
  for (const e of graph.allEdges) {
    if (e.type !== 'mention') continue;
    let taskKey: string | undefined;
    let otherKey: string | undefined;
    if (e.source.startsWith('task:')) { taskKey = e.source; otherKey = e.target; }
    else if (e.target.startsWith('task:')) { taskKey = e.target; otherKey = e.source; }
    if (!taskKey) continue;
    const id = taskKey.slice(5);
    if (!taskIds.has(id)) continue;
    const cur = score.get(id) || { count: 0, recent: 0 };
    cur.count++;
    if (otherKey) {
      let ts: number | undefined;
      const kind = otherKey.split(":")[0];
      const oid = otherKey.slice(kind.length + 1);
      if (kind === "journal") {
        // Source of truth for "when this was written" is the entry date.
        const j = data.journalEntries.find((x) => x.id === oid);
        if (j && j.date) ts = new Date(j.date).getTime();
      } else {
        const other = graph.entities.get(otherKey);
        if (other) ts = new Date(other.updatedAt || 0).getTime();
      }
      if (ts !== undefined && now - ts <= 7 * MS_DAY) cur.recent++;
    }
    score.set(id, cur);
  }
  return Array.from(score.entries())
    .map(([id, s]) => ({
      id,
      title: graph.entities.get('task:' + id)?.title || data.tasks.find((t) => t.id === id)?.title || 'Task',
      score: s.count + s.recent, // recent mentions count double
      count: s.count,
      recent: s.recent,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/** 14-day journal mood trend. */
function moodTrend(data: AppData): SituationModel['moodTrend'] {
  const today = getToday();
  const cutoff = new Date(new Date(today).getTime() - 14 * MS_DAY).toISOString().slice(0, 10);
  const entries = data.journalEntries
    .filter((j) => j.date && j.date >= cutoff && getMoodScore(j.mood) > 0)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (entries.length < 4) return 'insufficient-data';
  const half = Math.floor(entries.length / 2);
  const first = entries.slice(0, half);
  const second = entries.slice(half);
  const avg = (arr: typeof first) => arr.reduce((a, j) => a + getMoodScore(j.mood), 0) / arr.length;
  const diff = avg(second) - avg(first);
  if (diff > 0.5) return 'improving';
  if (diff < -0.5) return 'declining';
  return 'steady';
}
export function buildSituationModel(data: AppData, graph: GraphIndex): SituationModel {
  const today = getToday();
  const activeHabits = data.habits.filter((h) => !h.archived);
  const todayTasks = data.tasks.filter((t) => t.dueDate === today && t.status !== "archived");
  const todayDone = todayTasks.filter((t) => t.status === "done").length;
  const habitsLogged = data.habitLogs.filter((l) => l.date === today).length;
  const habitScore = activeHabits.length ? Math.round((habitsLogged / activeHabits.length) * 100) : 0;
  const taskScore = todayTasks.length ? Math.round((todayDone / todayTasks.length) * 100) : 0;
  const productivity = Math.round((habitScore + taskScore) / 2);

  const risks = [...atRiskHabits(data, graph), ...overdueTasks(data, graph)].slice(0, 6);
  const connections = topConnections(graph, 4);

  const recentNotes = data.notes
    .filter((n) => !n.archived)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 3)
    .map((n) => n.title || "Untitled");

  return {
    date: today,
    productivity,
    habitsLogged,
    habitsTotal: activeHabits.length,
    tasksDone: todayDone,
    tasksTotal: todayTasks.length,
    journalToday: data.journalEntries.some((e) => e.date === today),
    moodLine: moodLine(data),
    risks,
    connections,
    recentNotes,
    overdueCount: data.tasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== "done" && t.status !== "archived").length,
    atRiskStreakCount: risks.filter((r) => r.kind === "habit").length,
    taskMentions: repeatedMentions(data, graph),
    moodTrend: moodTrend(data),
  };
}

export function situationForAI(s: SituationModel): string {
  const lines: string[] = [];
  lines.push(`Productivity today: ${s.productivity}/100 (habits ${s.habitsLogged}/${s.habitsTotal}, tasks ${s.tasksDone}/${s.tasksTotal}).`);
  lines.push(`Journal today: ${s.journalToday ? "yes" : "no"}${s.moodLine ? " · " + s.moodLine : ""}.`);
  if (s.risks.length) {
    lines.push("At risk: " + s.risks.map((r) => `"${r.title}" (${r.detail})`).join(", ") + ".");
  } else {
    lines.push("Nothing at risk right now.");
  }
  if (s.connections.length) {
    lines.push(
      "Connections: " +
        s.connections.map((c) => `"${c.aTitle}" ↔ "${c.bTitle}" - ${c.reason}`).join(" | ")
    );
  }
  if (s.taskMentions.length) {
    lines.push(
      "Repeatedly mentioned: " +
        s.taskMentions.map((m) => `\"${m.title}\" (${m.count}x, ${m.recent} recent)`).join(", ") +
        "."
    );
  }
  if (s.moodTrend !== 'insufficient-data') {
    lines.push(`Mood trend (14d): ${s.moodTrend}.`);
  }
  if (s.recentNotes.length) lines.push(`Recently touched notes: ${s.recentNotes.join(", ")}.`);
  return lines.join("\n");
}

export function hrefForKind(kind: string): string {
  return kindHref[kind] || "/";
}
