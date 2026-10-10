"use client";

import { storage } from "./storage";
import { petById } from "./pets";
import { petStage } from "./pet-habits";
import { getSituationPayload } from "@/lib/graph/engine";
import { getToday, calculateStreak, getMoodScore } from "./utils";
import { NoorCapError } from "./noor-cap";
import { usageLine, setNoorUsage } from "./noor-usage";
import { buildSkillsBlock } from "./noor-skills";
import { Habit, Task, JournalEntry, Note, AIMessage, AIModel } from "@/types";
import {
  detectAction,
  executeAction,
  tryExecuteJsonAction,
  processActionReply,
  stripActionRemnants,
  looksLikeReasoning,
  ACTION_MARKER_RE,
} from "./ai-actions";
import { MODEL_PROFILES, ModelProfile, DEFAULT_MODEL } from "./ai-models";
import { executeNavigate } from "./ai-actions";
import { buildMemoryContext, saveMemory, extractFactsFromMessages } from "./noor-memory";
import { buildSearchBlock, isLiveQuery } from "./web-search";
import type { AISource } from "@/types";
import { countFactInstruction } from "./count-guard";
import { getDeviceId } from "./device-id";

const FALLBACK_MODELS: Record<string, string[]> = {
  "nvidia/nemotron-3-super-120b-a12b": [
    "nvidia/nemotron-3-ultra-550b-a55b",
    "nvidia/nemotron-3.5-lightning-30b-a3b",
  ],
  // Live model first on retry: super-120b is EOL'd/flapping (2026-10),
  // so it's the LAST resort, not the first hop after a 503.
  "nvidia/nemotron-3-ultra-550b-a55b": ["nvidia/nemotron-3.5-lightning-30b-a3b", "nvidia/nemotron-3-super-120b-a12b"],
  "nvidia/nemotron-3.5-lightning-30b-a3b": ["nvidia/nemotron-3-ultra-550b-a55b", "nvidia/nemotron-3-super-120b-a12b"],
};
import { jailbreakOverride, jailbreakQueryReplacement } from "./jailbreak-guard";

// ============================================================
// Context Builder
// ============================================================

interface DataContext {
  summary: string;
  habits: { name: string; streak: number; logged: boolean }[];
  overdueTasks: number;
  pendingTasks: number;
  todayJournal: boolean;
  recentMood: string;
  notesCount: number;
  totalCompletions: number;
}

function buildDataContext(depth: "shallow" | "moderate" | "deep"): DataContext {
  const data = storage.getData();
  const today = getToday();

  // Base info (always included)
  const habits = data.habits
    .filter((h) => !h.archived)
    .map((h) => ({
      name: h.name,
      streak: calculateStreak(storage.getHabitLogDates(h.id)).current,
      logged: storage.isHabitLogged(h.id, today),
    }));

  const activeHabits = habits.length;
  const todayLogs = data.habitLogs.filter((l) => l.date === today).length;
  const pendingTasks = data.tasks.filter((t) => t.status !== "done").length;
  const overdueTasks = data.tasks.filter(
    (t) => t.status !== "done" && t.dueDate && t.dueDate < today
  ).length;

  // Moderate/deep additions
  let recentMood = "neutral";
  let notesCount = data.notes.length;
  let todayJournal = data.journalEntries.some((e) => e.date === today);
  let totalCompletions = 0;

  if (depth !== "shallow") {
    const recentEntries = data.journalEntries.slice(0, 7);
    if (recentEntries.length > 0) {
      const avgScore =
        recentEntries.reduce((sum, e) => sum + getMoodScore(e.mood), 0) /
        recentEntries.length;
      recentMood =
        avgScore >= 75 ? "positive" : avgScore >= 50 ? "neutral" : "low";
    }
    totalCompletions = data.habitLogs.length;
  }

  // Deep additions
  let summary = `You have ${activeHabits} active habit${activeHabits !== 1 ? "s" : ""}`;
  if (depth === "deep") {
    const bestHabit = habits
      .filter((h) => h.streak > 0)
      .sort((a, b) => b.streak - a.streak)[0];
    if (bestHabit) {
      summary += `, with your best streak being "${bestHabit.name}" at ${bestHabit.streak} days`;
    }
    const categoryCount = new Set(
      data.habits.filter((h) => !h.archived).map((h) => h.categoryId)
    ).size;
    summary += ` across ${categoryCount} categor${categoryCount !== 1 ? "ies" : "y"}.`;
  } else {
    summary += ".";
  }

  summary += ` ${todayLogs} habit${todayLogs !== 1 ? "s" : ""} logged today.`;
  summary += ` ${pendingTasks} pending task${pendingTasks !== 1 ? "s" : ""}`;
  if (overdueTasks > 0) {
    summary += ` (${overdueTasks} overdue)`;
  }
  summary += ".";

  if (depth !== "shallow") {
    summary += ` ${totalCompletions} total habit check-ins.`;
    if (todayJournal) summary += ` Journal written today.`;
    summary += ` Recent mood: ${recentMood}.`;
  }

  if (depth === "deep") {
    const completedToday = data.tasks.filter(
      (t) => t.status === "done" && t.completedAt?.startsWith(today)
    ).length;
    summary += ` ${completedToday} task${completedToday !== 1 ? "s" : ""} completed today.`;
    summary += ` ${notesCount} total documents.`;
    summary += ` ${data.journalEntries.length} total journal entries.`;

    // Add habit-specific deep insights
    const topHabits = habits
      .sort((a, b) => b.streak - a.streak)
      .slice(0, 3);
    if (topHabits.length > 0) {
      summary += ` Top habits by streak: ${topHabits
        .map((h) => `${h.name} (${h.streak}d)`)
        .join(", ")}.`;
    }
  }

  return {
    summary,
    habits,
    overdueTasks,
    pendingTasks,
    todayJournal,
    recentMood,
    notesCount,
    totalCompletions,
  };

  // Orleia Office awareness (calendar) — appended to the
  // summary at every depth so Noor always knows these apps exist.
  const eventCount = (data.calendarEvents || []).length;
  if (eventCount) {
    summary += ` Their Orleia Office contains ${eventCount} calendar event${eventCount !== 1 ? "s" : ""}.`;
  }
  summary += ` You can create calendar events ("schedule a meeting friday") on request.`;
}

// ============================================================
// Response Generator - per model
// ============================================================

function detectIntent(
  query: string
): "summary" | "habits" | "tasks" | "journal" | "notes" | "plan" | "motivation" | "search" | "general" | "greeting" | "followup" | "gratitude" | "goals" | "reflection" | "navigate" {
  const q = query.toLowerCase().trim();

  // Greeting detection - expanded with more casual greetings
  if (
    /^(hi|hello|hey|yo|sup|good morning|good afternoon|good evening|howdy|what's up|hey there|greetings|howdy|hola|hiya|heya)/i.test(
      q
    )
  ) {
    return "greeting";
  }

  // Follow-up detection - broader patterns, longer queries allowed
  if (
    /^(what|how|why|can you|could you|tell me|explain|elaborate|continue|go on|and|so|more|again|also|anyway|furthermore|additionally|besides)/i.test(
      q
    ) &&
    q.split(/\s+/).length <= 8
  ) {
    return "followup";
  }

  // Gratitude-specific detection (new category)
  if (
    /(grateful|gratitude|thankful|blessed|appreciate|thank|thanks|gratitude list)/i.test(q)
  )
    return "gratitude";

  // Goals & aspirations (new category)
  if (
    /(goal|aspiration|dream|ambition|resolution|new year|intention|want to achieve|aim|objective)/i.test(q)
  )
    return "goals";

  // Reflection & deep thinking (new category)
  if (
    /(reflect|think about|ponder|contemplate|consider|lesson|learned|realize|realization|perspective|mindset)/i.test(q)
  )
    return "reflection";

  if (
    /(habit|streak|routine|daily|weekly|consistency|track|check.?in|log|build|morning routine)/i.test(q) &&
    !/(task|note|journal)/i.test(q)
  )
    return "habits";
  if (
    /(task|todo|deadline|overdue|priority|complete|assign|checklist|errand|grocery|shopping list)/i.test(q) &&
    !/(habit|note|journal)/i.test(q)
  )
    return "tasks";
  if (
    /(journal|mood|feeling|emotion|write|entry|dear diary|reflect on|how.*feel)/i.test(q) &&
    !/(task|note|habit)/i.test(q)
  )
    return "journal";
  if (
    /(note|find|search|document|write.*down|idea|thought|brainstorm|draft|outline|scribble)/i.test(q) &&
    !/(habit|task|journal)/i.test(q)
  )
    return "notes";
  if (
    /(plan|goal|suggest|recommend|advise|strategy|improve|better|optimize|roadmap|blueprint|system|method)/i.test(
      q
    )
  )
    return "plan";
  if (
    /(motivat|inspire|encourage|keep going|progress|well done|proud|amazing|push|determination|hustle|grind|keep it up|you can|believe)/i.test(
      q
    )
  )
    return "motivation";
  if (
    /(summary|overview|report|dashboard|status|how.*day|how.*week|how.*month|what.*happened|rundown|recap|breakdown|tell me about my)/i.test(
      q
    )
  )
    return "summary";
  if (
    /(search|find.*about|.*about.*note|.*about.*task|.*about.*habit|locate|where.*note|show.*note|find.*note)/i.test(q)
  )
    return "search";

  return "general";
}

function getConversationMemory(
  history: AIMessage[],
  maxMessages: number
): string {
  if (!history || history.length === 0) return "";

  const recent = history.slice(-maxMessages);
  const parts: string[] = [];

  for (const msg of recent) {
    const prefix = msg.role === "user" ? "User" : "You";
    // Truncate long messages for the memory context
    const content =
      msg.content.length > 200
        ? msg.content.slice(0, 200) + "..."
        : msg.content;
    parts.push(`${prefix}: ${content}`);
  }

  return parts.join("\n");
}

function searchUserData(query: string, depth: "shallow" | "moderate" | "deep") {
  const data = storage.getData();
  const q = query.toLowerCase();
  const results: string[] = [];

  // Always search notes
  const matchingNotes = data.notes.filter(
    (n) =>
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q)
  );
  if (matchingNotes.length > 0) {
    results.push(
      `Found ${matchingNotes.length} matching document${matchingNotes.length > 1 ? "s" : ""}`
    );
    if (depth !== "shallow") {
      matchingNotes.slice(0, 3).forEach((n) => {
        results.push(`- "${n.title}": ${n.content.slice(0, 100)}...`);
      });
    }
  }

  // Moderate/deep: also search tasks and journal
  if (depth !== "shallow") {
    const matchingTasks = data.tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
    if (matchingTasks.length > 0) {
      results.push(
        `Found ${matchingTasks.length} matching task${matchingTasks.length > 1 ? "s" : ""}`
      );
      if (depth === "deep") {
        matchingTasks.slice(0, 3).forEach((t) => {
          results.push(`- "${t.title}" (${t.status})`);
        });
      }
    }

    const matchingJournal = data.journalEntries.filter(
      (e) =>
        e.content.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q)
    );
    if (matchingJournal.length > 0) {
      results.push(
        `Found ${matchingJournal.length} matching journal entr${matchingJournal.length > 1 ? "ies" : "y"}`
      );
    }
  }

  return results;
}

