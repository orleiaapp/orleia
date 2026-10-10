"use client";

import { storage } from "./storage";
import { getToday, calculateStreak } from "./utils";
import { Habit, Task, JournalEntry, Note, Mood, HabitTimeOfDay } from "@/types";

// ============================================================
// Action Types
// ============================================================

export interface ActionResult<T = any> {
  success: boolean;
  message: string;
  data?: T;
}

export interface AIAction {
  matched: boolean;
  type: ActionType | null;
  params: Record<string, any>;
  confidence: number; // 0-1
}

export type ActionType =
  | "create_routine"
  | "create_habit"
  | "log_habit"
  | "unlog_habit"
  | "delete_habit"
  | "update_habit"
  | "create_task"
  | "complete_task"
  | "update_task"
  | "delete_task"
  | "create_journal"
  | "update_journal"
  | "create_note"
  | "update_note"
  | "delete_note"
  | "search_data"
  | "export_data"
  | "read_data"
  | "update_settings"
  | "create_event"
  | "create_form"
  | "create_board"
  | "navigate";

// ============================================================
// Action Detector - understands what the user wants to DO
// ============================================================

// ============================================================
// Natural-language helpers - parse due times & clean titles
// ============================================================

function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];
const WEEKDAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

interface DueInfo {
  dueDate: string | null;
  dueTime: string | null;
  cleaned: string;
}

/**
 * Pulls a due-time expression out of a natural-language query ("in an hour",
 * "by 5pm", "tomorrow morning", "friday", "mar 15", "in 2 days"...).
 * Returns the due date/time plus the query with that expression removed,
 * so the remaining text can be parsed for the task title.
 */
