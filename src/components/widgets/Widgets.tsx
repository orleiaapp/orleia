"use client";

// ============================================================
// Dashboard Widget Components
// Each widget is a self-contained card rendered in the dashboard.
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import {
  CheckCircle2,
  Sparkles,
  TrendingUp,
  Target,
  Flame,
  FileText,
  ArrowRight,
  Star,
  Play,
  Pause,
  RotateCcw,
  Smile,
  Meh,
  Frown,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { storage } from "@/lib/storage";
import { petById, petSvg } from "@/lib/pets";
import { PET_STAGE_SIZE, petStage } from "@/lib/pet-habits";
import { cn, formatDate, getToday, truncate } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { ensureWired, getGraph } from "@/lib/graph/engine";
import { buildSituationModel } from "@/lib/graph/situation";
import { useDashboardData } from "./useDashboardData";

/* ------------------------------------------------------------------ */
/* Productivity Score                                                  */
/* ------------------------------------------------------------------ */

export function ProductivityWidget() {
  const { t } = useI18n();
  const { situation } = useDashboardData();

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{t("dash.productivityScore")}</p>
          <h2 className="text-2xl font-bold mt-1">{situation.productivity}/100</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {situation.productivity >= 80
              ? t("dash.outstandingDay")
              : situation.productivity >= 50
              ? t("dash.goodProgress")
              : t("dash.buildMomentum")}
          </p>
        </div>
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
          <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90 overflow-visible">
            <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="5" className="text-muted-foreground/10" />
            <circle
              cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="5"
              strokeDasharray={`${2 * Math.PI * 26}`}
              strokeDashoffset={`${2 * Math.PI * 26 * (1 - situation.productivity / 100)}`}
              className="text-primary-500 transition-all duration-1000"
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums">{situation.productivity}</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Quick Stats                                                         */
/* ------------------------------------------------------------------ */

export function StatsWidget() {
  const { t } = useI18n();
  const { data } = useDashboardData();

  const today = getToday();
  const habits = data.habits.filter((h) => !h.archived);
  const completedToday = data.habitLogs.filter((l) => l.date === today).length;
  const todayTasks = data.tasks.filter((t) => {
    if (!t.dueDate) return false;
    return t.dueDate === today;
  });
  const todayDone = todayTasks.filter((t) => t.status === "done").length;

  const graph = getGraph();
  const journalStreak = (() => {
    let streak = 0;
    const d = new Date();
    while (true) {
      const ds = d.toISOString().split("T")[0];
      if (data.journalEntries.some((e) => e.date === ds)) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else break;
    }
    return streak;
  })();

  // Each stat jumps to the tab it summarizes (habits, tasks, journal, notes).
  const stats = [
    { label: t("dash.habitsToday"), value: `${completedToday}/${habits.length}`, icon: CheckCircle2, href: "/habits" },
    { label: t("dash.tasksToday"), value: `${todayDone}/${todayTasks.length}`, icon: Target, href: "/tasks" },
    { label: t("dash.journalStreak"), value: journalStreak > 0 ? `${journalStreak}d` : "-", icon: Flame, href: "/journal" },
    { label: "Notes", value: String(data.notes.length), icon: FileText, href: "/documents" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.map((stat) => (
        <Link
          key={stat.label}
          href={stat.href}
          aria-label={`${stat.label}: ${stat.value} — open ${stat.href.slice(1)}`}
          className="card card-hover group block cursor-pointer hover:border-foreground/25 dark:hover:border-foreground/40"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
            <stat.icon className="h-5 w-5 text-primary-500" />
          </div>
          <p className="mt-3 text-2xl font-bold">{stat.value}</p>
          <p className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
            {stat.label}
            <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
          </p>
        </Link>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Today's Tasks                                                       */
/* ------------------------------------------------------------------ */

export function TasksWidget() {
  const { t } = useI18n();
  const { data } = useDashboardData();

  const today = getToday();
  const tasks = data.tasks
    .filter((tk) => tk.status !== "done" && tk.dueDate === today)
    .slice(0, 5);

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{t("dash.tasksToday")}</h3>
        </div>
        <Link href="/tasks" className="text-xs text-primary-500 hover:text-primary-600 flex items-center gap-1">
          {t("dash.viewAll")} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center">No tasks for today 🎉</p>
      ) : (
        <div className="space-y-1.5">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-secondary transition-colors">
              <div
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                  task.status === "done" ? "bg-primary-500 border-primary-500" : "border-muted-foreground/30"
                )}
              >
                {task.status === "done" && <span className="text-white text-xs">✓</span>}
              </div>
              <span className={cn("text-sm truncate", task.status === "done" && "line-through text-muted-foreground")}>
                {task.title}
              </span>
              {task.priority === "urgent" && <span className="tag bg-muted text-muted-foreground text-[10px]">!</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Today's Habits                                                      */
/* ------------------------------------------------------------------ */

export function HabitsWidget() {
  const { t } = useI18n();
  const { data } = useDashboardData();

  const refresh = () => { /* shared hook handles re-renders */ };
  const today = getToday();
  const habits = data.habits.filter((h) => !h.archived).slice(0, 6);

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{t("dash.habitsToday")}</h3>
        </div>
        <Link href="/habits" className="text-xs text-primary-500 hover:text-primary-600 flex items-center gap-1">
          {t("dash.viewAll")} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {habits.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center">No habits yet — create one!</p>
      ) : (
        <div className="space-y-1.5">
          {habits.map((habit) => {
            const logged = storage.isHabitLogged(habit.id, today);
            return (
              <div key={habit.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-secondary transition-colors">
                <button
                  onClick={() => {
                    if (logged) storage.unlogHabit(habit.id, today);
                    else storage.logHabit(habit.id, today);
                    refresh();
                  }}
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all",
                    logged
                      ? "bg-primary-500 border-primary-500 text-white"
                      : "border-muted-foreground/30 hover:border-muted-foreground/60"
                  )}
                >
                  {logged && <CheckCircle2 className="h-3 w-3" />}
                </button>
                <span className={cn("text-sm", logged && "line-through text-muted-foreground")}>
                  {habit.name}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recent Notes                                                        */
/* ------------------------------------------------------------------ */

export function NotesWidget() {
  const { t } = useI18n();
  const { data } = useDashboardData();

  const notes = [...data.notes]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 3);

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Recent Notes</h3>
        </div>
        <Link href="/documents" className="text-xs text-primary-500 hover:text-primary-600 flex items-center gap-1">
          {t("dash.viewAll")} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {notes.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center">
          No notes yet — <Link href="/documents" className="text-primary-500 hover:underline">create one</Link>
        </p>
      ) : (
        <div className="space-y-1.5">
          {notes.map((note) => (
            <Link key={note.id} href="/documents" className="flex items-start gap-2.5 rounded-lg p-2 hover:bg-secondary transition-colors">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary border border-border/60">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{truncate(note.title, 35)}</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">{formatDate(note.updatedAt)}</p>
              </div>
              {note.pinned && <Star className="h-3 w-3 text-muted-foreground fill-zinc-400 shrink-0 mt-1" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Weekly Activity (streak heatmap)                                    */
/* ------------------------------------------------------------------ */

export function StreakWidget() {
  const { data } = useDashboardData();

  const days: { label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().split("T")[0];
    const habitsLogged = data.habitLogs.filter((l) => l.date === ds).length;
    const tasksDone = data.tasks.filter((t) => t.status === "done" && t.updatedAt?.startsWith(ds)).length;
    days.push({
      label: d.toLocaleDateString("en", { weekday: "narrow" }),
      count: habitsLogged + tasksDone,
    });
  }
  const max = Math.max(...days.map((d) => d.count), 1);

  return (
    <div className="card">
      <p className="text-sm font-semibold mb-3">Weekly Activity</p>
      <div className="flex items-end justify-between gap-2 h-20">
        {days.map((d, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="w-full rounded-md bg-primary-500/10 relative overflow-hidden" style={{ height: "100%" }}>
              <div
                className="absolute bottom-0 w-full rounded-md bg-primary-500 transition-all duration-500"
                style={{ height: `${(d.count / max) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground/60">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Daily Quote                                                         */
/* ------------------------------------------------------------------ */

const QUOTES = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "It is during our darkest moments that we must focus to see the light.", author: "Aristotle" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "What you get by achieving your goals is not as important as what you become.", author: "Zig Ziglar" },
  { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
  { text: "Small daily improvements over time lead to stunning results.", author: "Robin Sharma" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
];

export function QuoteWidget() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  const quote = QUOTES[dayOfYear % QUOTES.length];

  return (
    <div className="card">
      <p className="text-sm font-semibold mb-3">Daily Quote</p>
      <blockquote className="text-sm text-muted-foreground/80 italic leading-relaxed">
        &ldquo;{quote.text}&rdquo;
      </blockquote>
      <p className="text-xs text-muted-foreground/50 mt-2">— {quote.author}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Quick Note                                                          */
/* ------------------------------------------------------------------ */

export function QuickNoteWidget() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

  const save = () => {
    if (!text.trim()) return;
    setText("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="card">
      <p className="text-sm font-semibold mb-3">Quick Note</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Capture a thought..."
        rows={3}
        className="w-full resize-none rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary-500/40 placeholder:text-muted-foreground/40"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground/50">
          {saved ? "✓ Saved to Documents" : ""}
        </span>
        <button
          onClick={save}
          disabled={!text.trim()}
          className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background disabled:opacity-30 transition-all"
        >
          Save
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Focus Timer (Pomodoro)                                              */
/* ------------------------------------------------------------------ */

export function PomodoroWidget() {
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s <= 1) {
            clearInterval(intervalRef.current!);
            setRunning(false);
            return isBreak ? 25 * 60 : 5 * 60;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, isBreak]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const progress = 1 - seconds / (isBreak ? 5 * 60 : 25 * 60);

  return (
    <div className="card">
      <p className="text-sm font-semibold mb-3">Focus Timer</p>
      <div className="flex items-center gap-4">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
          <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90 overflow-visible">
            <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted-foreground/10" />
            <circle
              cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="4"
              strokeDasharray={`${2 * Math.PI * 26}`}
              strokeDashoffset={`${2 * Math.PI * 26 * (1 - progress)}`}
              className={cn("transition-all duration-1000", isBreak ? "text-emerald-500" : "text-primary-500")}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </span>
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground mb-2">{isBreak ? "Break time" : "Focus session"}</p>
          <div className="flex gap-1.5">
            <button
              onClick={() => setRunning(!running)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
                running ? "border border-primary-500/40 bg-primary-500/10 text-primary-500" : "border border-foreground/15 bg-transparent text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              )}
            >
              {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => { setRunning(false); setSeconds(isBreak ? 5 * 60 : 25 * 60); }}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-all"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mood Check-in                                                       */
/* ------------------------------------------------------------------ */

const MOODS = [
  { key: "great", icon: Smile, label: "Great", color: "text-emerald-500 bg-emerald-500/10" },
  { key: "good", icon: Smile, label: "Good", color: "text-sky-500 bg-sky-500/10" },
  { key: "meh", icon: Meh, label: "Okay", color: "text-muted-foreground bg-zinc-400/10" },
  { key: "bad", icon: Frown, label: "Not great", color: "text-amber-500 bg-amber-500/10" },
  { key: "awful", icon: Frown, label: "Awful", color: "text-red-500 bg-red-500/10" },
];

const MOOD_KEY = "orleia-mood-log";

export function MoodWidget() {
  const [logged, setLogged] = useState<string | null>(null);

  useEffect(() => {
    try {
      const log = JSON.parse(localStorage.getItem(MOOD_KEY) || "{}");
      const today = getToday();
      setLogged(log[today] || null);
    } catch { /* */ }
  }, []);

  const logMood = (key: string) => {
    try {
      const log = JSON.parse(localStorage.getItem(MOOD_KEY) || "{}");
      log[getToday()] = key;
      localStorage.setItem(MOOD_KEY, JSON.stringify(log));
      setLogged(key);
    } catch { /* */ }
  };

  return (
    <div className="card">
      <p className="text-sm font-semibold mb-3">Mood Check-in</p>
      {logged ? (
        <p className="text-sm text-muted-foreground/70">
          You&apos;re feeling <span className="font-medium text-foreground">{MOODS.find((m) => m.key === logged)?.label}</span> today ✓
        </p>
      ) : (
        <div className="flex gap-2">
          {MOODS.map((m) => (
            <button
              key={m.key}
              onClick={() => logMood(m.key)}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-xl border border-border p-2.5 text-center transition-all hover:border-muted-foreground/30 active:scale-95"
              )}
            >
              <m.icon className={cn("h-5 w-5", m.color.split(" ")[0])} />
              <span className="text-[10px] text-muted-foreground">{m.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Widget Registry — maps id → component                              */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/* Weekly Wrapped - shareable week summary                             */
/* ------------------------------------------------------------------ */

export function WeeklyWrappedWidget() {
  const { t } = useI18n();
  const { data } = useDashboardData();

  const { start, end } = (() => {
    const d = new Date();
    const day = (d.getDay() + 6) % 7; // Monday-first
    const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const iso = (x: Date) =>
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    return { start: iso(mon), end: iso(sun) };
  })();
  const inWeek = (ds: string | null) => !!ds && ds >= start && ds <= end;

  const tasksDone = data.tasks.filter((x) => x.status === "done" && inWeek((x.completedAt || "").slice(0, 10))).length;
  const habitLogs = data.habitLogs.filter((l) => inWeek(l.date)).length;
  const entries = data.journalEntries.filter((e) => inWeek(e.date));
  const words = entries.reduce((a, e) => a + (e.content || "").split(/\s+/).filter(Boolean).length, 0);
  const SC = { amazing: 5, good: 4, neutral: 3, bad: 2, terrible: 1 } as const;
  const withMood = entries.filter((e) => e.mood);
  const avgMood = withMood.length
    ? (withMood.reduce((a, e) => a + SC[e.mood], 0) / withMood.length).toFixed(1)
    : null;
  const bestStreak = data.habits.length
    ? Math.max(...data.habits.map((h) =>
        data.habitLogs.filter((l) => l.habitId === h.id).length))
    : 0;
  const total = tasksDone + habitLogs + entries.length;

  const Stat = ({ v, label }: { v: string | number; label: string }) => (
    <div className="rounded-xl bg-muted/60 px-2 py-2.5 text-center">
      <p className="text-xl font-bold leading-none">{v}</p>
      <p className="mt-1 text-[10px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );

  return (
    <div className="card relative overflow-hidden">
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary-500/10 blur-2xl" aria-hidden />
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary-500" />
          <h3 className="text-sm font-semibold">{t("dash.wrappedTitle")}</h3>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {new Date(start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          {" - "}
          {new Date(end).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      </div>
      {total === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">{t("dash.wrappedEmpty2")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat v={tasksDone} label={t("dash.wrappedTasks")} />
          <Stat v={habitLogs} label={t("dash.wrappedHabits")} />
          <Stat v={entries.length} label={t("dash.wrappedEntries")} />
          <Stat v={words} label={t("dash.wrappedWords")} />
          <Stat v={avgMood ?? "-"} label={t("dash.wrappedMood")} />
          <Stat v={bestStreak} label={t("dash.wrappedStreak")} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pet — the companion greets you on the Dashboard                     */
/* ------------------------------------------------------------------ */

export function PetWidget() {
  const { t } = useI18n();
  const { data } = useDashboardData();

  const today = getToday();
  const pet = petById(data.profile?.pet);
  if (!pet) return null;

  const mealsToday = data.habitLogs.filter((l) => l.date === today).length;
  const meals = data.habitLogs.length;
  const stage = petStage(meals);
  const name = (data.profile?.petName || "").trim() || pet.name;
  const shields = data.streakFreezeTokens ?? 0;

  // Time-of-day greeting: the pet is alive on the home screen.
  const hour = new Date().getHours();
  const moodKey =
    mealsToday === 0
      ? "habits.pet.hungry"
      : hour < 5
        ? "dash.pet.night"
        : hour < 12
          ? "dash.pet.morning"
          : hour < 18
            ? "dash.pet.afternoon"
            : "dash.pet.evening";

  return (
    <div className="card flex items-center gap-4">
      <motion.div
        animate={mealsToday > 0 ? { y: [0, -3, 0] } : { y: 0 }}
        transition={{ duration: 2.4, repeat: mealsToday > 0 ? Infinity : 0, ease: "easeInOut" }}
        className={cn(PET_STAGE_SIZE[stage.label], "shrink-0")}
        dangerouslySetInnerHTML={{ __html: petSvg(pet, "h-full w-full") }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold">{name}</p>
          {shields > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-sky-400">
              <ShieldCheck className="h-3 w-3" />
              {shields}
            </span>
          )}
        </div>
        <p className={cn("text-xs", mealsToday === 0 ? "text-amber-500" : "text-muted-foreground")}>
          {t(moodKey).replace("{name}", name)}
        </p>
      </div>
      <Link
        href="/habits"
        className="shrink-0 rounded-xl border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
      >
        {(mealsToday === 0 ? t("dash.pet.feed") : t("dash.pet.visit")).replace("{name}", name)}
      </Link>
    </div>
  );}

export const WIDGET_COMPONENTS: Record<string, React.ComponentType> = {
  productivity: ProductivityWidget,
  stats: StatsWidget,
  tasks: TasksWidget,
  habits: HabitsWidget,
  notes: NotesWidget,
  streak: StreakWidget,
  quote: QuoteWidget,
  "quick-note": QuickNoteWidget,
  pomodoro: PomodoroWidget,
  mood: MoodWidget,
  wrapped: WeeklyWrappedWidget,
  pet: PetWidget,
};