function generateGreeting(
  history: AIMessage[],
  model: ModelProfile
): string {
  const data = storage.getData();
  const todayHabits = data.habitLogs.filter((l) => l.date === getToday()).length;
  const pendingTasks = data.tasks.filter((t) => t.status !== "done").length;
  const todayJournal = data.journalEntries.some((e) => e.date === getToday());

  const hour = new Date().getHours();
  const dayOfWeek = new Date().getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isMorning = hour < 12;
  const isEvening = hour >= 18;
  const timeGreeting = isMorning ? "Good morning" : isEvening ? "Good evening" : "Good afternoon";

  // Weekend-specific vibes
  const weekendPrefix = isWeekend ? "Happy weekend! " : "";

  // Build a dynamic status line
  const statusParts: string[] = [];
  if (todayHabits > 0) statusParts.push(`${todayHabits} habit${todayHabits > 1 ? "s" : ""} logged`);
  if (pendingTasks > 0) statusParts.push(`${pendingTasks} task${pendingTasks > 1 ? "s" : ""} pending`);
  else if (data.tasks.length > 0) statusParts.push("no pending tasks 🎉");
  if (todayJournal) statusParts.push("journal written today");

  const statusLine = statusParts.length > 0
    ? `${statusParts.join(", ")}.`
    : "Fresh start to your day!";

  // Random greeting variations per model
  const logosOpeners = [
    `${timeGreeting}! 👋 I'm **Logos**. ${weekendPrefix}${statusLine} What can I help you with?`,
    `Hey there! ${weekendPrefix}${statusLine} I'm here when you need me.`,
    `${timeGreeting}! ${statusLine} What's on your mind?`,
    `Welcome back! ${statusLine} Ready to dive in?`,
  ];

  const ethosOpeners = [
    `${timeGreeting}. I'm **Ethos** - your strategic thinking companion. ${weekendPrefix}${statusLine} What would you like to explore in depth?`,
    `${timeGreeting}! ${weekendPrefix}I see ${statusLine} Let's think about this together.`,
  ];

  const verseOpeners = [
    `Hey! ${weekendPrefix}${todayHabits} logged, ${pendingTasks} pending. What do you need?`,
    `Yo. ${todayHabits}h, ${pendingTasks}t. Go.`,
    `Sup. ${statusLine} Ask away.`,
  ];

  if (model.id === "agent-1") {
    if (history.length === 0) {
      return ethosOpeners[Math.floor(Math.random() * ethosOpeners.length)];
    }
    const welcomeBacks = [
      `${timeGreeting}! I'm still tracking with where we left off. What new thoughts have surfaced?`,
      `Welcome back. I've been reflecting on our last conversation. What's on your mind?`,
      `${timeGreeting}. ${weekendPrefix}Let's pick up where we left off. I'm ready.`,
    ];
    return welcomeBacks[Math.floor(Math.random() * welcomeBacks.length)];
  }

  if (model.id === "fast-1") {
    return verseOpeners[Math.floor(Math.random() * verseOpeners.length)];
  }

  // Logos (default)
  if (history.length === 0) {
    const firstGreetings = [
      `${timeGreeting}! 👋 I'm **Logos**, your productivity companion. Ready to get things done.\n\n**Quick things I can help with:**\n• 📊 **Daily/Weekly summaries** - "how's my week looking?"\n• 💪 **Habit insights** - "how are my habits doing?"\n• 🎯 **Task management** - "what should I focus on?"\n• 🔍 **Search** - "find documents about..."\n• 📝 **Journal reflection** - "review my journal"\n• 🎨 **Habit plans** - "create a habit plan for..."\n\nRight now: ${statusLine} What can I help you with?`,
      `${timeGreeting}! I'm **Logos**. ${weekendPrefix}I can help you track habits, manage tasks, review your journal, search documents, or just chat.\n\n**Current status:** ${statusLine}\n\nWhat would you like to explore?`,
    ];
    return firstGreetings[Math.floor(Math.random() * firstGreetings.length)];
  }

  const returnGreetings = [
    `${timeGreeting}! Welcome back. ${statusLine} How can I help?`,
    `Hey again! ${weekendPrefix}${statusLine} What's up?`,
    `Back for more! ${statusLine} Where should we pick up?`,
  ];
  return returnGreetings[Math.floor(Math.random() * returnGreetings.length)];
}

function generateSummaryResponse(
  context: DataContext,
  history: AIMessage[],
  model: ModelProfile
): string {
  const data = storage.getData();
  const today = getToday();
  const todayHabits = data.habitLogs.filter((l) => l.date === today).length;
  const todayTasks = data.tasks.filter(
    (t) => t.status === "done" && t.completedAt?.startsWith(today)
  ).length;
  const todayJournal = data.journalEntries.filter((e) => e.date === today);

  if (model.id === "fast-1") {
    let resp = `📊 **Today's Snapshot**\n`;
    resp += `• Habits: ${todayHabits} logged\n`;
    resp += `• Tasks: ${todayTasks} done, ${context.pendingTasks} pending`;
    if (context.overdueTasks > 0)
      resp += ` (${context.overdueTasks} overdue)`;
    resp += `\n• Journal: ${todayJournal.length ? "✅ Written" : "❌ Not yet"}`;
    if (data.habits.length > 0) {
      const best = data.habits
        .map((h) => ({
          name: h.name,
          ...calculateStreak(storage.getHabitLogDates(h.id)),
        }))
        .sort((a, b) => b.current - a.current)[0];
      if (best && best.current > 0)
        resp += `\n• Best streak: ${best.name} (${best.current}d)`;
    }
    return resp;
  }

  if (model.id === "agent-1") {
    let resp = `📊 **Comprehensive Overview**\n\n`;

    // Habits section
    const habits = data.habits.filter((h) => !h.archived);
    resp += `**Habits & Consistency**\n`;
    resp += `• You have ${habits.length} active habit${habits.length !== 1 ? "s" : ""}\n`;
    resp += `• ${todayHabits} logged today\n`;
    resp += `• ${context.totalCompletions} total check-ins across your journey\n`;
    if (habits.length > 0) {
      const streaks = habits.map((h) => ({
        name: h.name,
        ...calculateStreak(storage.getHabitLogDates(h.id)),
      }));
      const best = streaks.sort((a, b) => b.current - a.current)[0];
      const worst = streaks.sort((a, b) => a.current - b.current)[0];
      if (best && best.current > 0) {
        resp += `• Strongest: **${best.name}** (${best.current}-day streak)\n`;
      }
      if (worst && worst.current === 0 && habits.length > 1) {
        resp += `• Needs attention: **${worst.name}** - haven't started a streak yet\n`;
      }
    }
    resp += "\n";

    // Tasks section
    resp += `**Tasks & Productivity**\n`;
    resp += `• ${todayTasks} completed today\n`;
    resp += `• ${context.pendingTasks} pending`;
    if (context.overdueTasks > 0)
      resp += ` (⚠️ ${context.overdueTasks} overdue)`;
    resp += "\n";

    // Check for recurring patterns
    const recurringTasks = data.tasks.filter(
      (t) => t.recurring !== "none"
    ).length;
    if (recurringTasks > 0) {
      resp += `• ${recurringTasks} recurring task${recurringTasks !== 1 ? "s" : ""} \n`;
    }
    resp += "\n";

    // Journal & Notes
    resp += `**Journal & Reflection**\n`;
    resp += `• ${todayJournal.length ? "✅ Journal written today" : "📝 Journal not yet written today"}\n`;
    resp += `• Total entries: ${data.journalEntries.length}\n`;
    resp += `• Total documents: ${data.notes.length}\n`;
    if (data.journalEntries.length > 0) {
      const recentMoods = data.journalEntries
        .slice(-7)
        .map((e) => getMoodScore(e.mood));
      const avgMood =
        recentMoods.reduce((a, b) => a + b, 0) / recentMoods.length;
      resp += `• 7-day mood trend: ${
        avgMood >= 75 ? "😊 Positive" : avgMood >= 50 ? "😐 Neutral" : "😔 Low"
      }\n`;
    }
    resp += "\n";

    // Insight
    resp += `**Insight**\n`;
    if (todayHabits > 0 && todayTasks > 0) {
      resp += `You're balancing habits and tasks well today - that's a strong sign of holistic productivity.`;
    } else if (todayHabits > 0) {
      resp += `Great habit consistency! Consider channeling that momentum into your pending tasks.`;
    } else if (todayTasks > 0) {
      resp += `Good task progress! Don't forget your habits - even a quick check-in maintains your streak.`;
    } else {
      resp += `A fresh start! Set one intention for each area: a habit, a task, and a moment of reflection.`;
    }

    return resp;
  }

  // Logos (medium)
  let resp = `Here's your **Daily Summary** 📊\n\n`;
  resp += `**Today's Progress**\n`;
  resp += `• ✅ Habits: ${todayHabits} logged\n`;
  resp += `• 🎯 Tasks: ${todayTasks} done, ${context.pendingTasks} pending`;
  if (context.overdueTasks > 0)
    resp += ` (⚠️ ${context.overdueTasks} overdue)`;
  resp += `\n• 📝 Journal: ${todayJournal.length ? "Written ✍️" : "Not yet"}\n\n`;

  // Quick suggestion
  if (context.overdueTasks > 2) {
    resp += `💡 **Tip:** You have several overdue tasks. Try tackling the oldest one first to clear the backlog.\n\n`;
  } else if (todayHabits === 0 && data.habits.filter((h) => !h.archived).length > 0) {
    resp += `💡 **Tip:** Your habits are ready for you! A quick check-in builds consistency.\n\n`;
  }

  resp += `Want me to dive deeper into any specific area?`;
  return resp;
}