function extractDueTime(query: string): DueInfo {
  let q = query.toLowerCase().trim();
  const now = new Date();
  let dueDate: string | null = null;
  let dueTime: string | null = null;

  const remove = (m: RegExpMatchArray | null) => {
    if (m && m[0]) {
      q = q.replace(m[0], " ").replace(/\s{2,}/g, " ").trim();
    }
  };

  // 1) Relative offsets - "in an hour", "in 30 mins", "in 2 days", "in a week"
  let m = q.match(
    /\bin\s+(?:(\d+(?:\.\d+)?)|(?:a|an|one)|half\s+an?|a\s+couple\s+of)\s*(minutes?|mins?|hours?|hrs?|days?|weeks?|months?)\b/
  );
  if (m) {
    const unit = (m[2] || "").replace(/s$/, "");
    let amount: number;
    if (m[1]) amount = parseFloat(m[1]);
    else if (/half/.test(m[0])) amount = 0.5;
    else if (/couple/.test(m[0])) amount = 2;
    else amount = 1;
    const t = new Date(now);
    if (unit.startsWith("min"))
      t.setMinutes(t.getMinutes() + Math.round(amount * 60));
    else if (unit.startsWith("hour") || unit === "hr")
      t.setHours(t.getHours() + Math.round(amount));
    else if (unit.startsWith("day"))
      t.setDate(t.getDate() + Math.round(amount));
    else if (unit.startsWith("week"))
      t.setDate(t.getDate() + Math.round(amount * 7));
    else if (unit.startsWith("month"))
      t.setMonth(t.getMonth() + Math.round(amount));
    dueDate = formatISODate(t);
    if (unit.startsWith("min") || unit.startsWith("hour") || unit === "hr") {
      dueTime = formatHHMM(t);
    }
    remove(m);
  }

  // 2) "2 hours from now" / "in 3 days from now"
  if (!dueDate) {
    m = q.match(
      /\b(\d+)\s*(minutes?|mins?|hours?|hrs?|days?|weeks?|months?)\s+(?:from\s+now|later)\b/
    );
    if (m) {
      const unit = m[2].replace(/s$/, "").replace(/^hr/, "hour");
      const amount = parseInt(m[1], 10);
      const t = new Date(now);
      if (unit.startsWith("min")) t.setMinutes(t.getMinutes() + amount);
      else if (unit.startsWith("hour")) t.setHours(t.getHours() + amount);
      else if (unit.startsWith("day")) t.setDate(t.getDate() + amount);
      else if (unit.startsWith("week")) t.setDate(t.getDate() + amount * 7);
      else if (unit.startsWith("month")) t.setMonth(t.getMonth() + amount);
      dueDate = formatISODate(t);
      if (unit.startsWith("min") || unit.startsWith("hour"))
        dueTime = formatHHMM(t);
      remove(m);
    }
  }

  // 3) Clock times - "by 5pm", "at 9:30", "before 7 am"
  if (!dueDate) {
    // Day anchor: if the query says "tomorrow at 6pm" (or today), the clock
    // time must land on that day, not the current day.
    let dayAnchor: Date | null = null;
    const anchorMatch = q.match(/\btomorrow(?:\s+(morning|afternoon|evening|night))?\b|\btoday\b/);
    if (anchorMatch) {
      const t = new Date(now);
      if (/tomorrow/.test(anchorMatch[0])) {
        t.setDate(t.getDate() + 1);
        if (anchorMatch[1]) {
          const times: Record<string, number> = { morning: 9, afternoon: 14, evening: 19, night: 21 };
          t.setHours(times[anchorMatch[1]], 0, 0, 0);
          dueTime = formatHHMM(t);
        }
      }
      dayAnchor = t;
      remove(anchorMatch);
    }
    m = q.match(/\b(?:by|at|before|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
    if (m) {
      let hour = parseInt(m[1], 10);
      const min = m[2] ? parseInt(m[2], 10) : 0;
      const mer = (m[3] || "").toLowerCase();
      if (mer === "pm" && hour < 12) hour += 12;
      if (mer === "am" && hour === 12) hour = 0;
      const t = dayAnchor ? new Date(dayAnchor) : new Date(now);
      t.setHours(hour, min, 0, 0);
      if (!dayAnchor && t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
      dueDate = formatISODate(t);
      dueTime = formatHHMM(t);
      remove(m);
    }
  }

  // 4) Named times of day - "tonight", "this morning/afternoon/evening"
  if (!dueDate) {
    m = q.match(/\btonight\b/);
    if (m) {
      const t = new Date(now);
      t.setHours(21, 0, 0, 0);
      if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
      dueDate = formatISODate(t);
      dueTime = formatHHMM(t);
      remove(m);
    }
  }
  if (!dueDate) {
    m = q.match(/\bin\s+the\s+(morning|afternoon|evening)\b/);
    if (m) {
      const times: Record<string, number> = { morning: 9, afternoon: 14, evening: 19 };
      const t = new Date(now);
      t.setHours(times[m[1]], 0, 0, 0);
      if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
      dueDate = formatISODate(t);
      dueTime = formatHHMM(t);
      remove(m);
    }
  }
  if (!dueDate) {
    m = q.match(/\bthis\s+(morning|afternoon|evening)\b/);
    if (m) {
      const times: Record<string, number> = { morning: 9, afternoon: 14, evening: 19 };
      const t = new Date(now);
      t.setHours(times[m[1]], 0, 0, 0);
      if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
      dueDate = formatISODate(t);
      dueTime = formatHHMM(t);
      remove(m);
    }
  }

  // 5) tomorrow / today
  if (!dueDate) {
    m = q.match(/\btomorrow(?:\s+(morning|afternoon|evening|night))?\b/);
    if (m) {
      const t = new Date(now);
      t.setDate(t.getDate() + 1);
      if (m[1]) {
        const times: Record<string, number> = {
          morning: 9,
          afternoon: 14,
          evening: 19,
          night: 21,
        };
        t.setHours(times[m[1]], 0, 0, 0);
        dueTime = formatHHMM(t);
      }
      dueDate = formatISODate(t);
      remove(m);
    }
  }
  if (!dueDate) {
    m = q.match(/\btoday\b/);
    if (m) {
      dueDate = formatISODate(now);
      remove(m);
    }
  }

  // 6) "by the end of the day / week / month"
  if (!dueDate) {
    m = q.match(/\bend\s+of\s+(?:the\s+)?(day|week|month)\b/);
    if (m) {
      if (m[1] === "day") {
        dueDate = formatISODate(now);
      } else if (m[1] === "week") {
        const t = new Date(now);
        t.setDate(t.getDate() + ((7 - t.getDay()) % 7));
        dueDate = formatISODate(t);
      } else {
        const t = new Date(now);
        t.setMonth(t.getMonth() + 1, 0);
        dueDate = formatISODate(t);
      }
      remove(m);
    }
  }

  // 7) Weekday names - "friday", "next monday"
  if (!dueDate) {
    m = q.match(/\b(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (m) {
      const target = WEEKDAY_NAMES.indexOf(m[1]);
      let diff = (target - now.getDay() + 7) % 7;
      if (/next\s/.test(m[0])) diff += 7;
      const t = new Date(now);
      t.setDate(t.getDate() + diff);
      dueDate = formatISODate(t);
      remove(m);
    }
  }

  // 8) Named month dates - "due mar 15", "on june 3rd"
  if (!dueDate) {
    m = q.match(
      /\b(?:due|by|on|for)\s+((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)\s+(\d{1,2})(?:st|nd|rd|th)?\b/
    );
    if (m) {
      const monthName = m[1];
      const monthIdx = MONTH_NAMES.findIndex((mm) => monthName.startsWith(mm));
      const t = new Date(now.getFullYear(), monthIdx, parseInt(m[2], 10), 12, 0, 0);
      if (t.getTime() < now.getTime()) t.setFullYear(t.getFullYear() + 1);
      dueDate = formatISODate(t);
      remove(m);
    }
  }

  // 9) Absolute dates - "2026-08-05"
  if (!dueDate) {
    m = q.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (m) {
      dueDate = `${m[1]}-${m[2]}-${m[3]}`;
      remove(m);
    }
  }

  return { dueDate, dueTime, cleaned: q };
}

/** Strips conversational filler from a captured title: "me to do 10 push ups" -> "10 push ups" */
function cleanTaskTitle(raw: string): string {
  let t = raw.trim();
  t = t
    .replace(
      /^(?:please\s+)?(?:for\s+)?(?:me\s+)?(?:at\s+)?(?:to\s+)?(?:do\s+|complete\s+)?/i,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
  t = t.replace(/\s+(?:due|by|before|on|at|please)$/i, "").trim();
  if (t.length === 0) return raw.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Fills a task params object with priority + due info from the original query. */
function applyTaskParams(
  params: Record<string, any>,
  originalQuery: string,
  timeInfo: DueInfo
): void {
  if (/\burge[nt]\b/.test(originalQuery)) params.priority = "urgent";
  else if (/\bhigh\s*priority\b/.test(originalQuery)) params.priority = "high";
  else if (/\blow\s*priority\b/.test(originalQuery)) params.priority = "low";
  else params.priority = "medium";

  if (timeInfo.dueDate) params.dueDate = timeInfo.dueDate;
  if (timeInfo.dueTime) params.dueTime = timeInfo.dueTime;
}

/**
 * Pulls frequency + time-of-day out of a habit request ("daily", "every week",
 * "at 9 am", "in the evening") and returns the cleaned query for name parsing.
 */
function extractHabitDetails(query: string): {
  frequency: string;
  timeOfDay: string;
  cleaned: string;
} {
  let q = query.toLowerCase().trim();
  let frequency = "daily";
  let timeOfDay = "anytime";
  const remove = (m: RegExpMatchArray | null) => {
    if (m && m[0]) {
      q = q.replace(m[0], " ").replace(/\s{2,}/g, " ").trim();
    }
  };

  const freq = q.match(
    /\b(?:every|each)\s*(?:single\s+)?(day|week|month)\b|\b(daily|weekly|monthly|everyday)\b/
  );
  if (freq) {
    const f = (freq[1] || freq[2] || "").toLowerCase();
    frequency = f === "day" || f === "daily" ? "daily" : f === "week" || f === "weekly" ? "weekly" : "monthly";
    remove(freq);
  }

  // time-of-day: only extract when it is a real time phrase (in the/every/at) or
  // the last word of the query, so a bare "morning" inside a habit name
  // ("habit: morning stretch") stays in the name
  const tod = q.match(/\b(?:in\s+(?:the\s+)?|every\s+|at\s+)(morning|afternoon|evening|night)\b|\b(morning|afternoon|evening|night)\s*$/);
  if (tod) {
    timeOfDay = (tod[1] || tod[2]) === "night" ? "evening" : (tod[1] || tod[2]);
    remove(tod);
  }

  const clock = q.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (clock) {
    let h = parseInt(clock[1], 10);
    if (clock[3] === "pm" && h < 12) h += 12;
    if (clock[3] === "am" && h === 12) h = 0;
    timeOfDay = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
    remove(clock);
  }

  return { frequency, timeOfDay, cleaned: q };
}

/**
 * True when a search-style target ("my notes", "dashboard", "the journal")
 * mentions ONLY navigation pages + fillers — i.e. the user means "open that
 * page", not "search my data for this term". A target carrying any other
 * word ("gemini", "plan") is a real local search.
 */
function isPurePageNav(target: string, navPages: string[]): boolean {
  const FILLERS = new Set(["my", "our", "the", "a", "an", "some", "this", "that", "for", "in", "about", "of", "and", "or", "to", "all", "me", "page", "list"]);
  const words = target.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return words.length > 0 && words.every((w) => FILLERS.has(w) || navPages.includes(w));
}

export function detectAction(query: string): AIAction {
  const q = query.toLowerCase().trim();
  // A "?" is always a question. Otherwise only pure question words count -
  // do/does/did/can/could/will/would usually introduce polite imperatives
  // ("can you make me a habit...") that MUST reach the action engine. A
  // "should/what" question that matches no action just falls through to the
  // LLM, so nothing is lost by being permissive here.
  const isQuestion =
    /\?$/.test(q) ||
    /^(?:what|how|why|when|where|is|are|should)\b/i.test(q);

  // --- CREATE ROUTINE --- (a detailed multi-habit routine, e.g. "morning routine")
  const routineMatch = q.match(
    /\b(?:make|create|add|build|design|plan|set\s+up|give|start|establish|need|want)\b.{0,30}?\b(?:a\s+|an\s+)?(?:detailed\s+|full\s+|complete\s+|proper\s+|perfect\s+|new\s+|daily\s+|simple\s+|whole\s+)?(morning|evening|night|bedtime|daily|workout|exercise|fitness|study|learning|skincare|skin\s+care|sleep|self[\s-]?care|reading|meditation)\s*(routine|ritual|schedule|regimen)\b/
  );
  const plainRoutine = !routineMatch
    ? q.match(/\b(?:make|create|build|design|plan|set\s+up|give|need|want)\b.{0,24}?\b(?:routine|ritual|regimen)\b/)
    : null;
  if ((routineMatch || plainRoutine) && !q.includes("task") && !isQuestion) {
    const kind = routineMatch ? (routineMatch[1] || "daily").toLowerCase() : "daily";
    return {
      matched: true,
      type: "create_routine",
      params: { kind, query: q },
      confidence: 0.9,
    };
  }

  // --- CREATE HABIT ---
  const habitDetails = extractHabitDetails(q);
  const createHabitMatch = habitDetails.cleaned.match(
    /\b(?:create|add|make|start|set\s+up|build|establish|new)\b.{0,24}?\b(?:habit|routine|practice|ritual)\b(?:\s+(?:called|named|for|to|of|that\s+is|:))?\s*(.+?)(?:\.)?$/
  );
  if (createHabitMatch && !q.includes("task") && !isQuestion) {
    const habitName = cleanTaskTitle(
      createHabitMatch[1]
        .trim()
        .replace(/^[:;,\-.\u2014]\s*/, "")
        .replace(
          /^(?:for\s+me\s+to\s+|me\s+to\s+|for\s+me\s+|for\s+you\s+to\s+|to\s+)/i,
          ""
        )
        .replace(/\s*(?:every\s*day|everyday|daily|weekly|monthly|in\s+the\s+(?:morning|afternoon|evening))$/i, "")
        .trim()
    );
    if (habitName) {
      return {
        matched: true,
        type: "create_habit",
        params: {
          name: habitName,
          frequency: habitDetails.frequency,
          timeOfDay: habitDetails.timeOfDay,
        },
        confidence: 0.85,
      };
    }
  }

  // --- LOG HABIT ---
  const logHabitMatch = q.match(
    /(?:log|check|mark|done|complete|track|record|did|finished|completed|practiced|hit)\s+(?:my\s+)?(?:habit\s+)?([\w\s-]+?)(?:\s+(?:for|today|now))?\s*(?:$|\.)/
  );
  if (logHabitMatch && !q.includes("unlog") && !q.includes("undo")) {
    const candidate = logHabitMatch[1].trim();
    if (findHabitByName(candidate)) {
      return {
        matched: true,
        type: "log_habit",
        params: { habitName: candidate },
        confidence: 0.8,
      };
    }
  }

  // --- UNLOG HABIT ---
  if (
    /(?:unlog|undo|remove|uncheck|unmark)\s+(?:my\s+)?(?:habit\s+)?([\w\s-]+?)\s*(?:$|\.)/.test(q)
  ) {
    const unlogMatch = q.match(
      /(?:unlog|undo|remove|uncheck|unmark)\s+(?:my\s+)?(?:habit\s+)?([\w\s-]+?)\s*(?:$|\.)/
    );
    if (unlogMatch) {
      return {
        matched: true,
        type: "unlog_habit",
        params: { habitName: unlogMatch[1].trim() },
        confidence: 0.8,
      };
    }
  }

  // --- DELETE HABIT ---
  const deleteHabitMatch = q.match(
    /(?:delete|remove|destroy)\s+(?:the\s+)?(?:habit|routine)\s+(?:called\s+|named\s+)?["']?([\w\s-]+)["']?\s*(?:$|\.)/
  );
  if (deleteHabitMatch) {
    return {
      matched: true,
      type: "delete_habit",
      params: { habitName: deleteHabitMatch[1].trim() },
      confidence: 0.85,
    };
  }

  // --- CREATE TASK ---
  // Pull out due-time expressions first ("in an hour", "by 5pm", "tomorrow", ...)
  const timeInfo = extractDueTime(q);
  const taskQuery = timeInfo.cleaned;

  // "remind me to ..." / "add a reminder ..."
  const remindMatch = taskQuery.match(
    /(?:remind\s+me|add\s+(?:a\s+)?reminder)\s+(?:to\s+)?(.+?)(?:$|\.)/
  );
  if (remindMatch && !isQuestion) {
    const title = cleanTaskTitle(remindMatch[1].trim());
    if (title) {
      const params: Record<string, any> = { title };
      applyTaskParams(params, q, timeInfo);
      return {
        matched: true,
        type: "create_task",
        params,
        confidence: 0.85,
      };
    }
  }

  const createTaskMatch = taskQuery.match(
    /\b(?:create|add|make|new|set|schedule|give|need|plan)\b.{0,20}?\b(?:task|todo|to-do|reminder|errand)\b(?:\s+(?:called|named|for|to|of|that\s+is|:))?\s*(.+?)(?:$|\.)/
  );
  if (createTaskMatch && !isQuestion) {
    const title = cleanTaskTitle(createTaskMatch[1].trim());
    if (title) {
      const params: Record<string, any> = { title };
      applyTaskParams(params, q, timeInfo);
      return {
        matched: true,
        type: "create_task",
        params,
        confidence: 0.85,
      };
    }
  }

  // --- COMPLETE / TOGGLE TASK ---
  const completeTaskMatch = q.match(
    /(?:complete|finish|done|mark|check|tick)\s+(?:the\s+)?(?:task\s+)?["']?([\w\s-]+)["']?\s*(?:$|\.|as\s+done)/
  );
  if (completeTaskMatch) {
    const candidate = completeTaskMatch[1].trim();
    if (findTaskByTitle(candidate)) {
      return {
        matched: true,
        type: "complete_task",
        params: { taskTitle: candidate },
        confidence: 0.8,
      };
    }
  }

  // --- DELETE TASK ---
  const deleteTaskMatch = q.match(
    /(?:delete|remove)\s+(?:the\s+)?(?:task\s+)?["']?([\w\s-]+)["']?\s*(?:$|\.)/
  );
  if (deleteTaskMatch) {
    return {
      matched: true,
      type: "delete_task",
      params: { taskTitle: deleteTaskMatch[1].trim() },
      confidence: 0.8,
    };
  }

  // --- CREATE JOURNAL ENTRY ---
  const journalMatch =
    q.match(
      /(?:write|create|add|make)\s+(?:a\s+)?(?:journal|diary)\s+(?:entry\s+)?(?:about|for|titled|named|:)?\s*(.+?)(?:\s+(?:feeling|mood|with|and))?(?:$|\.)/i
    ) ||
    q.match(
      /(?:journal|diary)\s+entry\s*:\s*(.+?)(?:\s+(?:feeling|mood|with|and))?(?:$|\.)/i
    ) ||
    q.match(
      /^\s*(?:journal|diary)\s*:\s*(.+?)(?:\s+(?:feeling|mood|with|and))?(?:$|\.)/i
    );
  if (journalMatch && q.includes("journal")) {
    const params: Record<string, any> = {
      title: journalMatch[1].trim().length > 50
        ? journalMatch[1].trim().slice(0, 50) + "..."
        : journalMatch[1].trim(),
      content: journalMatch[1].trim(),
      date: getToday(),
    };
    // Detect mood
    if (/\b(amazing|great|fantastic|wonderful|excellent)\b/i.test(q))
      params.mood = "amazing";
    else if (/\b(good|nice|fine|okay|alright|decent)\b/i.test(q))
      params.mood = "good";
    else if (/\b(neutral|okay|fine|so-so)\b/i.test(q))
      params.mood = "neutral";
    else if (/\b(bad|rough|tough|hard|difficult|sad|down)\b/i.test(q))
      params.mood = "bad";
    else if (/\b(terrible|awful|horrible|worst)\b/i.test(q))
      params.mood = "terrible";
    else params.mood = "neutral";

    return {
      matched: true,
      type: "create_journal",
      params,
      confidence: 0.8,
    };
  }

  // --- CREATE NOTE ---
  const noteMatch = q.match(
    /(?:create|add|make|write|save)\s+(?:a\s+)?(?:note)\s+(?:called|named|titled|about|for|:)?\s*(.+?)(?:\s+(?:in|with|tag|and))?(?:$|\.)/i
  );
  if (noteMatch) {
    const params: Record<string, any> = {
      title: noteMatch[1].trim().length > 60
        ? noteMatch[1].trim().slice(0, 60) + "..."
        : noteMatch[1].trim(),
      content: noteMatch[1].trim(),
    };
    return {
      matched: true,
      type: "create_note",
      params,
      confidence: 0.75,
    };
  }

  // --- SEARCH (excluding pure page navigation) ---
  const navPages = ['dashboard', 'habits', 'tasks', 'notes', 'noor', 'mindfulness', 'documents', 'settings', 'deck', 'calendar', 'journal'];
  const searchMatch = q.match(
    /\b(?:search|find|look\s+(?:up|for)|show\s+me)\b\s+(.+?)(?:\s+(?:in|about|for))?\s*(?:$|\.)/i
  );
  if (
    searchMatch &&
    !/(?:create|add|make|write|delete|remove|log)\b/i.test(q) &&
    // "find my notes" / "search dashboard" = navigate to the page — the
    // words after the verb are ONLY page names + fillers. "search my notes
    // for gemini" carries a real term, so it's a LOCAL SEARCH even when the
    // term is also a web keyword (the old q.includes(page) check killed it
    // and the live-query gate then hijacked it to a web search).
    !isPurePageNav(searchMatch[1], navPages)
  ) {
    if (searchMatch) {
      return {
        matched: true,
        type: "search_data",
        params: { query: searchMatch[1].trim() },
        confidence: 0.7,
      };
    }

    // --- ORLEIA OFFICE: CALENDAR / FORMS / BOARD ---
    // "schedule a meeting friday" / "add event dentist tomorrow 3pm"
    const eventMatch = q.match(
      /\b(?:schedule|add|create|put|new)\b.{0,20}?\b(event|meeting|appointment)\b(?:\s+(?:called|named|for|:))?\s*([\w\s-]+?)(?:\s+(?:on|at|this|next|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.*)?$/i
    );
    if (eventMatch && !isQuestion) {
      const title = eventMatch[2].trim();
      if (title) {
        const params: Record<string, any> = { title };
        if (timeInfo?.dueDate) params.date = timeInfo.dueDate;
        const tm = q.match(/\b(?:at|from)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (tm) {
          let h = parseInt(tm[1]);
          const m = tm[2] ? tm[2] : "00";
          const ap = tm[3]?.toLowerCase();
          if (ap === "pm" && h < 12) h += 12;
          if (ap === "am" && h === 12) h = 0;
          params.time = `${String(h).padStart(2, "0")}:${m}`;
        }
        return { matched: true, type: "create_event", params, confidence: 0.8 };
      }
    }

    // "create a feedback form" / "new form for workshop signups"
    const formMatch = q.match(
      /\b(?:create|add|make|new|generate)\b.{0,20}?\bform\b(?:\s+(?:called|named|for|about|to))?\s*([\w\s-]*)$/i
    );
    if (formMatch && !isQuestion) {
      const subject = formMatch[1].trim();
      return {
        matched: true,
        type: "create_form",
        params: { subject: subject || "Untitled form" },
        confidence: 0.8,
      };
    }

    // "create a board" / "new whiteboard for the kitchen redesign"
    const boardMatch = q.match(
      /\b(?:create|add|make|new|start)\b.{0,20}?\b(?:board|whiteboard)\b(?:\s+(?:called|named|for|about))?\s*([\w\s-]*)$/i
    );
    if (boardMatch && !isQuestion) {
      const subject = boardMatch[1].trim();
      return {
        matched: true,
        type: "create_board",
        params: { subject: subject || "Untitled board" },
        confidence: 0.8,
      };
    }
  }

  // --- UPDATE HABIT (rename, change frequency, etc.) ---
  const updateHabitMatch = q.match(
    /(?:update|change|rename|modify|edit)\s+(?:the\s+)?(?:habit|routine)\s+(?:called\s+|named\s+)?["']?([\w\s-]+)["']?\s+(?:to|so|with|frequency|time|category|color)\s*(.+?)?(?:$|\.)/i
  );
  if (updateHabitMatch) {
    return {
      matched: true,
      type: "update_habit",
      params: { 
        habitName: updateHabitMatch[1].trim(),
        change: updateHabitMatch[2]?.trim() || ""
      },
      confidence: 0.75,
    };
  }

  // --- UPDATE TASK (reprioritize, reschedule, rename) ---
  const updateTaskMatch = q.match(
    /(?:update|change|move|reprioritize|reschedule|rename)\s+(?:the\s+)?(?:task\s+)?["']?([\w\s-]+)["']?\s+(?:to|as|priority|due|status)\s*(.+?)?(?:$|\.)/i
  );
  if (updateTaskMatch) {
    const params: Record<string, any> = { 
      taskTitle: updateTaskMatch[1].trim(),
      change: updateTaskMatch[2]?.trim() || ""
    };
    if (/\burge[nt]\b/i.test(q)) params.priority = "urgent";
    else if (/\bhigh(?:\s+priority)?\b/i.test(q)) params.priority = "high";
    else if (/\blow(?:\s+priority)?\b/i.test(q)) params.priority = "low";
    else if (/\bmedium\b/i.test(q)) params.priority = "medium";
    return {
      matched: true,
      type: "update_task",
      params,
      confidence: 0.7,
    };
  }

  // --- DELETE NOTE ---
  const deleteNoteMatch = q.match(
    /(?:delete|remove)\s+(?:the\s+)?(?:note)\s+(?:called\s+|named\s+|titled\s+)?["']?([\w\s-]+)["']?\s*(?:$|\.)/i
  );
  if (deleteNoteMatch) {
    return {
      matched: true,
      type: "delete_note",
      params: { noteTitle: deleteNoteMatch[1].trim() },
      confidence: 0.8,
    };
  }

  // --- UPDATE SETTINGS (theme / text size) ---
  if (!isQuestion && /\b(dark|light)\s+mode\b|\bswitch\s+(?:to\s+)?(dark|light)\b|\bturn\s+on\s+(dark|light)\b|\btheme\b/.test(q)) {
    if (/\bdark\b/.test(q)) {
      return { matched: true, type: "update_settings", params: { theme: "dark" }, confidence: 0.85 };
    }
    if (/\blight\b/.test(q)) {
      return { matched: true, type: "update_settings", params: { theme: "light" }, confidence: 0.85 };
    }
  }
  if (!isQuestion && /\bmake\s+(?:the\s+)?text\s+(?:bigger|smaller|larger)\b/.test(q)) {
    return {
      matched: true,
      type: "update_settings", 
      params: { fontSize: /\b(bigger|larger)\b/.test(q) ? "lg" : "sm" },
      confidence: 0.85,
    };
  }

  // --- EXPORT DATA ---
  if (!isQuestion && /(?:export|backup|back\s*up|download)\s+(?:my\s+|all\s+|the\s+)?(?:data|backup|workspace|everything)/.test(q)) {
    return { matched: true, type: "export_data", params: {}, confidence: 0.85 };
  }

  return {
    matched: false,
    type: null,
    params: {},
    confidence: 0,
  };
}

// ============================================================
// Action Executors
// ============================================================

function findHabitByName(name: string): Habit | undefined {
  const data = storage.getData();
  const q = name.toLowerCase().trim();
  return data.habits.find(
    (h) =>
      h.name.toLowerCase().includes(q) ||
      q.includes(h.name.toLowerCase())
  );
}

function findTaskByTitle(title: string): Task | undefined {
  const data = storage.getData();
  const q = title.toLowerCase().trim();
  return data.tasks.find(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      q.includes(t.title.toLowerCase())
  );
}


// ============================================================
// Routine Builder - turns "make me a detailed morning routine"
// into a full set of concrete habits instead of one mangled name.
// ============================================================

interface RoutineStep {
  name: string;
  desc: string;
  timeOfDay: HabitTimeOfDay;
  icon: string;
  color: string;
}

function formatTime(h: number, min: string, ap: string): string {
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  const suffix = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${min} ${suffix}`;
}

function wakeTimeFrom(q: string): string {
  const wake = q.match(
    /(?:wake[sd]?\s+up|wake[sd]?|get\s+up|get\s+out\s+of\s+bed)\s*(?:at|by|around|@)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/
  );
  if (wake) return formatTime(parseInt(wake[1], 10), wake[2] || "00", wake[3] || "");
  const any = q.match(/\b(?:at|by|around|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (any) return formatTime(parseInt(any[1], 10), any[2] || "00", any[3] || "");
  return "7:00 AM";
}

function bedTimeFrom(q: string): string {
  const bed = q.match(
    /(?:sleep|bed|lights\s+out|asleep|wind[- ]?down)\s*(?:at|by|around|@)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/
  );
  if (bed) return formatTime(parseInt(bed[1], 10), bed[2] || "00", bed[3] || "");
  return "10:30 PM";
}

const ROUTINE_LABELS: Record<string, string> = {
  morning: "morning",
  evening: "evening",
  night: "evening",
  bedtime: "bedtime",
  sleep: "sleep",
  workout: "workout",
  exercise: "workout",
  fitness: "workout",
  study: "study",
  learning: "study",
  skincare: "skincare",
  "skin care": "skincare",
  reading: "reading",
  meditation: "meditation",
  daily: "daily",
};

function buildRoutineSteps(kind: string, wake: string, bed: string): RoutineStep[] {
  const amber = "#f59e0b";
  const indigo = "#6366f1";
  const green = "#10b981";
  const violet = "#a855f7";
  const rose = "#f43f5e";
  const sky = "#0ea5e9";

  switch (kind) {
    case "morning":
      return [
        { name: `Wake up at ${wake}`, desc: `Get out of bed at ${wake} sharp - no snooze, no phone check first.`, timeOfDay: "morning", icon: "🌅", color: amber },
        { name: "Drink a glass of water", desc: "Rehydrate before anything else - your body is dehydrated after sleep.", timeOfDay: "morning", icon: "💧", color: sky },
        { name: "Move your body", desc: "Stretch or exercise for 10-15 minutes to wake your body up.", timeOfDay: "morning", icon: "🧘", color: green },
        { name: "Plan your top 3 priorities", desc: "Decide what matters most today before the day takes over.", timeOfDay: "morning", icon: "🧠", color: indigo },
        { name: "Learn or read for 15 minutes", desc: "Feed your mind while it's still fresh and undistracted.", timeOfDay: "morning", icon: "📖", color: violet },
        { name: "Eat a proper breakfast", desc: "Fuel your body for a productive morning - protein beats sugar.", timeOfDay: "morning", icon: "🍳", color: amber },
      ];
    case "evening":
    case "night":
    case "bedtime":
    case "sleep":
      return [
        { name: `Start wind-down at ${bed}`, desc: `Begin relaxing at ${bed} - dim the lights, slow everything down.`, timeOfDay: "evening", icon: "🌇", color: indigo },
        { name: "No screens 30 minutes before bed", desc: "Blue light suppresses melatonin - put the phone away.", timeOfDay: "evening", icon: "📵", color: rose },
        { name: "Plan tomorrow's top 3", desc: "A clear tomorrow starts tonight - write it down.", timeOfDay: "evening", icon: "📝", color: violet },
        { name: "Tidy your space", desc: "Five minutes of tidying clears your head for sleep.", timeOfDay: "evening", icon: "🧹", color: sky },
        { name: "Journal for 5 minutes", desc: "Dump the day's thoughts so they don't keep you up.", timeOfDay: "evening", icon: "✍️", color: amber },
        { name: `Lights out by ${bed}`, desc: "Consistent bedtime = deeper, more restful sleep.", timeOfDay: "evening", icon: "😴", color: indigo },
      ];
    case "workout":
    case "exercise":
    case "fitness":
      return [
        { name: "Warm up", desc: "5-10 minutes of dynamic stretching before anything heavy.", timeOfDay: "morning", icon: "🤸", color: amber },
        { name: "Main workout", desc: "The core session - strength, cardio, or your sport of choice.", timeOfDay: "morning", icon: "🏋️", color: rose },
        { name: "Hydrate", desc: "Drink water through the session - don't wait until you're thirsty.", timeOfDay: "morning", icon: "💧", color: sky },
        { name: "Cool down & stretch", desc: "5 minutes of static stretching to recover faster.", timeOfDay: "morning", icon: "🧘", color: green },
        { name: "Log your session", desc: "Track what you did - progress lives in the data.", timeOfDay: "morning", icon: "📊", color: indigo },
        { name: "Rest & recover", desc: "Sleep and rest days are part of the program, not failures.", timeOfDay: "evening", icon: "😴", color: violet },
      ];
    case "study":
    case "learning":
      return [
        { name: "Review yesterday's notes", desc: "Start by recalling what you learned last session.", timeOfDay: "morning", icon: "📚", color: violet },
        { name: "Focused study block", desc: "One deep, distraction-free session - 45-60 minutes.", timeOfDay: "morning", icon: "🎯", color: indigo },
        { name: "Take a break", desc: "5-10 minutes away from the screen every hour.", timeOfDay: "afternoon", icon: "☕", color: amber },
        { name: "Summarize what you learned", desc: "Explain it in your own words - that's when it sticks.", timeOfDay: "afternoon", icon: "✍️", color: green },
        { name: "Plan tomorrow's session", desc: "Set one clear goal for the next study block.", timeOfDay: "evening", icon: "📝", color: sky },
      ];
    case "skincare":
      return [
        { name: "Cleanse your face", desc: "Wash with a gentle cleanser - morning and night.", timeOfDay: "morning", icon: "🧼", color: sky },
        { name: "Moisturize", desc: "Lock in hydration right after cleansing.", timeOfDay: "morning", icon: "🧴", color: amber },
        { name: "Sunscreen", desc: "Protect your skin from UV damage - every single day.", timeOfDay: "morning", icon: "☀️", color: rose },
        { name: "Night treatment", desc: "Serums or treatments while your skin repairs itself.", timeOfDay: "evening", icon: "🌙", color: indigo },
        { name: "Drink water", desc: "Great skin starts from the inside.", timeOfDay: "anytime", icon: "💧", color: green },
      ];
    case "meditation":
      return [
        { name: "Sit for 5 minutes", desc: "Start small - just breathe and be still.", timeOfDay: "morning", icon: "🧘", color: violet },
        { name: "Breathwork", desc: "Box breathing or 4-7-8 breathing to center yourself.", timeOfDay: "morning", icon: "🌬️", color: sky },
        { name: "Guided session", desc: "Use a timer or a guided meditation app.", timeOfDay: "afternoon", icon: "🎧", color: indigo },
        { name: "Reflect", desc: "Note how you feel after - watch the trend.", timeOfDay: "evening", icon: "📓", color: green },
      ];
    case "reading":
      return [
        { name: "Read 10 pages", desc: "A small daily reading goal that compounds.", timeOfDay: "evening", icon: "📖", color: amber },
        { name: "Note one idea", desc: "Capture one useful idea from every session.", timeOfDay: "evening", icon: "✍️", color: violet },
        { name: "Pick tomorrow's book", desc: "Always know what you're reading next.", timeOfDay: "evening", icon: "📚", color: sky },
        { name: "Read at a set time", desc: "Attach reading to an existing habit so it sticks.", timeOfDay: "evening", icon: "⏰", color: green },
      ];
    default:
      return [
        { name: "Start your day with intention", desc: "Set one clear goal the moment you wake up.", timeOfDay: "morning", icon: "🌅", color: amber },
        { name: "Drink enough water", desc: "Eight glasses through the day - keep a bottle nearby.", timeOfDay: "anytime", icon: "💧", color: sky },
        { name: "Move your body", desc: "Walk, stretch, or train - motion is medicine.", timeOfDay: "afternoon", icon: "🏃", color: green },
        { name: "Plan & review", desc: "Plan the day in the morning, review it in the evening.", timeOfDay: "evening", icon: "📝", color: indigo },
        { name: "Sleep on time", desc: `Aim for ${bed} - protect your rest like a meeting.`, timeOfDay: "evening", icon: "😴", color: violet },
      ];
  }
}

export function executeCreateRoutine(params: Record<string, any>): ActionResult<Habit[]> {
  const kind = String(params.kind || "daily");
  const q = String(params.query || "");
  const wake = wakeTimeFrom(q);
  const bed = bedTimeFrom(q);
  const steps = buildRoutineSteps(kind, wake, bed);
  const label = ROUTINE_LABELS[kind] || "daily";

  const created: Habit[] = [];
  for (const s of steps) {
    if (findHabitByName(s.name)) continue;
    created.push(
      storage.createHabit({
        name: s.name,
        description: s.desc,
        categoryId: "health",
        frequency: "daily",
        timeOfDay: s.timeOfDay,
        targetCount: 1,
        color: s.color,
        icon: s.icon,
      })
    );
  }

  if (!created.length) {
    return {
      success: true,
      message: `✅ Your **${label} routine** is already set up - every habit already exists in your workspace. Ask me to log any of them, or tweak them in the Habits tab.`,
    };
  }

  const list = created.map((h, i) => `${i + 1}. ${h.icon} **${h.name}**`).join("\n");
  return {
    success: true,
    message: `✅ I've built your **${label} routine** - ${created.length} new habit${created.length > 1 ? "s" : ""}:\n\n${list}\n\nTrack them daily and your streaks will grow. Want to tidy up older or duplicate habits? Just say "delete habit <name>".`,
    data: created,
  };
}

export function executeCreateHabit(params: Record<string, any>): ActionResult<Habit> {
  const name = params.name || "New Habit";
  const existing = findHabitByName(name);
  if (existing) {
    return {
      success: false,
      message: `You already have a habit called "${existing.name}"! It's currently on a ${calculateStreak(storage.getHabitLogDates(existing.id)).current}-day streak. Want to track it instead?`,
    };
  }
  const habit = storage.createHabit({
    name,
    description: params.description || `Track "${name}" daily`,
    categoryId: params.categoryId || "health",
    frequency: params.frequency || "daily",
    timeOfDay: params.timeOfDay || "anytime",
    targetCount: 1,
    color: params.color || "#a1a1aa",
    icon: params.icon || "\u2b50",
  });
  return {
    success: true,
    message: `✅ I've created a new habit: **${habit.name}** (${habit.frequency}). Start tracking today to build your streak!`,
    data: habit,
  };
}

export function executeLogHabit(params: Record<string, any>): ActionResult {
  const habitName = params.habitName || "";
  const date = params.date || getToday();
  const habit = findHabitByName(habitName);

  if (!habit) {
    // Suggest creating it
    return {
      success: false,
      message: `I couldn't find a habit called "${habitName}". Would you like me to create one for you? Just say "create habit ${habitName}".`,
    };
  }

  if (storage.isHabitLogged(habit.id, date)) {
    const streak = calculateStreak(storage.getHabitLogDates(habit.id));
    return {
      success: true,
      message: `✅ **${habit.name}** is already logged today! Current streak: ${streak.current} days (best: ${streak.longest}). Keep it up! 💪`,
    };
  }

  storage.logHabit(habit.id, date);
  const streak = calculateStreak(storage.getHabitLogDates(habit.id));
  return {
    success: true,
    message: `✅ Logged **${habit.name}** for today! ${
      streak.current > 0
        ? `Your streak is now **${streak.current} days** 🔥`
        : "That's day 1 of your streak! 🔥"
    }`,
  };
}

export function executeUnlogHabit(params: Record<string, any>): ActionResult {
  const habitName = params.habitName || "";
  const date = params.date || getToday();
  const habit = findHabitByName(habitName);

  if (!habit) {
    return {
      success: false,
      message: `I couldn't find a habit called "${habitName}".`,
    };
  }

  if (!storage.isHabitLogged(habit.id, date)) {
    return {
      success: false,
      message: `**${habit.name}** wasn't logged for today, so there's nothing to undo.`,
    };
  }

  storage.unlogHabit(habit.id, date);
  const streak = calculateStreak(storage.getHabitLogDates(habit.id));
  return {
    success: true,
    message: `↩️ Undid **${habit.name}** for today. ${
      streak.current > 0
        ? `Current streak: ${streak.current} days.`
        : "Your streak has been reset to 0. Don't worry, you can start again!"
    }`,
  };
}

export function executeDeleteHabit(params: Record<string, any>): ActionResult {
  const habitName = params.habitName || "";
  const habit = findHabitByName(habitName);

  if (!habit) {
    return {
      success: false,
      message: `I couldn't find a habit called "${habitName}". It may have been deleted already.`,
    };
  }

  storage.deleteHabit(habit.id);
  return {
    success: true,
    message: `🗑️ Permanently deleted **${habit.name}** and all its logs.`,
  };
}

export function executeCreateTask(params: Record<string, any>): ActionResult<Task> {
  const title = params.title || "New Task";
  const task = storage.createTask({
    title,
    description: params.description || "",
    status: "todo",
    priority: params.priority || "medium",
    dueDate: params.dueDate || null,
    dueTime: params.dueTime || null,
    completedAt: null,
    tags: params.tags || [],
    listId: params.listId || "inbox",
    projectId: null, recurring: "none",
    recurringEndDate: null,
    estimatedMinutes: null,
  });

  const priorityEmoji: Record<string, string> = {
    urgent: "🔴",
    high: "🟠",
    medium: "🔵",
    low: "⚪",
  };

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatISODate(tomorrow);
  const dueStr = params.dueDate
    ? ` (due ${
        params.dueDate === getToday()
          ? "today"
          : params.dueDate === tomorrowStr
          ? "tomorrow"
          : params.dueDate
      }${params.dueTime ? ` at ${params.dueTime}` : ""})`
    : "";
  return {
    success: true,
    message: `✅ New task created: ${priorityEmoji[params.priority] || "🔵"} **${task.title}**${dueStr}. Added to your inbox.`,
    data: task,
  };
}

export function executeCompleteTask(params: Record<string, any>): ActionResult {
  const taskTitle = params.taskTitle || "";
  const task = findTaskByTitle(taskTitle);

  if (!task) {
    return {
      success: false,
      message: `I couldn't find a task called "${taskTitle}". Try a different search term.`,
    };
  }

  if (task.status === "done") {
    // Toggle it back to todo
    storage.toggleTask(task.id);
    return {
      success: true,
      message: `↩️ Moved **${task.title}** back to your todo list.`,
    };
  }

  storage.toggleTask(task.id);
  return {
    success: true,
    message: `✅ **${task.title}** is done! Great progress! 🎉`,
  };
}

export function executeDeleteTask(params: Record<string, any>): ActionResult {
  const taskTitle = params.taskTitle || "";
  const task = findTaskByTitle(taskTitle);

  if (!task) {
    return {
      success: false,
      message: `I couldn't find a task called "${taskTitle}".`,
    };
  }

  storage.deleteTask(task.id);
  return {
    success: true,
    message: `🗑️ Deleted **${task.title}** from your tasks.`,
  };
}

export function executeCreateJournal(params: Record<string, any>): ActionResult<JournalEntry> {
  const date = params.date || getToday();

  // Check if entry already exists for today
  const existing = storage.getJournalEntry(date);
  if (existing) {
    // Append to existing entry
    const updatedContent = existing.content + "\n\n---\n" + params.content;
    storage.updateJournalEntry(existing.id, {
      content: updatedContent,
      title: existing.title,
    });
    return {
      success: true,
      message: `📝 Added to your existing journal entry for today. You now have a rich record of thoughts! Reflection is powerful.`,
      data: existing,
    };
  }

  const entry = storage.createJournalEntry({
    date,
    title: params.title || `${getToday()} Journal Entry`,
    content: params.content || "Reflecting on today...",
    mood: params.mood || "neutral",
    gratitude: params.gratitude || [],
    reflectionPrompts: [],
  });

  return {
    success: true,
    message: `📝 Journal entry created for today! You're feeling **${entry.mood}**. Writing things down makes everything clearer. ✨`,
    data: entry,
  };
}

export function executeCreateNote(params: Record<string, any>): ActionResult<Note> {
  const note = storage.createNote({
    title: params.title || "Untitled Document",
    content: params.content || "",
    contentHtml: params.content || "",
    folderId: params.folderId || "general",
    projectId: null, tags: params.tags || [],
    pinned: false,
    archived: false,
    favorite: false,
      });

  return {
    success: true,
    message: `📓 Created a new document: **${note.title}**. You can find it in your Documents section.`,
    data: note,
  };
}

// ============================================================
// Orleia Office actions: Calendar / Forms / Board
// ============================================================

export function executeCreateEvent(params: Record<string, any>): ActionResult {
  const ev = storage.addCalendarEvent({
    title: params.title || "Untitled event",
    date: params.date || getToday(),
    time: params.time || null,
    color: "#6366f1",
    repeat: "none",
    notes: "",
  });
  return {
    success: true,
    message: `📅 Scheduled **${ev.title}** on ${ev.date}${ev.time ? ` at ${ev.time}` : ""}. You'll find it in Calendar.`,
    data: ev,
  };
}

export function executeCreateForm(params: Record<string, any>): ActionResult {
  const subject = params.subject || "Untitled form";
  const form = storage.addForm({
    title: subject,
    description: "",
    questions: [
      { id: Math.random().toString(36).slice(2), type: "text", label: "Your feedback", options: [], required: false },
      { id: Math.random().toString(36).slice(2), type: "rating", label: `How would you rate ${subject.toLowerCase()}?`, options: [], required: false },
    ],
  });
  return {
    success: true,
    message: `📋 Created form **${form.title}** with 2 starter questions. Open Forms to edit it and share the link.`,
    data: form,
  };
}

export function executeCreateBoard(params: Record<string, any>): ActionResult {
  const board = storage.addBoard({
    name: params.subject || "Untitled board",
    stickies: [],
    shapes: [],
    projectId: null,
  });
  return {
    success: true,
    message: `🎨 Created board **${board.name}**. Open Board to start adding stickies and sketches — or ask me to brainstorm ideas onto it.`,
    data: board,
  };
}

export function executeUpdateHabit(params: Record<string, any>): ActionResult {
  const habitName = params.habitName || "";
  const habit = findHabitByName(habitName);

  if (!habit) {
    return {
      success: false,
      message: `I couldn't find a habit called "${habitName}".`,
    };
  }

  const change = (params.change || "").toLowerCase();
  const updates: Partial<Habit> = {};

  // Detect what the user wants to change
  if (/daily|every day/i.test(change)) updates.frequency = "daily";
  else if (/weekly|every week/i.test(change)) updates.frequency = "weekly";
  
  if (/morning/i.test(change)) updates.timeOfDay = "morning";
  else if (/afternoon/i.test(change)) updates.timeOfDay = "afternoon";
  else if (/evening/i.test(change)) updates.timeOfDay = "evening";

  storage.updateHabit(habit.id, updates);
  const changedParts = Object.keys(updates).length > 0 
    ? ` (${Object.keys(updates).join(", ")} updated)` 
    : "";
  return {
    success: true,
    message: `✏️ Updated **${habit.name}**${changedParts}. Anything else you'd like to change?`,
    data: { ...habit, ...updates },
  };
}

export function executeUpdateTask(params: Record<string, any>): ActionResult {
  const taskTitle = params.taskTitle || "";
  const task = findTaskByTitle(taskTitle);

  if (!task) {
    return {
      success: false,
      message: `I couldn't find a task called "${taskTitle}".`,
    };
  }

  const updates: Partial<Task> = {};
  let changeDesc = "";

  if (params.priority) {
    updates.priority = params.priority;
    changeDesc = ` priority changed to ${params.priority}`;
  }

  // Check if the change text implies completion
  if ((params.change || "").toLowerCase().includes("done") || 
      (params.change || "").toLowerCase().includes("complete")) {
    updates.status = "done";
    updates.completedAt = new Date().toISOString();
    changeDesc = " marked as done";
  }

  if (Object.keys(updates).length === 0) {
    return {
      success: true,
      message: `I see you want to change **${task.title}**. Could you be more specific about what to update? (priority, due date, status)`,
    };
  }

  storage.updateTask(task.id, updates);
  return {
    success: true,
    message: `✏️ Updated **${task.title}**${changeDesc}.`,
    data: { ...task, ...updates },
  };
}

export function executeDeleteNote(params: Record<string, any>): ActionResult {
  const noteTitle = params.noteTitle || "";
  const data = storage.getData();
  const q = noteTitle.toLowerCase();
  const note = data.notes.find(
    (n) =>
      n.title.toLowerCase().includes(q) ||
      q.includes(n.title.toLowerCase())
  );

  if (!note) {
    return {
      success: false,
      message: `I couldn't find a document called "${noteTitle}".`,
    };
  }

  storage.deleteNote(note.id);
  return {
    success: true,
    message: `🗑️ Deleted note: **${note.title}**.`,
  };
}

export function executeUpdateSettings(params: Record<string, any>): ActionResult {
  if (params.theme) {
    storage.updateTheme({ theme: params.theme });
    return {
      success: true,
      message:
        params.theme === "dark"
          ? "🌙 Switched to dark mode."
          : "☀️ Switched to light mode.",
    };
  }
  if (params.fontSize) {
    storage.updateTheme({ fontSize: params.fontSize });
    return {
      success: true,
      message:
        params.fontSize === "lg"
          ? "🔍 Text size increased."
          : "🔽 Text size decreased.",
    };
  }
  return { success: false, message: "What would you like to change?" };
}

export function executeExportData(): ActionResult {
  try {
    const json = JSON.stringify(storage.getData(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "orleia-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return {
      success: true,
      message: "📦 Your full Orleia workspace was exported as **orleia-backup.json**.",
    };
  } catch {
    return { success: false, message: "Export failed. Try Settings → Export instead." };
  }
}
export function executeNavigate(params: Record<string, any>): ActionResult {
  const page = params.page;
  if (!page) return { success: false, message: "Where would you like to go?" };
  // Full app map: nav items + Office tools + aliases for anything the user
  // might naturally call these (incl. the old Lexis-era names).
  const validPages: Record<string, string> = {
    "dashboard": "dashboard", "home": "dashboard",
    "habits": "habits", "journal": "journal", "mindfulness": "journal", "wellness": "journal",
    "tasks": "tasks", "todos": "tasks", "todo": "tasks",
    "notes": "notes", "note": "notes",
    "documents": "documents", "docs": "documents", "document": "documents",
    "deck": "deck", "decks": "deck", "presentations": "deck", "slides": "deck",
    "calendar": "calendar", "events": "calendar",
    "noor": "noor", "chat": "noor", "ai": "noor",
    "settings": "settings",
  };
  const norm = String(page).toLowerCase().trim();
  const target = validPages[norm];
  if (!target) return { success: false, message: "I don't know where \"" + page + "\" is. Try: dashboard, habits, journal, tasks, notes, documents, deck, calendar, noor, or settings." };
  if (typeof window !== "undefined") {
    window.location.href = target === "dashboard" ? "/" : "/" + target;
  }
  return { success: true, message: "Navigating to " + target + "..." };
}

export function executeSearch(params: Record<string, any>): ActionResult {
  const query = params.query || "";
  const data = storage.getData();
  const q = query.toLowerCase();

  const results: string[] = [];

  const matchingNotes = data.notes.filter(
    (n) =>
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q)
  );
  if (matchingNotes.length > 0) {
    results.push(
      `📓 **Documents:** ${matchingNotes.length} match${matchingNotes.length > 1 ? "es" : ""}`
    );
    matchingNotes.slice(0, 3).forEach((n) => {
      results.push(`   • ${n.title} - ${n.content.slice(0, 80)}...`);
    });
  }

  const matchingTasks = data.tasks.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
  );
  if (matchingTasks.length > 0) {
    results.push(
      `🎯 **Tasks:** ${matchingTasks.length} match${matchingTasks.length > 1 ? "es" : ""}`
    );
    matchingTasks.slice(0, 3).forEach((t) => {
      results.push(`   • ${t.title} (${t.status})`);
    });
  }

  const matchingJournal = data.journalEntries.filter(
    (e) =>
      e.content.toLowerCase().includes(q) ||
      e.title.toLowerCase().includes(q)
  );
  if (matchingJournal.length > 0) {
    results.push(
      `📝 **Journal:** ${matchingJournal.length} match${matchingJournal.length > 1 ? "es" : ""}`
    );
  }

  const matchingHabits = data.habits.filter((h) =>
    h.name.toLowerCase().includes(q)
  );
  if (matchingHabits.length > 0) {
    results.push(
      `💪 **Habits:** ${matchingHabits.length} match${matchingHabits.length > 1 ? "es" : ""}`
    );
  }

  if (results.length === 0) {
    return {
      success: true,
      message: `🔍 I searched across notes, tasks, journal entries, and habits for "${query}" - no matches found. Try different keywords?`,
    };
  }

  return {
    success: true,
    message: `🔍 **Search results for "${query}":**\n\n${results.join("\n")}`,
  };
}

// ============================================================
// Main Action Executor - routes detected actions to executors
// ============================================================

// Relationship tiers gate what Noor may actually do, matching the role
// shown in onboarding/settings. This runs for every action (client-side
// intent detection AND LLM tool-call blocks), so the tier is enforced
// regardless of how the action arrives.
const READ_ONLY_TYPES: ActionType[] = ["search_data", "export_data", "read_data"];
const DESTRUCTIVE_TYPES: ActionType[] = ["delete_habit", "delete_task", "delete_note", "unlog_habit"];
const OPERATOR_ONLY_TYPES: ActionType[] = ["update_settings"];

function relationshipDenied(action: AIAction): ActionResult | null {
  const rel = storage.getNoorRelationship();
  const type = action.type;
  if (!type) return null;
  if (rel === "observer" && !READ_ONLY_TYPES.includes(type)) {
    return {
      success: false,
      message:
        "As an Observer, I only watch - I never make changes to your workspace. Change my role to Assistant or Operator in Settings if you'd like me to act.",
    };
  }
  if (rel === "assistant" && (DESTRUCTIVE_TYPES.includes(type) || OPERATOR_ONLY_TYPES.includes(type))) {
    return {
      success: false,
      message:
        "As an Assistant, I don't delete or undo things or change settings on my own. Switch me to Operator in Settings if you'd like me to.",
    };
  }
  return null;
}

export function executeAction(action: AIAction): ActionResult {
  const denied = relationshipDenied(action);
  if (denied) return denied;
  switch (action.type) {
    case "create_routine":
      return executeCreateRoutine(action.params);
    case "create_habit":
      return executeCreateHabit(action.params);
    case "log_habit":
      return executeLogHabit(action.params);
    case "unlog_habit":
      return executeUnlogHabit(action.params);
    case "delete_habit":
      return executeDeleteHabit(action.params);
    case "create_task":
      return executeCreateTask(action.params);
    case "complete_task":
      return executeCompleteTask(action.params);
    case "delete_task":
      return executeDeleteTask(action.params);
    case "create_journal":
      return executeCreateJournal(action.params);
    case "create_note":
      return executeCreateNote(action.params);
    case "update_habit":
      return executeUpdateHabit(action.params);
    case "update_task":
      return executeUpdateTask(action.params);
    case "delete_note":
      return executeDeleteNote(action.params);
    case "search_data":
      return executeSearch(action.params);
    case "update_settings":
      return executeUpdateSettings(action.params);
    case "create_event":
      return executeCreateEvent(action.params);
    case "create_form":
      return executeCreateForm(action.params);
    case "create_board":
      return executeCreateBoard(action.params);
    case "export_data":
    case "navigate":
      return executeNavigate(action.params);
      return executeExportData();
    case "navigate":
      return executeNavigate(action.params);
    default:
      return {
        success: false,
        message: "I'm not sure what action to take. Could you rephrase that?",
      };
  }
}

// ============================================================
// JSON Action Interceptor - if the LLM ever replies with a bare
// JSON "tool call" instead of natural text, catch it, execute it
// for real, and return a natural confirmation. The user must
// never see raw JSON.
// ============================================================

const ACTION_TYPES: ActionType[] = [
  "create_routine", "create_habit", "log_habit", "unlog_habit", "delete_habit", "update_habit",
  "create_task", "complete_task", "update_task", "delete_task",
  "create_journal", "update_journal",
  "create_note", "update_note", "delete_note",
  "search_data", "export_data", "read_data", "update_settings",
  "create_event", "create_form", "create_board",
];

function isActionType(v: string): v is ActionType {
  return (ACTION_TYPES as string[]).includes(v);
}

/**
 * The action-marker constants and clean-up helpers live in action-clean.ts
 * (dependency-free) so the storage layer can use them without an import
 * cycle. Re-exported here so existing callers keep working.
 */
import {
  ACTION_MARKER_VARIANTS,
  ACTION_MARKER_RE,
  ACTION_BLOCK_RE,
  stripActionRemnants,
  sanitizeStoredReply,
  looksLikeReasoning,
} from "./action-clean";
export {
  ACTION_MARKER_VARIANTS,
  ACTION_MARKER_RE,
  ACTION_BLOCK_RE,
  stripActionRemnants,
  looksLikeReasoning,
  sanitizeStoredReply,
};

/**
 * Scan a reply for embedded ORLEIA_ACTION { ... } blocks (the LLM's tool
 * contract: it emits one line to request an action, then a confirmation
 * sentence). Execute every block for real and return the reply with each
 * block replaced by its natural confirmation message - so the user never
 * sees raw JSON and the action actually happens. Returns null when the
 * reply contains no action block.
 */
export function processActionReply(reply: string): string | null {
  if (!reply || !reply.trim()) return null;
  const marker = ACTION_BLOCK_RE;
  const executed: ExecutedAction[] = [];
  const processed = reply.replace(marker, (block, json: string) => {
    const r = executeJsonAction(json);
    if (!r) return ""; // unparseable - drop the raw block
    executed.push(r);
    return ""; // rebuilt below: inline confirmation (1) or one summary (bulk)
  });
  if (executed.length === 0) return null;
  const base = processed.replace(/\n{3,}/g, "\n\n").trim()
    .replace(/\s*(?:done|ok(?:ay)?|there you go|here you go|all set|perfect)\s*[.!]*$/i, "");
  if (executed.length === 1) {
    const r = executed[0];
    const confirm = r.success ? r.message : "I tried to do that, but: " + r.message;
    return base ? base + "\n\n" + confirm : confirm;
  }
  return base ? base + "\n\n" + buildActionSummary(executed) : buildActionSummary(executed);
}

const ACTION_VERB: Record<string, string> = {
  create_habit: "created",
  create_task: "created",
  create_note: "created",
  create_journal: "created",
  create_event: "scheduled",
  create_form: "created",
  create_board: "created",
  create_routine: "created",
  log_habit: "logged",
  unlog_habit: "unlogged",
  complete_task: "completed",
  update_habit: "updated",
  update_task: "updated",
  update_journal: "updated",
  update_note: "updated",
  update_settings: "updated",
  delete_habit: "deleted",
  delete_task: "deleted",
  delete_note: "deleted",
  export_data: "exported",
  search_data: "searched",
  read_data: "read",
};

const ACTION_NOUN: Record<string, string> = {
  create_habit: "habit",
  create_task: "task",
  create_note: "note",
  create_journal: "journal entry",
  create_event: "calendar event",
  create_form: "form",
  create_board: "board",
  create_routine: "routine",
  log_habit: "habit",
  unlog_habit: "habit",
  complete_task: "task",
  update_habit: "habit",
  update_task: "task",
  update_journal: "journal entry",
  update_note: "note",
  update_settings: "setting",
  delete_habit: "habit",
  delete_task: "task",
  delete_note: "note",
  export_data: "data export",
  search_data: "search",
  read_data: "item",
};

function countNoun(n: number, label: string): string {
  return n + " " + label + (n === 1 ? "" : "s");
}

/**
 * One compact confirmation for bulk action replies (2+ executed blocks) -
 * "Done! I've created 6 habits and 4 tasks." instead of a wall of raw
 * per-item confirmations pasted back at the user.
 */
function buildActionSummary(executed: ExecutedAction[]): string {
  const done = executed.filter((e) => e.success);
  const failed = executed.filter((e) => !e.success);

  const byVerb = new Map<string, Map<string, number>>();
  for (const e of done) {
    const verb = ACTION_VERB[e.type || ""] || "completed";
    const label = ACTION_NOUN[e.type || ""] || "item";
    let labels = byVerb.get(verb);
    if (!labels) {
      labels = new Map();
      byVerb.set(verb, labels);
    }
    labels.set(label, (labels.get(label) || 0) + 1);
  }

  const parts: string[] = [];
  for (const [verb, labels] of byVerb) {
    const labelParts: string[] = [];
    for (const [label, n] of labels) labelParts.push(countNoun(n, label));
    parts.push(verb + " " + labelParts.join(" and "));
  }

  let msg = parts.length
    ? "Done! ✅ I've " + parts.join(", ") + "."
    : "I couldn't complete those actions.";

  if (failed.length > 0) {
    msg +=
      " " +
      (failed.length === 1
        ? "One item was skipped - it already existed or wasn't found."
        : failed.length + " items were skipped - they already existed or weren't found.");
  }
  return msg;
}

/**
 * Normalizes a spoken or loose time value into "HH:MM" ("morning" -> "09:00",
 * "5pm" -> "17:00", "9:30am" -> "09:30"). Unknown values pass through.
 */
function normalizeTime(v: string): string {
  const s = String(v).trim().toLowerCase();
  const words: Record<string, string> = {
    morning: "09:00",
    "in the morning": "09:00",
    noon: "12:00",
    midday: "12:00",
    afternoon: "14:00",
    "in the afternoon": "14:00",
    evening: "18:00",
    "in the evening": "18:00",
    night: "21:00",
    "at night": "21:00",
    midnight: "00:00",
    anytime: "anytime",
  };
  if (words[s]) return words[s];
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    const ap = m[3];
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    // No am/pm: keep the value as-is, so valid 24h times ("17:00") pass
    // through unchanged instead of being mangled to 12h.
    if (h > 23 || min > 59) return v;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  return v;
}

/**
 * Replace placeholder values the model sometimes emits (e.g. "<tomorrow's
 * YYYY-MM-DD>", "<today>", "<HH:MM>") with real computed values, so a task
 * created from a ORLEIA_ACTION block always gets an actual date, not a
 * literal string the user would see in their Tasks list.
 */
function resolvePlaceholders(json: string): string {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date();
  dayAfter.setDate(dayAfter.getDate() + 2);
  const isoToday = iso(today);
  const isoTomorrow = iso(tomorrow);
  const isoDayAfter = iso(dayAfter);
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return json
    .replace(/<today(?:'s)?\s*(?:YYYY-MM-DD)?\s*>/gi, isoToday)
    .replace(/<tomorrow(?:'s)?\s*(?:YYYY-MM-DD)?\s*>/gi, isoTomorrow)
    .replace(/<day\s+after\s+tomorrow(?:'s)?\s*(?:YYYY-MM-DD)?\s*>/gi, isoDayAfter)
    .replace(new RegExp("<(next\\s+)?(" + dayNames.join("|") + ")(?:'s)?\\s*(?:YYYY-MM-DD)?\\s*>", "gi"), (m, nxt, day) => {
      const d = new Date();
      const target = dayNames.indexOf(day.toLowerCase());
      let diff = (target - d.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      d.setDate(d.getDate() + diff);
      return iso(d);
    })
    .replace(
      /("(?:timeOfDay|dueTime)"\s*:\s*")([^"]*)(")/gi,
      (_m: string, pre: string, val: string, post: string) => pre + normalizeTime(val) + post
    );
}

export interface ExecutedAction {
  success: boolean;
  type: ActionType | null;
  params: Record<string, any>;
  message: string;
  data?: any;
}

/** A model-proposed action that has NOT run yet — rendered as a confirm chip. */
export interface ProposedAction {
  action: ActionType;
  params: Record<string, any>;
}

/**
 * Execute one JSON action payload for real. Returns null when the payload
 * cannot be parsed as a valid action; otherwise the structured outcome
 * (success flag, action type, params, and the natural confirmation text).
 */
export function executeJsonAction(reply: string): ExecutedAction | null {
  if (!reply || !reply.trim()) return null;
  let text = reply.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!text.startsWith("{")) return null;
  text = resolvePlaceholders(text);

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  let actionType: ActionType | null = null;
  let params: Record<string, any> = {};

  if (parsed.action && parsed.params && typeof parsed.params === "object") {
    const a = String(parsed.action);
    if (!isActionType(a)) return null;
    actionType = a;
    params = parsed.params;
  } else {
    // params-only payload - infer the action from its keys
    if (parsed.frequency || parsed.timeOfDay || parsed.category) {
      actionType = "create_habit";
    } else if (parsed.title && (parsed.priority !== undefined || parsed.dueDate !== undefined)) {
      actionType = "create_task";
    } else if (parsed.title && parsed.mood !== undefined) {
      actionType = "create_journal";
    } else if (parsed.title && parsed.content !== undefined) {
      actionType = "create_note";
    } else if (parsed.content) {
      actionType = "create_note";
    } else {
      return null;
    }
    params = parsed;
  }

  const result = executeAction({
    matched: true,
    type: actionType,
    params,
    confidence: 1,
  });
  return {
    success: result.success,
    type: actionType,
    params,
    message: result.message,
    data: result.data,
  };
}

/**
 * Parse one ORLEIA_ACTION JSON payload WITHOUT executing it — used by the
 * confirm-chips flow: the model proposes, the user confirms with one tap.
 * Returns enough info to render a chip and to execute later, or null.
 */
export function parseActionPayload(reply: string): ProposedAction | null {
  if (!reply || !reply.trim()) return null;
  let text = reply.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!text.startsWith("{")) return null;
  text = resolvePlaceholders(text);
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  let actionType: ActionType | null = null;
  let params: Record<string, any> = {};
  if (parsed.action && parsed.params && typeof parsed.params === "object") {
    const a = String(parsed.action);
    if (!isActionType(a)) return null;
    actionType = a;
    params = parsed.params;
  } else {
    if (parsed.frequency || parsed.timeOfDay || parsed.category) {
      actionType = "create_habit";
    } else if (parsed.title && (parsed.priority !== undefined || parsed.dueDate !== undefined)) {
      actionType = "create_task";
    } else if (parsed.title && parsed.mood !== undefined) {
      actionType = "create_journal";
    } else if (parsed.title && parsed.content !== undefined) {
      actionType = "create_note";
    } else if (parsed.content) {
      actionType = "create_note";
    } else {
      return null;
    }
    params = parsed;
  }
  return { action: actionType, params };
}

/**
 * Legacy string wrapper: returns the natural confirmation for one action
 * payload, or null when it is not a valid action payload.
 */
export function tryExecuteJsonAction(reply: string): string | null {
  const r = executeJsonAction(reply);
  if (!r) return null;
  return r.success ? r.message : "I tried to do that, but: " + r.message;
}