function generateHabitsResponse(
  query: string,
  context: DataContext,
  history: AIMessage[],
  model: ModelProfile
): string {
  const data = storage.getData();
  const habits = data.habits.filter((h) => !h.archived);

  if (habits.length === 0) {
    return model.id === "fast-1"
      ? "You have no habits yet. Create one in the Habits tab!"
      : "You haven't created any habits yet! I'd recommend starting with 1-2 simple daily habits like \"Morning stretch\" or \"Read 10 pages.\" Would you like me to suggest some based on common goals?";
  }

  if (model.id === "fast-1") {
    const today = getToday();
    const logged = habits.filter((h) => storage.isHabitLogged(h.id, today)).length;
    const best = habits
      .map((h) => ({ name: h.name, ...calculateStreak(storage.getHabitLogDates(h.id)) }))
      .sort((a, b) => b.current - a.current)[0];

    let resp = `**Habits** - ${logged}/${habits.length} today\n`;
    if (best && best.current > 0) {
      resp += `Best streak: ${best.name} (${best.current}d)\n`;
    }
    habits.slice(0, 5).forEach((h) => {
      const s = calculateStreak(storage.getHabitLogDates(h.id));
      const isLogged = storage.isHabitLogged(h.id, today);
      resp += `${isLogged ? "✅" : "⬜"} ${h.name} - ${s.current}d streak\n`;
    });
    return resp;
  }

  if (model.id === "agent-1") {
    let resp = `📊 **Habit Analysis**\n\n`;

    const today2 = getToday();
    const activeHabits = habits.length;
    const loggedToday = habits.filter((h) => storage.isHabitLogged(h.id, today2)).length;
    const completionRate =
      activeHabits > 0
        ? Math.round((loggedToday / activeHabits) * 100)
        : 0;

    resp += `**Overview**\n`;
    resp += `• ${activeHabits} active habits\n`;
    resp += `• ${loggedToday} logged today (${completionRate}% completion)\n`;
    resp += `• ${context.totalCompletions} total check-ins all-time\n\n`;

    resp += `**Streak Report**\n`;
    const today3 = getToday();
    const withStreaks = habits
      .map((h) => ({
        name: h.name,
        logged: storage.isHabitLogged(h.id, today3),
        ...calculateStreak(storage.getHabitLogDates(h.id)),
      }))
      .sort((a, b) => b.current - a.current);

    withStreaks.forEach((h) => {
      const bar = "█".repeat(Math.min(h.current, 20));
      resp += `• **${h.name}**: ${h.current}d (best: ${h.longest}d) ${h.logged ? "✅" : ""}\n`;
      if (h.current > 0) resp += `  ${bar}\n`;
    });

    if (withStreaks.length > 0) {
      const best = withStreaks[0];
      if (best.current > 0) {
        resp += `\n**Pattern Insight:** Your strongest consistency is in "${best.name}"`;
        if (best.current >= 7) {
          resp += ` - you've maintained this for over a week, which means it's becoming a genuine habit!`;
        } else if (best.current >= 30) {
          resp += ` - over a month! This is now part of your identity.`;
        }
        resp += "\n";
      }
    }

    return resp;
  }

  // Logos
  const today4 = getToday();
  const logged = habits.filter((h) => storage.isHabitLogged(h.id, today4)).length;
  const best = habits
    .map((h) => ({ name: h.name, ...calculateStreak(storage.getHabitLogDates(h.id)) }))
    .sort((a, b) => b.current - a.current)[0];

  let resp = `**Habit Check** 💪\n\n`;
  resp += `You have ${habits.length} habit${habits.length !== 1 ? "s" : ""} - ${logged} checked off today.\n\n`;

  habits.slice(0, 5).forEach((h) => {
    const s = calculateStreak(storage.getHabitLogDates(h.id));
    const isLogged = storage.isHabitLogged(h.id, today4);
    resp += `${isLogged ? "✅" : "⬜"} **${h.name}** - ${s.current}-day streak`;
    if (s.current > 0 && s.current >= s.longest && s.current > 1) {
      resp += " 🔥 Personal best!";
    }
    resp += "\n";
  });

  if (best && best.current > 0) {
    resp += `\n🏆 **Top Streak:** ${best.name} at ${best.current} days!`;
    if (best.current >= 7) resp += " A full week - amazing consistency!";
  }

  if (habits.length > 5) {
    resp += `\n\nPlus ${habits.length - 5} more habit${habits.length - 5 !== 1 ? "s" : ""}. Want the full breakdown?`;
  }

  return resp;
}

function generateTasksResponse(
  query: string,
  context: DataContext,
  history: AIMessage[],
  model: ModelProfile
): string {
  const data = storage.getData();
  const pendingTasks = data.tasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 } as const;
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

  if (pendingTasks.length === 0) {
    return model.id === "fast-1"
      ? "No pending tasks! 🎉 Enjoy your free time."
      : "You have no pending tasks - that's wonderful! 🎉 You're either completely caught up or it's a great time to set some new goals. Want me to help you plan your next priorities?";
  }

  if (model.id === "fast-1") {
    let resp = `**Tasks** - ${pendingTasks.length} pending`;
    if (context.overdueTasks > 0)
      resp += ` (${context.overdueTasks} overdue)`;
    resp += "\n";
    pendingTasks.slice(0, 5).forEach((t) => {
      const pIcon =
        t.priority === "urgent"
          ? "🔴"
          : t.priority === "high"
          ? "🟠"
          : t.priority === "medium"
          ? "🔵"
          : "⚪";
      resp += `${pIcon} ${t.title}`;
      if (t.dueDate) resp += ` - ${t.dueDate === getToday() ? "today" : t.dueDate}`;
      resp += "\n";
    });
    if (pendingTasks.length > 5)
      resp += `+${pendingTasks.length - 5} more`;
    return resp;
  }

  if (model.id === "agent-1") {
    let resp = `📋 **Task Analysis**\n\n`;

    const total = data.tasks.length;
    const done = data.tasks.filter((t) => t.status === "done").length;
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

    resp += `**Overview**\n`;
    resp += `• ${pendingTasks.length} pending (${context.overdueTasks} overdue)\n`;
    resp += `• ${done} completed out of ${total} total (${completionRate}% completion rate)\n\n`;

    resp += `**Priority Breakdown**\n`;
    const urgent = pendingTasks.filter((t) => t.priority === "urgent");
    const high = pendingTasks.filter((t) => t.priority === "high");
    const medium = pendingTasks.filter((t) => t.priority === "medium");
    const low = pendingTasks.filter((t) => t.priority === "low");

    if (urgent.length > 0) resp += `🔴 Urgent: ${urgent.length}\n`;
    if (high.length > 0) resp += `🟠 High: ${high.length}\n`;
    if (medium.length > 0) resp += `🔵 Medium: ${medium.length}\n`;
    if (low.length > 0) resp += `⚪ Low: ${low.length}\n`;
    resp += "\n";

    if (urgent.length > 0) {
      resp += `**Immediate Focus (Urgent):**\n`;
      urgent.slice(0, 3).forEach((t) => {
        resp += `• ${t.title}${t.dueDate ? ` (due ${t.dueDate})` : ""}\n`;
      });
      resp += "\n";
    }

    // Check for recurring patterns
    const recurring = pendingTasks.filter((t) => t.recurring !== "none");
    if (recurring.length > 0) {
      resp += `**Recurring Tasks:** ${recurring.length} recur${recurring.length > 1 ? "ring" : "s"}\n`;
      recurring.slice(0, 3).forEach((t) => {
        resp += `• ${t.title} (${t.recurring})\n`;
      });
      resp += "\n";
    }

    if (context.overdueTasks > 2) {
      resp += `💡 **Recommendation:** You have ${context.overdueTasks} overdue tasks. Consider doing a "power hour" - set a timer and knock out as many as you can. Start with the most overdue one to clear mental load.\n`;
    } else if (pendingTasks.length > 5) {
      resp += `💡 **Recommendation:** With ${pendingTasks.length} tasks pending, try breaking them into "Today" vs "This Week" to reduce overwhelm.\n`;
    } else if (pendingTasks.length > 0) {
      resp += `💡 **Recommendation:** A manageable list! Tackle the highest priority item first for momentum.\n`;
    }

    return resp;
  }

  // Logos
  const urgent = pendingTasks.filter((t) => t.priority === "urgent");
  const high = pendingTasks.filter((t) => t.priority === "high");

  let resp = `**Tasks** 🎯\n\n`;
  resp += `${pendingTasks.length} pending`;
  if (context.overdueTasks > 0)
    resp += `, ${context.overdueTasks} overdue`;
  resp += "\n\n";

  if (urgent.length > 0) {
    resp += `**🔴 Urgent - ${urgent.length} task${urgent.length > 1 ? "s" : ""}**\n`;
    urgent.slice(0, 3).forEach((t) => {
      resp += `• ${t.title}${t.dueDate ? ` (due ${t.dueDate})` : ""}\n`;
    });
    resp += "\n";
  }

  if (high.length > 0) {
    resp += `**🟠 High Priority**\n`;
    high.slice(0, 3).forEach((t) => {
      resp += `• ${t.title}${t.dueDate ? ` (due ${t.dueDate})` : ""}\n`;
    });
    resp += "\n";
  }

  if (urgent.length === 0 && high.length === 0) {
    pendingTasks.slice(0, 5).forEach((t) => {
      resp += `• ${t.title}${t.dueDate ? ` - ${t.dueDate}` : ""}\n`;
    });
    resp += "\n";
  }

  if (context.overdueTasks > 0) {
    resp += `💡 Try clearing overdue tasks first - they weigh on your mental load more than you think!\n`;
  }

  return resp;
}

function generateJournalResponse(
  query: string,
  context: DataContext,
  history: AIMessage[],
  model: ModelProfile
): string {
  const data = storage.getData();
  const entries = data.journalEntries;

  if (entries.length === 0) {
    return model.id === "fast-1"
      ? "No journal entries yet. Write your first one!"
      : "You haven't written any journal entries yet. Journaling is a powerful tool for self-reflection and mental clarity. Would you like some prompts to get started? Try writing about your day, what you're grateful for, or a goal you're working toward.";
  }

  if (model.id === "fast-1") {
    const recent = entries[0];
    const score = getMoodScore(recent.mood);
    const moodLabel =
      score >= 75 ? "great 😊" : score >= 50 ? "okay 😐" : "low 😔";
    return `📝 Journal: ${entries.length} entries\nLatest: ${recent.date} - feeling ${moodLabel}\n${recent.content.slice(0, 100)}...`;
  }

  if (model.id === "agent-1") {
    const recent = entries.slice(0, 7);
    const avgMood =
      recent.reduce((sum, e) => sum + getMoodScore(e.mood), 0) /
      recent.length;

    let resp = `📝 **Journal Reflection Analysis**\n\n`;
    resp += `**Overview**\n`;
    resp += `• ${entries.length} total entries\n`;
    resp += `• ${entries.filter((e) => e.date === getToday()).length ? "Written today ✅" : "Not written today 📝"}\n`;
    resp += `• 7-day mood trend: ${
      avgMood >= 75 ? "😊 Positive" : avgMood >= 50 ? "😐 Neutral" : "😔 Needs care"
    }\n\n`;

    // Mood distribution
    const moodCounts: Record<string, number> = {};
    entries.forEach((e) => {
      moodCounts[e.mood] = (moodCounts[e.mood] || 0) + 1;
    });
    resp += `**Mood Distribution**\n`;
    Object.entries(moodCounts).forEach(([mood, count]) => {
      const bar = "█".repeat(Math.min(count, 20));
      const pct = Math.round((count / entries.length) * 100);
      resp += `• ${mood}: ${bar} ${count} (${pct}%)\n`;
    });
    resp += "\n";

    // Gratitude patterns
    const gratitudeCounts = entries.filter((e) => e.gratitude.length > 0).length;
    if (gratitudeCounts > 0) {
      resp += `**Gratitude Practice**\n`;
      resp += `• ${gratitudeCounts} entries with gratitude items\n`;
      const allGratitudes = entries.flatMap((e) => e.gratitude);
      resp += `• ${allGratitudes.length} total gratitude items recorded\n`;
      resp += "\n";
    }

    // Insight
    if (avgMood >= 75 && context.overdueTasks === 0) {
      resp += `🌟 **Positive Pattern:** Your mood has been consistently positive and your tasks are under control - you're in a great groove!`;
    } else if (avgMood >= 75) {
      resp += `🌟 **Positive Pattern:** Your mood is trending positive even with tasks to do - great mindset!`;
    } else if (avgMood < 50 && context.overdueTasks > 3) {
      resp += `💡 **Pattern Alert:** Your lower mood coincides with several overdue tasks. Clearing those might help lift your spirits.`;
    }

    return resp;
  }

  // Logos
  const recent = entries[0];
  const weekEntries = entries.filter((e) => {
    const d = new Date(e.date);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return d >= weekAgo;
  });

  let resp = `**Journal** 📝\n\n`;
  resp += `${entries.length} total entries`;
  if (weekEntries.length > 0)
    resp += `, ${weekEntries.length} this week`;
  resp += "\n\n";

  if (recent) {
    const score = getMoodScore(recent.mood);
    const moodLabel =
      score >= 75 ? "😊 Positive" : score >= 50 ? "😐 Neutral" : "😔 Low";
    resp += `**Latest Entry (${recent.date})**\n`;
    resp += `Mood: ${moodLabel}\n`;
    resp += `"${recent.content.slice(0, 150)}..."\n\n`;
  }

  if (!context.todayJournal) {
    resp += `💡 Haven't written today yet. Even 2 minutes of journaling can clarify your thoughts!`;
  }

  return resp;
}

function generateNotesResponse(
  query: string,
  context: DataContext,
  history: AIMessage[],
  model: ModelProfile
): string {
  const data = storage.getData();
  const notes = data.notes;

  if (notes.length === 0) {
    return model.id === "fast-1"
      ? "No documents yet. Start writing!"
      : "You haven't created any documents yet. Documents are great for capturing ideas, meeting notes, or anything you want to remember. Head to the Documents tab to create your first one!";
  }

  if (model.id === "fast-1") {
    return `📓 ${notes.length} notes total\nRecent: "${notes.slice(-1)[0]?.title || "None"}"`;
  }

  if (model.id === "agent-1") {
    const pinned = notes.filter((n) => n.pinned);
    const hasTags = notes.filter((n) => n.tags.length > 0).length;
    const allTags = [...new Set(notes.flatMap((n) => n.tags))];

    let resp = `📓 **Notes Overview**\n\n`;
    resp += `**Stats**\n`;
    resp += `• ${notes.length} total notes\n`;
    resp += `• ${pinned.length} pinned\n`;
    resp += `• ${allTags.length} unique tags used\n`;
    resp += `• ${hasTags} notes with tags\n\n`;

    if (pinned.length > 0) {
      resp += `**Pinned Notes**\n`;
      pinned.slice(0, 3).forEach((n) => {
        resp += `• 📌 ${n.title} - ${n.content.slice(0, 80)}...\n`;
      });
      resp += "\n";
    }

    // Recent activity
    const recentNotes = [...notes].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    ).slice(0, 3);
    resp += `**Recently Updated**\n`;
    recentNotes.forEach((n) => {
      resp += `• ${n.title} (${new Date(n.updatedAt).toLocaleDateString()})\n`;
    });

    return resp;
  }

  // Logos
  const recent = [...notes]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    .slice(0, 3);

  let resp = `**Notes** 📓\n\n`;
  resp += `${notes.length} total\n\n`;
  resp += `**Recent:**\n`;
  recent.forEach((n) => {
    resp += `• ${n.title}\n`;
  });

  return resp;
}

function generatePlanResponse(
  query: string,
  context: DataContext,
  history: AIMessage[],
  model: ModelProfile
): string {
  const data = storage.getData();
  const habits = data.habits.filter((h) => !h.archived);

  if (model.id === "fast-1") {
    let resp = `**Quick Plan** 🎯\n\n`;
    resp += `**Right now:** Focus on your top priority task first.\n`;
    resp += `**Today:** Complete ${habits.length > 0 ? "your habits + " : ""}top 3 tasks.\n`;
    resp += `**This week:** Review progress every evening (5 min).\n`;
    if (context.overdueTasks > 0) {
      resp += `\n⚠️ Clear ${context.overdueTasks} overdue task${context.overdueTasks > 1 ? "s" : ""} first.`;
    }
    return resp;
  }

  if (model.id === "agent-1") {
    let resp = `🎯 **Strategic Plan**\n\n`;

    // Analyze current state
    const todayLogs = data.habitLogs.filter((l) => l.date === getToday()).length;
    const pendingTasks = data.tasks.filter((t) => t.status !== "done");
    const overdueTasks = pendingTasks.filter(
      (t) => t.dueDate && t.dueDate < getToday()
    );

    resp += `**Current Assessment**\n`;
    if (habits.length > 0) {
      const bestStreak = habits
        .map((h) => ({
          name: h.name,
          ...calculateStreak(storage.getHabitLogDates(h.id)),
        }))
        .sort((a, b) => b.current - a.current)[0];
      resp += `• Habits: ${habits.length} active, ${todayLogs} logged today`;
      if (bestStreak && bestStreak.current > 0)
        resp += ` (best streak: ${bestStreak.name} at ${bestStreak.current}d)`;
      resp += "\n";
    }
    resp += `• Tasks: ${pendingTasks.length} pending`;
    if (overdueTasks.length > 0)
      resp += ` (${overdueTasks.length} overdue)`;
    resp += "\n";
    resp += `• Journal: ${data.journalEntries.length} entries total\n\n`;

    // Action plan
    resp += `**Recommended Action Plan**\n\n`;

    // Phase 1
    resp += `**Phase 1: Clear the Deck**\n`;
    if (overdueTasks.length > 0) {
      resp += `• Tackle ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""} - start with the oldest\n`;
    }
    if (todayLogs < habits.length) {
      resp += `• Complete remaining ${habits.length - todayLogs} habit${habits.length - todayLogs > 1 ? "s" : ""} check-ins\n`;
    }
    if (!context.todayJournal) {
      resp += `• Write a brief journal entry - even 3 sentences helps\n`;
    }
    resp += "\n";

    // Phase 2
    resp += `**Phase 2: Build Momentum**\n`;
    const highPriority = pendingTasks.filter(
      (t) => t.priority === "urgent" || t.priority === "high"
    );
    if (highPriority.length > 0) {
      resp += `• Focus on ${highPriority[0].title} (${highPriority[0].priority}) - your most important task\n`;
    }
    resp += `• Use the Pomodoro technique: 25 min work, 5 min break\n`;
    resp += `• Batch similar tasks together for efficiency\n`;
    resp += "\n";

    // Phase 3
    resp += `**Phase 3: Reflect & Optimize**\n`;
    resp += `• At end of day: review what worked and what didn't\n`;
    resp += `• Plan tomorrow's top 3 priorities tonight\n`;
    resp += `• Check your habits streaks - don't break the chain!\n`;

    // Personalization
    if (context.recentMood === "low") {
      resp += `\n💙 **Note:** Your recent mood has been low. Be gentle with yourself - rest is productive too. Consider scaling back to just 1-2 essential tasks today.\n`;
    }

    return resp;
  }

  // Logos
  const planPendingTasks = data.tasks.filter((t) => t.status !== "done");
  let resp = `**Action Plan** 🎯\n\n`;

  if (context.overdueTasks > 0) {
    resp += `**Step 1: Clear overdue tasks**\n`;
    resp += `• Start with the most overdue - getting it done reduces mental load\n`;
    resp += `• Set a 25-minute timer and power through\n\n`;
  }

  resp += `**Step 2: Habits**\n`;
  if (habits.length > 0) {
    const today5 = getToday();
    const unchecked = habits.filter((h) => !storage.isHabitLogged(h.id, today5));
    if (unchecked.length > 0) {
      resp += `• Check off: ${unchecked.map((h) => h.name).join(", ")}\n`;
    } else {
      resp += `• All done! Great consistency. ✅\n`;
    }
  } else {
    resp += `• Consider adding 1-2 simple habits to build momentum\n`;
  }
  resp += "\n";

  resp += `**Step 3: Top Priority Tasks**\n`;
  const top3 = planPendingTasks
    .sort((a, b) => {
      const p = { urgent: 0, high: 1, medium: 2, low: 3 } as const;
      return p[a.priority] - p[b.priority];
    })
    .slice(0, 3);
  top3.forEach((t, i) => {
    resp += `• ${i + 1}. ${t.title}\n`;
  });

  resp += `\n💡 Start with the first item - momentum is everything!`;

  return resp;
}

function generateMotivationResponse(
  query: string,
  context: DataContext,
  history: AIMessage[],
  model: ModelProfile
): string {
  const data = storage.getData();
  const habits = data.habits.filter((h) => !h.archived);

  if (model.id === "fast-1") {
    const best = habits
      .map((h) => ({ name: h.name, ...calculateStreak(storage.getHabitLogDates(h.id)) }))
      .sort((a, b) => b.current - a.current)[0];

    if (best && best.current >= 3) {
      return `🔥 ${best.current}-day streak on "${best.name}"! You're building real momentum. Keep showing up! 💪`;
    }
    return `You've got this! Every small step counts. What's one thing you can do right now to move forward? 💪`;
  }

  if (model.id === "agent-1") {
    let resp = `🔥 **You're Building Something Real**\n\n`;

    if (habits.length > 0) {
      const streaks = habits
        .map((h) => ({ name: h.name, ...calculateStreak(storage.getHabitLogDates(h.id)) }))
        .sort((a, b) => b.current - a.current);

      const totalStreakDays = streaks.reduce((sum, h) => sum + h.current, 0);
      const best = streaks[0];

      resp += `**Your Progress**\n`;
      resp += `• ${streaks.filter((s) => s.current > 0).length} active habit streak${streaks.filter((s) => s.current > 0).length > 1 ? "s" : ""}\n`;
      resp += `• Total streak days across all habits: ${totalStreakDays}\n`;
      if (best && best.current > 0) {
        resp += `• Best streak: "${best.name}" - ${best.current} days\n`;
      }
      resp += "\n";

      if (best && best.current >= 30) {
        resp += `🌟 **Remarkable!** A 30+ day streak means this habit is now part of who you are. You've transformed an intention into an identity. That's the deepest level of habit formation.`;
      } else if (best && best.current >= 7) {
        resp += `🌟 **Excellent momentum!** Passing the one-week mark is statistically when habits start becoming automatic. You're through the hardest part.`;
      } else if (best && best.current >= 3) {
        resp += `💪 **Great start!** Three days in a row is the beginning of a real streak. The next milestone is 7 days - you're almost there!`;
      } else {
        resp += `🌱 **Every journey begins with a single step.** You're taking those steps, and that's what matters. Consistency over intensity wins every time.`;
      }
      resp += "\n\n";

      resp += `**Remember:** You don't need to be perfect. You just need to be better than yesterday. And you are. Keep going. 🚀`;
    } else {
      resp += `You haven't created any habits yet, and that's okay. The fact that you're here, exploring, and thinking about growth - that's already a step forward.\n\n`;
      resp += `**Here's the truth:** The best time to start was yesterday. The second best time is right now. What's one small thing you'd like to make a habit?\n\n`;
      resp += `Start with something so easy you can't say no. 2 minutes. One page. Five squats. Then build from there.`;
    }

    return resp;
  }

  // Logos
  const best = habits
    .map((h) => ({ name: h.name, ...calculateStreak(storage.getHabitLogDates(h.id)) }))
    .sort((a, b) => b.current - a.current)[0];

  let resp = `💪 **Let's Go!**\n\n`;
  if (best && best.current >= 7) {
    resp += `You've been consistent with "${best.name}" for ${best.current} days - that's incredible! Habits that last this long are becoming automatic. You're not just building habits, you're transforming your lifestyle. 🔥\n\n`;
  } else if (best && best.current >= 3) {
    resp += `${best.current}-day streak on "${best.name}" - nicely done! You're building real momentum. Keep showing up, and soon it'll feel strange NOT to do it.\n\n`;
  } else if (best && best.current > 0) {
    resp += `Every streak starts with day 1, and you've got ${best.current} days on "${best.name}"! Consistency beats perfection every time.\n\n`;
  } else {
    resp += `It's never too late to start. The best version of you is built one small choice at a time. What's one thing you can do right now?\n\n`;
  }

  resp += `**Today's reminder:** Progress is progress, no matter how small. You're doing better than you think. 🌟`;

  return resp;
}

function generateSearchResponse(
  query: string,
  context: DataContext,
  history: AIMessage[],
  model: ModelProfile
): string {
  const results = searchUserData(query, model.analysisDepth);

  if (results.length === 0) {
    if (model.id === "fast-1")
      return "No results found. Try different keywords.";
    return "I searched across your notes, tasks, and journal but couldn't find anything matching that. Try different keywords or check if you have any saved data related to this topic.";
  }

  if (model.id === "fast-1") {
    return results.slice(0, 3).join("\n");
  }

  return results.join("\n");
}

function generateGeneralResponse(
  query: string,
  context: DataContext,
  history: AIMessage[],
  model: ModelProfile
): string {
  const q = query.toLowerCase();

  // Check if it's a feeling check
  if (/(how.*feeling|how.*you|you.*okay|you.*good|how.*day)/i.test(q)) {
    if (model.id === "fast-1") {
      return `I'm here for you! Your data shows ${context.habits.filter((h) => h.logged).length}/${context.habits.length} habits done and ${context.pendingTasks} tasks left. How are you feeling?`;
    }
    return `I'm doing great - thanks for asking! 😊 More importantly, how are you feeling today?\n\nFrom your data, I can see you've logged ${context.habits.filter((h) => h.logged).length} habit${context.habits.filter((h) => h.logged).length !== 1 ? "s" : ""} and have ${context.pendingTasks} task${context.pendingTasks !== 1 ? "s" : ""} to tackle. Your recent mood has been ${context.recentMood}. \n\nWant to talk about anything specific? I'm here to listen and help.`;
  }

  // Check if query mentions previous conversation
  const hasHistory = history.length >= 2;
  if (hasHistory && model.analysisDepth !== "shallow") {
    // This is where memory-based responses would go
    // For now, just acknowledge context
  }

  // General capability response
  const capabilities =
    model.id === "fast-1"
      ? `Try:\n• "how are my habits?"\n• "show my tasks"\n• "daily summary"\n• "journal overview"\n• "make a plan"`
      : `I can help you with:\n\n📊 **Summaries** - "Give me a daily/weekly summary"\n💪 **Habits** - "How are my habits doing?", "What's my best streak?"\n🎯 **Tasks** - "Show my tasks", "What should I focus on?"\n📝 **Journal** - "Review my journal", "How's my mood been?"\n📓 **Notes** - "Find notes about...", "Overview of my notes"\n🎯 **Plans** - "Create a habit plan", "Help me plan my day"\n🔥 **Motivation** - "Motivate me!", "Tell me something inspiring"\n\nWhat would you like to explore?`;

  return capabilities;
}

function generateFollowupResponse(
  query: string,
  context: DataContext,
  history: AIMessage[],
  model: ModelProfile
): string {
  // Get the last assistant message topic from history
  if (history.length < 2) {
    return generateGeneralResponse(query, context, history, model);
  }

  // Find what the last topic was about
  const lastMessages = history.slice(-4);
  const allContent = lastMessages.map((m) => m.content.toLowerCase()).join(" ");

  // Route based on the context of the conversation
  if (
    /habit|streak|consistency|routine/i.test(allContent) &&
    !/task|journal|note/i.test(allContent)
  ) {
    return generateHabitsResponse(query, context, history, model);
  }
  if (
    /task|todo|deadline|priority|overdue/i.test(allContent) &&
    !/habit|journal|note/i.test(allContent)
  ) {
    return generateTasksResponse(query, context, history, model);
  }
  if (
    /journal|mood|grateful|feel|reflect|emotion/i.test(allContent) &&
    !/habit|task|note/i.test(allContent)
  ) {
    return generateJournalResponse(query, context, history, model);
  }
  if (
    /note|find|search|document|idea/i.test(allContent)
  ) {
    return generateNotesResponse(query, context, history, model);
  }
  if (
    /plan|goal|suggest|action|strategy/i.test(allContent)
  ) {
    return generatePlanResponse(query, context, history, model);
  }

  return generateGeneralResponse(query, context, history, model);
}

// ============================================================
// LLM (NVIDIA NIM) integration
// ============================================================

export function buildStatsBlock(depth: "shallow" | "moderate" | "deep"): string {
  const data = storage.getData();
  const today = getToday();

  const activeHabits = data.habits.filter((h) => !h.archived);
  const habitsLoggedToday = data.habitLogs.filter((l) => l.date === today).length;
  const pendingTasks = data.tasks.filter((t) => t.status !== "done");
  const overdueTasks = pendingTasks.filter((t) => t.dueDate && t.dueDate < today).length;
  const tasksDoneToday = data.tasks.filter(
    (t) => t.status === "done" && t.completedAt?.startsWith(today)
  ).length;
  const tasksDueToday = data.tasks.filter((t) => t.dueDate === today).length;
  const journalToday = data.journalEntries.some((e) => e.date === today);
  const notesCount = data.notes.filter((n) => !n.archived).length;

  const habitScore =
    activeHabits.length > 0
      ? Math.round((habitsLoggedToday / activeHabits.length) * 100)
      : 0;
  const taskScore =
    tasksDueToday > 0 ? Math.round((tasksDoneToday / tasksDueToday) * 100) : 0;
  const productivityScore = Math.round((habitScore + taskScore) / 2);

  const streaks = activeHabits.map((h) => ({
    name: h.name,
    ...calculateStreak(storage.getHabitLogDates(h.id)),
  }));
  const best = streaks
    .filter((s) => s.current > 0)
    .sort((a, b) => b.current - a.current)[0];
  const longestEver = streaks.length > 0
    ? Math.max(...streaks.map((s) => s.longest))
    : 0;

  // Pet companion (lib/pet-habits.ts): feeds on habit check-ins, grows,
  // and its shields are the streak freezes. Noor should know it by name.
  const petLine = (function () {
    const pet = petById(data.profile?.pet);
    if (!pet) return "";
    const mealsToday = data.habitLogs.filter((l) => l.date === today).length;
    const meals = data.habitLogs.length;
    const stage = petStage(meals);
    const shields = data.streakFreezeTokens ?? 0;
    const petName = (data.profile?.petName || "").trim() || pet.name;
    const atRisk =
      depth !== "shallow"
        ? activeHabits
            .filter(
              (h) =>
                !data.habitLogs.some((l) => l.date === today && l.habitId === h.id) &&
                calculateStreak(storage.getHabitLogDates(h.id)).current > 0
            )
            .map((h) => h.name)
        : [];
    return (
      `- Pet: ${petName} (${pet.name}) — ${mealsToday > 0 ? "fed and happy today" : "hungry (no habits logged today)"}; ${meals} total meals (${stage.label} stage); shields: ${shields}` +
      (atRisk.length ? `; streaks at risk if today stays unlogged: ${atRisk.slice(0, 4).join(", ")}` : "") +
      `\nPET GUIDANCE: ${petName} is the user's companion that feeds on habit check-ins; shields protect streaks. If it is hungry you may gently encourage one small check-in ("a quick check-in feeds ${petName}") — never guilt-trip. Celebrate shields and growth naturally when relevant.` +
      "\n"
    );
  })();

  let moodLine = "";
  if (depth !== "shallow") {
    const recent = data.journalEntries.slice(0, 7);
    if (recent.length > 0) {
      const avg =
        recent.reduce((sum, e) => sum + getMoodScore(e.mood), 0) / recent.length;
      moodLine = `; recent mood: ${
        avg >= 75 ? "positive" : avg >= 50 ? "neutral" : "low"
      } (last ${recent.length} entries)`;
    }
  }

  return `CURRENT USER DATA (live snapshot from the user's Orleia workspace):
` +
    `- Productivity score: ${productivityScore}/100 (habits ${habitScore}%, tasks ${taskScore}% today)
` +
    `- Habits: ${activeHabits.length} active; ${habitsLoggedToday} logged today; total check-ins: ${data.habitLogs.length}
` +
    `- Active habit names: ${activeHabits.length ? activeHabits.map((h) => h.name).join(", ") : "none"}
` +
    `- Pending task titles: ${pendingTasks.length ? pendingTasks.slice(0, 12).map((t) => t.title).join(", ") + (pendingTasks.length > 12 ? ", ..." : "") : "none"}
` +
    `- Best streak: ${best ? `"${best.name}" (${best.current} days)` : "none yet"}; longest ever: ${longestEver} days
` +
    `- Tasks: ${pendingTasks.length} pending (${overdueTasks} overdue); ${tasksDoneToday} completed today
` +
    `- Journal: ${data.journalEntries.length} entries total; written today: ${journalToday ? "yes" : "no"}${moodLine}
` +
    `- Documents: ${notesCount} total
` +
    petLine +
    (function () {
      const lines: string[] = [];
      try {
        const decks = storage.getDecks();
        lines.push(depth === "shallow"
          ? `- Decks: ${decks.length} total`
          : `- Decks: ${decks.length ? decks.length + " presentation(s): " + decks.slice(0, 8).map((d: any) => `"${d.title}" (${(d.slides || []).length} slides)`).join(", ") : "none"}`);
      } catch { /* ignore */ }
      try {
        const events = storage.getCalendarEvents();
        const today = getToday();
        const upcoming = events.filter((e: any) => e.date >= today).sort((a: any, b: any) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
        const evLimit = depth === "shallow" ? 3 : 5;
        lines.push(`- Calendar: ${events.length} event(s) total; ${upcoming.length} upcoming` + (upcoming.length ? `; next: ${upcoming.slice(0, evLimit).map((e: any) => `"${e.title}" ${e.date}${e.time ? " " + e.time : ""}`).join(", ")}` : ""));
      } catch { /* ignore */ }
      try {
        const boards = storage.getBoards();
        lines.push(`- Boards: ${boards.length ? boards.length + " whiteboard(s): " + boards.slice(0, 8).map((b: any) => `"${b.name}"`).join(", ") : "none"}`);
      } catch { /* ignore */ }
      return lines.join("\n") + "\n";
    })() +
    `CRITICAL: Before creating ANY task or habit, first check the pending task titles and habit names listed above. If something already exists (even partially matching), DO NOT create it. Only create genuinely new items that do not exist yet.\n` +
    `THINKING RULE: when writing your thought process, work from the data above silently - never recite, quote or restate its lines. Keep thinking brief and decision-focused (what to create, what to skip and why).\n` +    `Use these numbers to ground your answers - quote them naturally, never invent stats.`;
}

/**
 * Render the optional "about you" profile into a compact block for the
 * system prompt. Only non-empty fields are included; if the user skipped
 * everything, the block is empty so nothing gets injected.
 */
export function buildProfileBlock(): string {
  const p = storage.getProfile();
  const lines: string[] = [];
  const add = (label: string, value: string) => {
    if (value.trim()) lines.push(`- ${label}: ${value.trim()}`);
  };
  const addList = (label: string, values: string[]) => {
    const v = values.map((x) => x.trim()).filter(Boolean).join(", ");
    if (v) lines.push(`- ${label}: ${v}`);
  };

  add("Name", p.name || "");
  addList("Communication preferences", p.communicationPrefs as string[] || []);
  add("Goals", p.goals || "");
  // Time zone is auto-detected, never stored or asked (About You is
  // simplified — see settings ProfileEditor).
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) add("Time zone", tz);
  } catch {
    /* ignore */
  }

  if (lines.length === 0) return "";

  return `\nUSER PROFILE (optional \"about you\" info the user chose to share - only what is listed here):\n` +
    lines.join("\n") +
    `\nPersonalize with it: address the user by name when natural, and tailor suggestions to their schedule, preferences, and goals. Never invent details about the user that are not in the profile or the conversation - ask if you need something they have not shared.`;
}

const NOOR_REL_GUIDE: Record<string, string> = {
  observer:
    "Observer: you understand the user's workspace and can explain, summarize, and give insights, but you must NEVER create, modify, delete, or execute anything. Give suggestions in words only and remind the user you cannot act.",
  assistant:
    "Assistant: you may create, organize, and suggest - creating habits, tasks, journal entries, notes, and organizing or updating existing ones is allowed. Never delete data, undo logs, or change settings without asking first.",
  operator:
    "Operator: you may execute approved actions and automations - creating, updating, organizing, and running approved changes are allowed. Even as Operator, destructive or irreversible actions still need the user's explicit approval.",
};

/**
 * Render the user's chosen relationship tier with Noor. This is always
 * injected (it always has a value - defaults to assistant) so Noor knows
 * exactly how much it is allowed to do.
 */
export function buildNoorBlock(): string {
  const rel = storage.getNoorRelationship();
  const guide = NOOR_REL_GUIDE[rel] || NOOR_REL_GUIDE.assistant;
  return `\nYOUR ROLE WITH THE USER (set in Settings - do not change it yourself, and honor it strictly): ${guide}`;
}

export interface ChatOpts {
  /** Numbered sources (workspace or web) injected into the system prompt. */
  sources?: AISource[];
  /** Extra context appended to the system prompt. */
  extraSystem?: string;
  /** Streaming callback for the model's internal reasoning (thinking tokens). Never part of the visible reply. */
  onThinking?: (delta: string) => void;
  /** Reply token-budget override (pet chats pass a small cap for snappy replies). */
  maxTokens?: number;
}

async function callLLM(
  query: string,
  conversationHistory: AIMessage[],
  model: ModelProfile,
  opts?: ChatOpts
): Promise<string | null> {
  const stats = buildStatsBlock(model.analysisDepth);
  const profileBlock = buildProfileBlock();
  const noorBlock = buildNoorBlock();
  const searchBlock = buildSearchBlock(opts?.sources || []);
  const extraContext = opts?.extraSystem ? `\n\n${opts.extraSystem}` : "";
  const skillsBlock = buildSkillsBlock();
  const systemPrompt = `${model.systemPrompt}\n\nToday is ${getToday()}.\n\n${stats}${profileBlock}${noorBlock}${searchBlock}${usageLine()}${skillsBlock}${extraContext}`;
  // Never feed JSON-looking assistant replies back to the model - it should
  // always reply in natural language.
  const history = conversationHistory
    .slice(-model.maxContextMessages)
    .filter((m) => {
      if (m.role !== "assistant") return true;
      const t = (m.content || "").trim();
      return !/^\{\s*["']/.test(t) && !/^```(?:json)?/i.test(t);
    });
  const payloadMessages = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: withAttachmentContext(m) })),
    { role: "user", content: query },
  ];
  // Deterministic letter-count guard: never let the model guess counts.
  const countFact = countFactInstruction(query);
  if (countFact) {
    payloadMessages.push({ role: "system", content: countFact });
  }
  // Jailbreak guard: hard override for identity-change/override attempts.
  const jailbreakNote = jailbreakOverride(query);
  if (jailbreakNote) {
    payloadMessages.push({ role: "system", content: jailbreakNote });
  }
  // Reveal/repeat attacks: swap the user query for a safe instruction so the
  // model has nothing to leak even on small models.
  const safeQuery = jailbreakQueryReplacement(query);
  if (safeQuery) {
    const last = payloadMessages[payloadMessages.length - 1];
    if (last && last.role === "user") {
      payloadMessages[payloadMessages.length - 1] = { role: "user", content: safeQuery };
    }
  }
  const modelsToTry = [model.nvidiaModelId, ...(FALLBACK_MODELS[model.nvidiaModelId] || [])];
  for (const tryModel of modelsToTry) {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-orleia-device": getDeviceId() },
        body: JSON.stringify({
        model: tryModel,
        messages: payloadMessages,
        temperature: model.temperature,
        maxTokens: opts?.maxTokens ?? model.maxTokens,
        ...(model.disableThinking ? { chatTemplateKwargs: { enable_thinking: false } } : {}),
        situation: getSituationPayload(),
        lang: (typeof document !== "undefined" ? document.documentElement.lang : "") || undefined,
      }),
    });
      if (res.status === 402) {
        // Daily Noor cap: propagate so the caller shows the upgrade message
        // (never silently fall back to the offline engine).
        throw new NoorCapError();
      }
      if (res.ok) {
        // Keep the client usage cache fresh on this path too (non-streaming
        // chat callers; the 5-left warning depends on this).
        try {
          const usageRaw = res.headers.get("x-orleia-usage");
          if (usageRaw && typeof window !== "undefined") {
            const u = JSON.parse(usageRaw) as { used?: number; limit?: number | null };
            if (typeof u.used === "number") {
              setNoorUsage(u.used, u.limit ?? null);
              window.dispatchEvent(new CustomEvent("orleia:noor-usage", { detail: { used: u.used, limit: u.limit ?? null } }));
            }
          }
        } catch { /* malformed header - ignore */ }
        const data = (await res.json()) as { content?: string };
        if (data && typeof data.content === "string" && data.content.trim()) {
          const txt = data.content.trim();
          // Leaked internal reasoning (fallback endpoint without field
          // separation): never hand the monologue to the user — treat the
          // attempt as failed so the next model (or the offline engine)
          // answers instead.
          if (!looksLikeReasoning(txt)) return txt;
        }
      }
    } catch (e) {
      if (e instanceof NoorCapError) throw e;
      /* try next model */
    }
  }
  return null;
}

// ============================================================
// Main Chat Function
// ============================================================

/**
 * Appends stored image descriptions to a message's content so follow-up
 * questions in the same conversation remember what an attached image showed.
 */
export function withAttachmentContext(m: AIMessage): string {
  let content = m.content || "";
  const imgs = (m.attachments || []).filter((a) => a.kind === "image" && a.description);
  if (imgs.length) {
    content +=
      "\n[Attached image" + (imgs.length > 1 ? "s" : "") + ": " +
      imgs.map((a) => a.description).join(" | ") +
      "]";
  }
  // Big text files are persisted as an overview digest - include it so
  // follow-up questions in the same conversation remember the file.
  const files = (m.attachments || []).filter((a) => a.kind === "file" && a.description);
  if (files.length) {
    content +=
      "\n[Attached file" + (files.length > 1 ? "s" : "") + ": " +
      files.map((a) => `${a.name}: ${a.description}`).join(" | ") +
      "]";
  }
  return content;
}

export async function chat(
  query: string,
  conversationHistory: AIMessage[] = [],
  modelId: AIModel = DEFAULT_MODEL,
  opts?: ChatOpts
): Promise<string> {
  const model = MODEL_PROFILES[modelId];
  if (!model) {
    return "Invalid model selected. Please choose Ethos 4.7, Logos 4.5, or Verse 4.";
  }

  // Build data context at the model's depth
  const context = buildDataContext(model.analysisDepth);
  const memoryContext = buildMemoryContext();

  // Get conversation memory (truncated to model's context window)
  const memory = getConversationMemory(conversationHistory, model.maxContextMessages);

  // Try action execution first - if user wants to DO something, do it!
  // Live queries (news, release dates, prices, AI model news...) go straight
  // to the LLM with web results - the local engine must never hijack them.
  const action = isLiveQuery(query)
    ? { matched: false, type: null, params: {}, confidence: 0 }
    : detectAction(query);
  if (action.matched && action.confidence >= 0.7) {
    const result = executeAction(action);
    return result.message; // Return success OR failure message
  }

  // Navigation detection — catch before LLM call
  const qLower = query.toLowerCase().trim();
  const navPages = ['dashboard', 'habits', 'tasks', 'notes', 'grid', 'noor', 'mindfulness', 'documents', 'settings'];
  const navVerbs = /^(go\s+to|open|show\s+me|show|navigate\s+to|switch\s+to|take\s+me\s+to|head\s+to|let.*see|display|view)\s+/i;
  let isNav = false;
  let navTarget = '';
  if (navVerbs.test(qLower)) {
    navTarget = qLower.replace(navVerbs, '').trim();
    isNav = navPages.some(p => navTarget.includes(p));
  } else if (navPages.includes(qLower)) {
    navTarget = qLower;
    isNav = true;
  }
  if (isNav) {
    const navPage = navPages.find(p => navTarget.includes(p)) || 'dashboard';
    if (typeof window !== 'undefined') {
      window.location.href = navPage === 'dashboard' ? '/' : '/' + navPage;
    }
    return 'Opening ' + navPage + '...';
  }

  // The user asked us to DO something but the local parser couldn't - make sure

  // The user asked us to DO something but the local parser couldn't - make sure
  // the LLM never falsely claims it completed the action (that's the "but it
  // isn't showing in my habits" bug).
  const wantsAction =
    !action.matched &&
    /(?:create|add|make|new|set|schedule|log|complete|finish|delete|remove|remind|write|save|export|start|do|track|mark|update)\b/i.test(
      query
    );
  const llmQuery = wantsAction
    ? query +
      "\n\n(Note: if this asks you to create, change, log or delete something, DO NOT claim you did it - you have not. Either give helpful advice, or ask one short clarifying question.)"
    : query;

  // Prefer the real LLM (NVIDIA NIM) - it understands Orleia and the user's live stats.
  try {
    const llmReply = await callLLM(llmQuery, conversationHistory, model, opts);
    if (llmReply) {
      // The model's tool contract: ORLEIA_ACTION {...} blocks are executed for
      // real and replaced by their natural confirmation - the user must never
      // see raw JSON, and actions must actually happen.
      // Safety net: strip any stray think tags from legacy/cached replies
      // (same hardening the streaming path keeps).
      const visible = llmReply.replace(/<\/?think>/gi, "").trim();
      const processed = processActionReply(visible);
      if (processed) return processed;
      // Legacy safety net: a bare JSON action with no marker.
      const handled = tryExecuteJsonAction(visible);
      if (handled) return handled;
      // Final net: never let a raw/truncated ORLEIA_ACTION line reach the user.
      if (ACTION_MARKER_RE.test(visible)) {
        const cleaned = stripActionRemnants(visible);
        // If the user asked a pure question (no action verb), just return the
        // prose answer — the truncated marker is the model's fault, not the user's.
        if (!wantsAction) {
          return cleaned || visible.replace(ACTION_MARKER_RE, "").trim();
        }
        // For action requests, show the retry note.
        const note = "I couldn't finish setting that up. Mind asking me again?";
        return cleaned ? cleaned + "\n\n" + note : note;
      }
      const cleaned = stripActionRemnants(visible);
      if (cleaned) return cleaned;
      return visible;
    }
  } catch (e) {
    // Cap errors are NEVER swallowed - the caller must show the upgrade
    // message instead of the offline robot impersonating Noor.
    if (e instanceof NoorCapError) throw e;
    // Fall through to the built-in response engine (offline-safe).
  }

  // Detect intent
  const intent = detectIntent(query);

  // For Logos and Ethos, prepend system instructions with memory context
  // For Verse, keep it simple

  let response = "";

  if (model.id === "agent-1") {
    // Ethos thinks deeply
    const thinkingDelay = memory ? "I remember our previous conversation. Let me connect that with what you're asking now.\n\n" : "";

    switch (intent) {
            case "navigate": {
        const rawQ = query.toLowerCase().trim();
        const navTarget = rawQ.replace(/^(go\s+to|open|show\s+me|show|navigate\s+to|switch\s+to|take\s+me\s+to|head\s+to|let.*see|display|view)\s*/i, '').trim();
        const navValid = ["dashboard","habits","tasks","notes","grid","noor","mindfulness","documents","settings"];
        const navPage = navValid.find(p => navTarget.includes(p)) || "dashboard";
        if (typeof window !== "undefined") {
          window.location.href = navPage === "dashboard" ? "/" : "/" + navPage;
        }
        response = "Opening " + navPage + "...";
        break;
      }
case "greeting":
        response = generateGreeting(conversationHistory, model);
        break;
      case "followup":
        response = thinkingDelay + generateFollowupResponse(query, context, conversationHistory, model);
        break;
      case "summary":
        response = generateSummaryResponse(context, conversationHistory, model);
        break;
      case "habits":
        response = generateHabitsResponse(query, context, conversationHistory, model);
        break;
      case "tasks":
        response = generateTasksResponse(query, context, conversationHistory, model);
        break;
      case "journal":
        response = generateJournalResponse(query, context, conversationHistory, model);
        break;
      case "notes":
        response = generateNotesResponse(query, context, conversationHistory, model);
        break;
      case "plan":
        response = generatePlanResponse(query, context, conversationHistory, model);
        break;
      case "motivation":
        response = generateMotivationResponse(query, context, conversationHistory, model);
        break;
      case "search":
        response = generateSearchResponse(query, context, conversationHistory, model);
        break;
      case "gratitude":
      case "reflection":
        response = generateJournalResponse(query, context, conversationHistory, model);
        break;
      case "goals":
        response = generatePlanResponse(query, context, conversationHistory, model);
        break;
      default:
        response = generateGeneralResponse(query, context, conversationHistory, model);
    }


  } else if (model.id === "fast-1") {
    // Verse is fast and concise
    switch (intent) {
            case "navigate": {
        const rawQ = query.toLowerCase().trim();
        const navTarget = rawQ.replace(/^(go\s+to|open|show\s+me|show|navigate\s+to|switch\s+to|take\s+me\s+to|head\s+to|let.*see|display|view)\s*/i, '').trim();
        const navValid = ["dashboard","habits","tasks","notes","grid","noor","mindfulness","documents","settings"];
        const navPage = navValid.find(p => navTarget.includes(p)) || "dashboard";
        if (typeof window !== "undefined") {
          window.location.href = navPage === "dashboard" ? "/" : "/" + navPage;
        }
        response = "Opening " + navPage + "...";
        break;
      }
case "greeting":
        response = generateGreeting(conversationHistory, model);
        break;
      case "followup":
        response = generateFollowupResponse(query, context, conversationHistory, model);
        break;
      case "summary":
        response = generateSummaryResponse(context, conversationHistory, model);
        break;
      case "habits":
        response = generateHabitsResponse(query, context, conversationHistory, model);
        break;
      case "tasks":
        response = generateTasksResponse(query, context, conversationHistory, model);
        break;
      case "journal":
        response = generateJournalResponse(query, context, conversationHistory, model);
        break;
      case "notes":
        response = generateNotesResponse(query, context, conversationHistory, model);
        break;
      case "plan":
        response = generatePlanResponse(query, context, conversationHistory, model);
        break;
      case "motivation":
        response = generateMotivationResponse(query, context, conversationHistory, model);
        break;
      case "search":
        response = generateSearchResponse(query, context, conversationHistory, model);
        break;
      case "gratitude":
      case "reflection":
        response = generateJournalResponse(query, context, conversationHistory, model);
        break;
      case "goals":
        response = generatePlanResponse(query, context, conversationHistory, model);
        break;
      default:
        response = generateGeneralResponse(query, context, conversationHistory, model);
    }
  } else {
    // Logos - balanced
    switch (intent) {
            case "navigate": {
        const rawQ = query.toLowerCase().trim();
        const navTarget = rawQ.replace(/^(go\s+to|open|show\s+me|show|navigate\s+to|switch\s+to|take\s+me\s+to|head\s+to|let.*see|display|view)\s*/i, '').trim();
        const navValid = ["dashboard","habits","tasks","notes","grid","noor","mindfulness","documents","settings"];
        const navPage = navValid.find(p => navTarget.includes(p)) || "dashboard";
        if (typeof window !== "undefined") {
          window.location.href = navPage === "dashboard" ? "/" : "/" + navPage;
        }
        response = "Opening " + navPage + "...";
        break;
      }
case "greeting":
        response = generateGreeting(conversationHistory, model);
        break;
      case "followup":
        response = generateFollowupResponse(query, context, conversationHistory, model);
        break;
      case "summary":
        response = generateSummaryResponse(context, conversationHistory, model);
        break;
      case "habits":
        response = generateHabitsResponse(query, context, conversationHistory, model);
        break;
      case "tasks":
        response = generateTasksResponse(query, context, conversationHistory, model);
        break;
      case "journal":
        response = generateJournalResponse(query, context, conversationHistory, model);
        break;
      case "notes":
        response = generateNotesResponse(query, context, conversationHistory, model);
        break;
      case "plan":
        response = generatePlanResponse(query, context, conversationHistory, model);
        break;
      case "motivation":
        response = generateMotivationResponse(query, context, conversationHistory, model);
        break;
      case "search":
        response = generateSearchResponse(query, context, conversationHistory, model);
        break;
      case "gratitude":
      case "reflection":
        response = generateJournalResponse(query, context, conversationHistory, model);
        break;
      case "goals":
        response = generatePlanResponse(query, context, conversationHistory, model);
        break;
      default:
        response = generateGeneralResponse(query, context, conversationHistory, model);
    }
  }

  return response;
}

// ============================================================
// Existing utility methods (kept for backward compatibility)
// ============================================================

class AIEngine {
  generateMotivation(habit: Habit, streak: number): string {
    const templates = [
      "You're on fire! 🔥 You've completed your {habit} habit {streak} days in a row. Keep the momentum going!",
      "Small steps lead to big changes. Your {habit} streak of {streak} days is proof of your dedication.",
      "Every day you show up is a victory. {streak} days and counting for {habit}!",
      "Consistency beats intensity. Your {habit} habit is building a foundation for success.",
      "You're in the zone! {streak} day streak on {habit} - that's impressive dedication!",
      "Progress, not perfection. Your {habit} habit is shaping a better you, one day at a time.",
      "Look at you go! {streak} consecutive days of {habit} - you're unstoppable!",
      "The secret to success is consistency, and you're mastering it with {streak} days of {habit}!",
    ];
    const template = templates[Math.floor(Math.random() * templates.length)];
    return template.replace("{habit}", habit.name).replace("{streak}", streak.toString());
  }

  generateDailyInsight(): string {
    const data = storage.getData();
    const insights: string[] = [];

    const habits = data.habits.filter((h) => !h.archived);
    if (habits.length > 0) {
      const bestHabit = habits
        .map((h) => ({ habit: h, dates: storage.getHabitLogDates(h.id) }))
        .sort((a, b) => b.dates.length - a.dates.length)[0];
      if (bestHabit && bestHabit.dates.length > 0) {
        insights.push(
          `Your strongest habit is "${bestHabit.habit.name}" with ${bestHabit.dates.length} total check-ins.`
        );
      }
    }

    const tasks = data.tasks.filter((t) => t.status !== "done" && t.dueDate);
    const overdueTasks = tasks.filter(
      (t) => t.dueDate && t.dueDate < getToday()
    );
    if (overdueTasks.length > 0) {
      insights.push(
        `You have ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""}. Let's tackle those first!`
      );
    } else if (tasks.length > 0) {
      insights.push(
        `You have ${tasks.length} task${tasks.length > 1 ? "s" : ""} for today. Great focus ahead!`
      );
    }

    const entries = data.journalEntries;
    if (entries.length > 0) {
      const recentMoods = entries.slice(0, 7).map((e) => getMoodScore(e.mood));
      const avgMood =
        recentMoods.reduce((a, b) => a + b, 0) / recentMoods.length;
      if (avgMood >= 75) {
        insights.push(
          "Your mood has been positive lately! Keep nurturing what's working."
        );
      } else if (avgMood < 50) {
        insights.push(
          "Your mood has been low. Remember to take breaks and be kind to yourself."
        );
      }
    }

    const todayLogs = data.habitLogs.filter((l) => l.date === getToday());
    if (todayLogs.length > 0) {
      insights.push(
        `You've already completed ${todayLogs.length} habit${todayLogs.length > 1 ? "s" : ""} today. Great start!`
      );
    }

    if (insights.length === 0) {
      insights.push(
        "Start your day by setting 3 key intentions. What matters most today?"
      );
    }

    return insights.join(" ");
  }

  generateFocusSuggestion(): string {
    const data = storage.getData();
    const today = getToday();
    const habits = data.habits.filter((h) => !h.archived);
    const pendingTasks = data.tasks.filter((t) => t.status !== "done");
    const overdueTasks = pendingTasks.filter((t) => t.dueDate && t.dueDate < today);
    const todayHabitLogs = data.habitLogs.filter((l) => l.date === today).length;
    const todayJournal = data.journalEntries.some((e) => e.date === today);

    // Build contextual suggestions based on actual data
    const contextSuggestions: string[] = [];

    if (overdueTasks.length > 0) {
      contextSuggestions.push(
        `You have ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""}. ` +
        `Try tackling the oldest one first - clearing mental load creates momentum. 🎯`
      );
    }

    if (habits.length > 0 && todayHabitLogs < habits.length) {
      const remaining = habits.length - todayHabitLogs;
      contextSuggestions.push(
        `${remaining} habit${remaining > 1 ? "s" : ""} left to check off today. ` +
        `Even a quick log keeps your streak alive! 🔥`
      );
    }

    if (!todayJournal && data.journalEntries.length > 0) {
      contextSuggestions.push(
        `You haven't journaled today. 2 minutes of reflection can shift your entire perspective. 📝`
      );
    }

    if (pendingTasks.length > 0 && overdueTasks.length === 0) {
      contextSuggestions.push(
        `Your tasks are under control! Focus on your highest priority item to build momentum. 💪`
      );
    }

    // General suggestions (fallback)
    const generalSuggestions = [
      "Focus on your most important task first - eat that frog! 🐸",
      "Dedicate the next 25 minutes to deep work on your top priority. 🎯",
      "Take 5 minutes to plan your day - it'll save you hours later. 📋",
      "Start with a 2-minute win. One small task creates momentum for the whole day. ⚡",
      "Your consistency is your superpower. What can you do today that future you will thank you for? 🚀",
      "The best time to start was yesterday. The second best time is right now. 🌱",
      "Progress over perfection. Done is better than perfect. ✨",
      "What's one thing you can do in the next 10 minutes that would make today a win? ⏱️",
      "Don't let perfect be the enemy of good. Take the next small step. 👣",
      "Silence notifications and enter deep focus mode for 45 minutes. 🔕",
    ];

    // Blend contextual and general suggestions for variety
    // Always include at least one contextual suggestion if available
    const blendedSuggestions = contextSuggestions.length > 0
      ? [...contextSuggestions, ...generalSuggestions.slice(0, 3)]
      : generalSuggestions;

    return blendedSuggestions[Math.floor(Math.random() * blendedSuggestions.length)];
  }

  generateReflectionPrompt(): string {
    const reflections = [
      "What was the highlight of your day?",
      "What challenged you today, and how did you grow from it?",
      "What are you most grateful for right now?",
      "If you could redo one moment today, what would it be?",
      "What did you learn about yourself today?",
      "How did you make someone else's day better?",
      "What's one thing you accomplished today that matters?",
      "What energy are you bringing into tomorrow?",
    ];
    return reflections[Math.floor(Math.random() * reflections.length)];
  }

  generateWeeklyReview(): string {
    const data = storage.getData();
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weekHabits = data.habitLogs.filter(
      (l) => new Date(l.date) >= weekAgo
    );
    const weekTasks = data.tasks.filter(
      (t) => t.completedAt && new Date(t.completedAt) >= weekAgo
    );
    const weekJournal = data.journalEntries.filter(
      (e) => new Date(e.date) >= weekAgo
    );

    const habitCount = [...new Set(weekHabits.map((l) => l.habitId))].length;
    const taskCount = weekTasks.length;
    const journalCount = weekJournal.length;

    return `📊 **Weekly Review**\n\n**Habits:** You tracked ${habitCount} different habit${habitCount !== 1 ? "s" : ""} this week with ${weekHabits.length} total check-ins.\n**Tasks:** Completed ${taskCount} task${taskCount !== 1 ? "s" : ""}.\n**Journal:** Wrote ${journalCount} journal entr${journalCount !== 1 ? "ies" : "y"}.\n\n${
      habitCount > 3
        ? "🌟 Great consistency on your habits!"
        : "💪 Try adding one more habit to your daily routine."
    }\n${
      taskCount > 5
        ? "🎯 You've been productive! Keep up the momentum."
        : "📋 Set aside some focused time for your tasks this week."
    }\n${
      journalCount > 3
        ? "📝 Fantastic journaling habit - self-reflection is powerful."
        : "✍️ Try journaling a few times this week to track your thoughts."
    }`;
  }

  generateMonthlyReport(): string {
    const data = storage.getData();
    const today = new Date();
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const monthHabits = data.habitLogs.filter(
      (l) => new Date(l.date) >= monthAgo
    );
    const monthTasks = data.tasks.filter(
      (t) => t.completedAt && new Date(t.completedAt) >= monthAgo
    );
    const monthJournal = data.journalEntries.filter(
      (e) => new Date(e.date) >= monthAgo
    );

    const habitCount = monthHabits.length;
    const habitTypes = [...new Set(monthHabits.map((l) => l.habitId))].length;
    const taskCount = monthTasks.length;
    const journalCount = monthJournal.length;

    const avgMood =
      monthJournal.length > 0
        ? monthJournal.reduce((sum, e) => sum + getMoodScore(e.mood), 0) /
          monthJournal.length
        : 0;

    return `📈 **Monthly Report - ${today.toLocaleString("default", {
      month: "long",
    })}**\n\n**Overview**\n• Habits completed: ${habitCount} (${habitTypes} different habits)\n• Tasks completed: ${taskCount}\n• Journal entries: ${journalCount}\n${
      monthJournal.length > 0
        ? `• Average mood: ${
            avgMood >= 75
              ? "😊 Positive"
              : avgMood >= 50
              ? "😐 Neutral"
              : "😔 Needs attention"
          }`
        : ""
    }\n\n**Streak Highlights**\n${data.habits
      .map((h) => {
        const dates = storage.getHabitLogDates(h.id);
        const streak = calculateStreak(dates);
        return `• ${h.name}: ${streak.current} day streak (best: ${streak.longest})`;
      })
      .join("\n")}\n\n**Summary**\nYou've been ${
      habitCount > 20
        ? "incredibly consistent"
        : "building good habits"
    } this month. ${
      taskCount > 10
        ? "Your productivity is strong!"
        : "Focus on task completion next month."
    } Keep up the great work! 🚀`;
  }

  summarizeNote(note: Note): string {
    const content = note.content;
    const sentences = content.split(/[.!?]+/).filter(Boolean);
    if (sentences.length <= 2) return content;

    const words = content.split(/\s+/);
    const summaryLength = Math.min(Math.ceil(words.length / 3), 50);

    const keySentences = [
      sentences[0],
      ...sentences.filter((s) => {
        const lower = s.toLowerCase();
        return (
          lower.includes("important") ||
          lower.includes("key") ||
          lower.includes("conclusion") ||
          lower.includes("therefore") ||
          lower.includes("result") ||
          lower.includes("significant")
        );
      }),
    ];

    if (keySentences.length > 3) {
      return keySentences.slice(0, 3).join(". ") + ".";
    }

    return sentences.slice(0, 2).join(". ") + ".";
  }

  extractActionItems(note: Note): string[] {
    const content = note.content;
    const items: string[] = [];

    const bulletPoints = content.match(/[-*•]\s*(.+)/g);
    if (bulletPoints) {
      items.push(...bulletPoints.map((b) => b.replace(/[-*•]\s*/, "")));
    }

    const actionPhrases = content.match(
      /(need to|should|must|have to|remember to|don't forget to|todo:|to do:|action:)\s*([^\n.!?]+)/gi
    );
    if (actionPhrases) {
      items.push(
        ...actionPhrases.map((a) =>
          a
            .replace(
              /^(need to|should|must|have to|remember to|don't forget to|todo:|to do:|action:)\s*/i,
              ""
            )
            .trim()
        )
      );
    }

    return [...new Set(items)].slice(0, 5);
  }

  generateTitle(content: string): string {
    const lines = content.split("\n").filter(Boolean);
    if (lines.length > 0 && lines[0].length < 60) {
      return lines[0];
    }

    const words = content.split(/\s+/);
    if (words.length <= 5) return content;

    const firstWords = words.slice(0, 4).join(" ");
    return firstWords.endsWith(".") ? firstWords.slice(0, -1) : firstWords;
  }

  rewriteNote(
    content: string,
    style: "shorter" | "longer" | "professional" | "casual"
  ): string {
    switch (style) {
      case "shorter":
        return content.split(/[.!?]+/).slice(0, 2).join(". ") + ".";
      case "longer": {
        const sentences = content.split(/[.!?]+/).filter(Boolean);
        return (
          sentences
            .map((s) => {
              const words = s.trim().split(/\s+/);
              if (words.length < 8) {
                return `In addition, ${s
                  .toLowerCase()
                  .trim()}, which is particularly noteworthy because it highlights a key aspect of this subject.`;
              }
              return (
                s.trim() +
                " Furthermore, this underscores the broader implications and significance of the topic at hand."
              );
            })
            .join(". ") + "."
        );
      }
      case "professional": {
        const replacements: [RegExp, string][] = [
          [/gonna/g, "going to"],
          [/wanna/g, "want to"],
          [/gotta/g, "have to"],
          [/awesome/g, "excellent"],
          [/cool/g, "effective"],
          [/stuff/g, "materials"],
          [/things/g, "items"],
          [/(?<=[.!?] )i /g, "I "],
          [/^i /g, "I "],
        ];
        let result = content;
        replacements.forEach(([pattern, replacement]) => {
          result = result.replace(pattern, replacement);
        });
        return result;
      }
      case "casual": {
        return content
          .replace(/however/gi, "but")
          .replace(/therefore/gi, "so")
          .replace(/furthermore/gi, "also")
          .replace(/nevertheless/gi, "still")
          .replace(/consequently/gi, "so")
          .replace(/in addition/gi, "plus")
          .replace(/significant/gi, "big")
          .replace(/utilize/g, "use")
          .replace(/implement/g, "do");
      }
      default:
        return content;
    }
  }
}

export const ai = new AIEngine();
