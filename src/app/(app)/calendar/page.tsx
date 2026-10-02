"use client";

// ============================================================
// Orleia Calendar — month & week views, events with repeat,
// drag-to-reschedule, tasks with due dates shown automatically,
// and Noor weekly planning.
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  X,
  Calendar as CalendarIcon,
  Clock,
  ListTodo,
  Sparkles,
  Loader2,
  CalendarDays,
  Repeat,
  FolderKanban,
} from "lucide-react";
import { storage } from "@/lib/storage";
import { useI18n } from "@/lib/i18n";
import { cn, generateId, getToday } from "@/lib/utils";
import { chat } from "@/lib/ai";
import { parseQuickEvent } from "@/lib/quick-event";
import { TimeGrid, type GridOcc } from "@/components/calendar/TimeGrid";
import { useMobile } from "@/hooks/useMobile";
import type { CalendarEvent, Task } from "@/types";
const EVENT_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4", "#ef4444", "#a855f7"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + n);
  return iso(d);
}
function startOfWeek(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return iso(d);
}
function prettyDate(isoDate: string): string {
  return new Date(isoDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function habitTimeOfDay(t: string): string | null {
  if (t === "morning") return "07:00";
  if (t === "afternoon") return "12:00";
  if (t === "evening") return "19:00";
  return null; // anytime → all-day
}
function habitIsOnDay(h: { frequency: string; customDays?: number[]; createdAt: string }, day: string): boolean {
  const start = new Date(day + "T00:00:00");
  const created = new Date(h.createdAt.slice(0, 10) + "T00:00:00");
  if (start < created) return false; // habit did not exist yet
  if (h.frequency === "daily") return true;
  if (h.frequency === "weekly") return start.getDay() === 1; // Monday anchor
  if (h.frequency === "monthly") return start.getDate() === created.getDate();
  if (h.frequency === "custom") return Array.isArray(h.customDays) && h.customDays.includes(start.getDay());
  return false;
}

function fmtMin(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function minFromTime(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  if (isNaN(h)) return null;
  return h * 60 + (isNaN(m) ? 0 : m);
}

export default function CalendarPage() {
  const { t } = useI18n();
  const isMobile = useMobile();
  const [view, setView] = useState<"month" | "week" | "day">(() => (typeof window !== "undefined" && window.innerWidth < 640 ? "month" : "week"));
  const [cursor, setCursor] = useState<string>(() => getToday());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [noorPlan, setNoorPlan] = useState("");
  const [noorBusy, setNoorBusy] = useState(false);
  const [showNoor, setShowNoor] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickText, setQuickText] = useState("");
  const dragRef = useRef<{ eventId: string; fromDay: string } | null>(null);

  const refresh = useCallback(() => {
    setEvents(storage.getCalendarEvents());
    setTasks(storage.getTasks().filter((tk) => tk.status !== "done" && tk.status !== "archived" && tk.dueDate));
  }, []);
  useEffect(refresh, [refresh]);

  /* ---- Recurrence expansion ---- */
  const eventsOnDay = useCallback(
    (day: string): CalendarEvent[] => {
      const out: CalendarEvent[] = [];
      for (const ev of events) {
        if (ev.repeat === "none") {
          if (ev.date === day) out.push(ev);
        } else if (day >= ev.date) {
          const d1 = new Date(ev.date + "T00:00:00");
          const d2 = new Date(day + "T00:00:00");
          const diffDays = Math.round((d2.getTime() - d1.getTime()) / 86400000);
          if (ev.repeat === "daily") out.push(ev);
          else if (ev.repeat === "weekly" && diffDays % 7 === 0) out.push(ev);
          else if (ev.repeat === "monthly" && d2.getDate() === d1.getDate()) out.push(ev);
        }
      }
      return out.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
    },
    [events]
  );

  const tasksOnDay = useCallback(
    (day: string) => tasks.filter((tk) => tk.dueDate === day),
    [tasks]
  );

  /* ---- Month grid: 6 weeks starting Monday ---- */
  const monthDays = useMemo(() => {
    const first = new Date(cursor + "T00:00:00");
    first.setDate(1);
    const gridStart = startOfWeek(iso(first));
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  const weekDays = useMemo(() => {
    const s = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [cursor]);

  /* ---- Two-way sync: tasks, habits and projects appear as calendar items; ----
     calendar-created items flow back into their source tool so the tools
     (and Noor) stay the source of truth. All items are tagged via the marker
     suffix on description/notes so edits never create duplicates. */
  useEffect(() => {
    const events = storage.getCalendarEvents();
    const today = getToday();
    let changed = false;
    const addOrSync = (
      kind: "task" | "habit" | "project",
      id: string,
      title: string,
      day: string,
      time: string | null,
      color: string,
      description = ""
    ) => {
      const linkId = `sync:${kind}:${id}`;
      const existing = events.find((ev) => ev.notes === linkId);
      if (existing) {
        if (existing.date !== day || existing.title !== title || existing.time !== time) {
          storage.updateCalendarEvent(existing.id, { date: day, title, time });
          changed = true;
        }
        return;
      }
      storage.addCalendarEvent({
        title,
        date: day,
        time,
        color,
        repeat: "none",
        notes: linkId,
      });
      changed = true;
    };

    // Tasks: every task with a due date gets a calendar mirror.
    for (const tk of storage.getTasks()) {
      if (!tk.dueDate || tk.status === "archived") continue;
      if (tk.status === "done") {
        const existing = events.find((ev) => ev.notes === `sync:task:${tk.id}`);
        if (existing) {
          storage.deleteCalendarEvent(existing.id);
          changed = true;
        }
        continue;
      }
      addOrSync("task", tk.id, tk.title, tk.dueDate, tk.dueTime, tk.priority === "high" ? "#ef4444" : tk.priority === "low" ? "#22c55e" : "#6366f1", tk.description);
    }
    // Tasks with no due date keep their mirror on the last scheduled day.

    // Habits: scheduled occurrences (up to the month being viewed).
    for (const h of storage.getHabits()) {
      if (h.archived) continue;
      for (const day of monthDays) {
        if (!habitIsOnDay(h, day)) continue;
        addOrSync("habit", h.id, h.name, day, habitTimeOfDay(h.timeOfDay), h.color || "#a855f7");
      }
    }
    // Archived habits leave their mirrors behind; harmless history.

    // Projects: deadline = 3 weeks out (projects have no due date field).
    const horizon = (() => {
      const d = new Date(today + "T00:00:00");
      d.setDate(d.getDate() + 21);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    for (const p of storage.getProjects()) {
      if (p.status === "active") {
        addOrSync("project", p.id, p.name, horizon, "17:00", p.color || "#f59e0b");
      } else {
        const existing = events.find((ev) => ev.notes === `sync:project:${p.id}`);
        if (existing) {
          storage.deleteCalendarEvent(existing.id);
          changed = true;
        }
      }
    }

    if (changed) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthDays, refresh]);

  const shiftCursor = (dir: -1 | 1) => {
    const d = new Date(cursor + "T00:00:00");
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + dir); // day view steps one day at a time
    setCursor(iso(d));
  };

  const monthLabel = new Date(cursor + "T00:00:00").toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  /* ---- Event CRUD ---- */
  const openNew = (day: string) => {
    setEditing({ id: "", title: "", date: day, time: "09:00", color: EVENT_COLORS[0], repeat: "none", notes: "", createdAt: "" });
    setShowEventModal(true);
  };
  const openEdit = (ev: CalendarEvent) => {
    setEditing({ ...ev });
    setShowEventModal(true);
  };
  const saveEvent = () => {
    if (!editing || !editing.title.trim()) return;
    const { id, createdAt, ...rest } = editing;
    if (id) storage.updateCalendarEvent(id, rest);
    else storage.addCalendarEvent(rest);
    setShowEventModal(false);
    setEditing(null);
    refresh();
  };
  const removeEvent = (id: string) => {
    storage.deleteCalendarEvent(id);
    setShowEventModal(false);
    setEditing(null);
    refresh();
  };

  /* ---- Time-grid handlers (Cron-style week/day) ---- */
  const gridDays = useMemo(() => {
    if (view === "day") return [cursor];
    return weekDays;
  }, [view, cursor, weekDays]);

  const occFor = useCallback(
    (day: string): GridOcc[] => {
      const out: GridOcc[] = [];
      for (const ev of eventsOnDay(day)) {
        const start = minFromTime(ev.time);
        if (start === null) continue; // all-day items stay in the month view / day panel
        const end = Math.max(start + 15, minFromTime(ev.endTime) ?? start + 60);
        out.push({ ev, startMin: start, endMin: Math.min(end, 24 * 60) });
      }
      for (const tk of tasksOnDay(day)) {
        const start = minFromTime(tk.dueTime) ?? 12 * 60;
        const end = minFromTime(tk.dueTime) ? start + 30 : start + 60;
        out.push({
          ev: {
            id: `task:${tk.id}`, title: tk.title, date: day, time: tk.dueTime,
            color: tk.priority === "high" ? "#ef4444" : tk.priority === "low" ? "#22c55e" : "#6366f1",
            repeat: "none", notes: `sync:task:${tk.id}`, createdAt: "",
          } as unknown as CalendarEvent,
          startMin: start,
          endMin: Math.min(end, 24 * 60),
        });
      }
      return out.sort((a, b) => a.startMin - b.startMin);
    },
    [eventsOnDay, tasksOnDay]
  );

  const gridMove = (eventId: string, newDay: string, newStartMin: number) => {
    if (eventId.startsWith("task:")) {
      const id = eventId.slice(5);
      storage.updateTask(id, { dueDate: newDay, dueTime: fmtMin(newStartMin) });
      refresh();
      return;
    }
    storage.updateCalendarEvent(eventId, { date: newDay, time: fmtMin(newStartMin) });
    refresh();
  };
  const gridResize = (eventId: string, newEndMin: number) => {
    if (eventId.startsWith("task:")) return; // tasks are fixed 30/60-min blocks
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;
    const start = minFromTime(ev.time) ?? 9 * 60;
    const end = Math.max(start + 15, newEndMin);
    storage.updateCalendarEvent(eventId, { endTime: end >= 24 * 60 ? "23:59" : fmtMin(end) });
    refresh();
  };
  const gridCreate = (day: string, startMin: number, endMin: number) => {
    setEditing({
      id: "", title: "", date: day, time: fmtMin(startMin), endTime: fmtMin(endMin),
      color: EVENT_COLORS[0], repeat: "none", notes: "", createdAt: "",
    });
    setShowEventModal(true);
  };

  /* ---- Quick add (natural language) ---- */
  const submitQuick = () => {
    const parsed = parseQuickEvent(quickText);
    if (!parsed || !parsed.title.trim()) return;
    storage.addCalendarEvent({
      title: parsed.title,
      date: parsed.date,
      time: parsed.time,
      endTime: parsed.endTime,
      color: EVENT_COLORS[0],
      repeat: parsed.repeat,
      notes: "",
    });
    setQuickText("");
    setQuickOpen(false);
    setCursor(parsed.date);
    refresh();
  };

  /* ---- Keyboard (Cron-style) ---- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      if (showEventModal || showNoor || quickOpen) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case "c":
          e.preventDefault();
          setQuickOpen(true);
          break;
        case "t":
          e.preventDefault();
          setCursor(getToday());
          break;
        case "w":
          setView("week");
          break;
        case "d":
          setView("day");
          break;
        case "m":
          setView("month");
          break;
        case "j":
          shiftCursor(1);
          break;
        case "k":
          shiftCursor(-1);
          break;
        case "arrowright":
          shiftCursor(view === "month" ? 1 : 1);
          break;
        case "arrowleft":
          shiftCursor(-1);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, showEventModal, showNoor, quickOpen]);

  /* ---- Drag to reschedule ---- */
  const onDrop = (day: string) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.fromDay === day) return;
    const ev = events.find((e) => e.id === drag.eventId);
    if (!ev) return;
    // Only user-authored events are reschedulable; synced mirrors follow
    // their source tool (task due dates, habit schedules, project deadlines).
    if (ev.notes.startsWith("sync:")) return;
    storage.updateCalendarEvent(ev.id, { date: day, repeat: "none" });
    refresh();
  };

  /* ---- Noor weekly plan ---- */
  const askNoorPlan = async () => {
    setNoorBusy(true);
    setNoorPlan("");
    try {
      const habitList = storage.getHabits().filter((h) => !h.archived).map((h) => h.name).slice(0, 10);
      const taskList = tasks.map((tk) => `${tk.title}${tk.dueDate ? ` (due ${tk.dueDate})` : ""}`).slice(0, 20);
      const s = startOfWeek(cursor);
      const week = Array.from({ length: 7 }, (_, i) => addDays(s, i));
      const out = await chat(
        `Plan my week ${week[0]} to ${week[6]}. My open tasks: ${taskList.join("; ") || "none"}. Habits to keep up: ${habitList.join(", ") || "none"}. Reply as a simple day-by-day plan (one line per day, "Mon:" prefix style), each day with at most 3 concrete items drawn from my tasks/habits. Be specific and brief.`,
        [],
        "novella-medium",
        { extraSystem: "You are Noor planning a week inside Orleia Calendar. Output only the plan." }
      );
      setNoorPlan(out.trim());
    } catch {
      setNoorPlan("Noor is unavailable. Try again later.");
    } finally {
      setNoorBusy(false);
    }
  };

  const DayCell = ({ day }: { day: string }) => {
    const evs = eventsOnDay(day);
    const tks = tasksOnDay(day);
    const inMonth = day.slice(0, 7) === cursor.slice(0, 7);
    const isToday = day === getToday();
    // Unified chip model, matching the time grid: timed events render as
    // solid color chips with their time; all-day/synced items as tinted
    // chips with a colored dot; tasks as tinted chips with a dashed dot.
    interface Chip { key: string; color: string; time: string | null; title: string; kind: "event" | "task" | "habit" | "project"; ev?: CalendarEvent }
    const chips: Chip[] = [
      ...evs.map((ev) => ({
        key: ev.id,
        color: ev.color,
        time: ev.time,
        title: ev.title,
        kind: (ev.notes.startsWith("sync:habit:") ? "habit" : ev.notes.startsWith("sync:project:") ? "project" : "event") as Chip["kind"],
        ev,
      })),
      ...tks.map((tk) => ({ key: tk.id, color: tk.priority === "high" ? "#ef4444" : tk.priority === "low" ? "#22c55e" : "#6366f1", time: tk.dueTime, title: tk.title, kind: "task" as const })),
    ];
    const MAX = 3;
    return (
      <div
        onClick={() => setSelectedDay(day)}
        onDoubleClick={() => openNew(day)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => onDrop(day)}
        className={cn(
          "group flex min-h-[64px] cursor-pointer flex-col gap-0.5 border-b border-r border-border/50 p-1 transition-colors sm:min-h-[96px] sm:p-1.5",
          !inMonth && "opacity-40",
          isToday && "bg-primary-500/5",
          selectedDay === day ? "bg-secondary/60" : "hover:bg-secondary/40"
        )}
      >
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-medium tabular-nums",
              isToday ? "bg-foreground text-background" : "text-muted-foreground",
              !isToday && day.slice(8) === "01" && "font-semibold text-foreground",
            )}
          >
            {parseInt(day.slice(8))}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); openNew(day); }}
            className="hidden rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 sm:block"
            aria-label={`Add event on ${prettyDate(day)}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="hidden flex-col gap-[3px] sm:flex">
          {chips.slice(0, MAX).map((c) => {
            const isEvent = c.kind === "event" && c.ev && !c.ev.notes.startsWith("sync:");
            return (
              <button
                key={c.key}
                draggable={!!isEvent}
                onDragStart={isEvent ? () => { dragRef.current = { eventId: c.ev!.id, fromDay: day }; } : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  if (c.kind === "task") {
                    setSelectedDay(day);
                    return;
                  }
                  if (c.ev) openEdit(c.ev);
                }}
                className={cn(
                  "flex w-full items-center gap-1 truncate rounded-md px-1.5 py-[2px] text-left text-[11px] font-medium leading-tight text-background",
                  !isEvent && "ring-1 ring-inset ring-white/25 opacity-95",
                )}
                style={isEvent ? { backgroundColor: c.color } : { backgroundColor: c.color + "26", color: c.color }}
                title={`${c.title}${c.time ? " · " + c.time : ""}${c.kind !== "event" ? " — " + c.kind : ""}`}
              >
                {c.kind === "habit" && <Repeat className="h-2.5 w-2.5 shrink-0" />}
                {c.kind === "project" && <FolderKanban className="h-2.5 w-2.5 shrink-0" />}
                {c.kind === "task" && <ListTodo className="h-2.5 w-2.5 shrink-0" />}
                {c.time && <span className="shrink-0 tabular-nums opacity-90">{c.time}</span>}
                <span className="truncate">{c.title}</span>
              </button>
            );
          })}
          {chips.length > MAX && (
            <span className="px-1 text-[10px] font-medium text-muted-foreground">+{chips.length - MAX} more</span>
          )}
        </div>
        {/* Mobile: dots only - titles live in the day panel */}
        <div className="flex items-center gap-1 sm:hidden">
          {chips.slice(0, 4).map((c) => (
            <span key={c.key} className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
          ))}
          {chips.length > 4 && <span className="text-[9px] font-medium text-muted-foreground">+{chips.length - 4}</span>}
        </div>
      </div>
    );
  };
  const dayEvents = selectedDay ? eventsOnDay(selectedDay) : [];
  const dayTasks = selectedDay ? tasksOnDay(selectedDay) : [];

  return (
    <div className="flex h-dvh flex-col md:h-screen">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 pb-2 pt-[calc(4rem+env(safe-area-inset-top,0px))] sm:px-4 sm:py-2.5">
        <CalendarDays className="hidden h-5 w-5 text-muted-foreground sm:block" />
        <h1 className="text-sm font-bold tracking-tight sm:text-base">{monthLabel}</h1>
        <div className="flex items-center gap-0.5">
          <button onClick={() => shiftCursor(-1)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t("calendar.previous")}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setCursor(getToday())} className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">{t("calendar.today")}</button>
          <button onClick={() => shiftCursor(1)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t("calendar.next")}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex rounded-xl border border-border p-0.5">
          {(["month", "week", "day"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={cn("rounded-lg px-3 py-1 text-xs font-medium capitalize transition-colors", view === v ? "border border-foreground/40 text-foreground" : "border border-transparent text-muted-foreground hover:text-foreground")} aria-pressed={view === v}>
              {v}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={() => { setShowNoor(true); if (!noorPlan) askNoorPlan(); }} aria-label={t("calendar.plan_my_week")} className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:px-3">
          <Sparkles className="h-3.5 w-3.5" /><span className="hidden sm:inline">{t("calendar.plan_my_week")}</span></button>
        <button onClick={() => setQuickOpen(true)} aria-label="Quick add event" title="Quick add (C)" className="btn-primary flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:px-3">
          <Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Quick add</span></button>
      </div>

      {/* Grid */}
      {view === "month" ? (
        <div className="flex-1 overflow-auto p-2 sm:p-3">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="grid grid-cols-7 border-b border-border">
              {DOW.map((d) => (
                <div key={d} className="py-2 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthDays.map((day) => (
                <DayCell key={day} day={day} />
              ))}
            </div>
          </div>
          <p className="mt-3 hidden text-center text-[11px] text-muted-foreground sm:block">Press C for quick add · W week · D day · drag events to reschedule</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 p-2 sm:p-3">
          <div className="h-full">
            <TimeGrid
              days={gridDays}
              occFor={occFor}
              onMove={gridMove}
              onResize={gridResize}
              onCreate={gridCreate}
              onOpen={openEdit}
              isSynced={(ev) => ev.notes.startsWith("sync:") || ev.id.startsWith("task:")}
            />
          </div>
        </div>
      )}

      {/* Day detail */}
      <AnimatePresence>
        {selectedDay && (
          <motion.aside
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-0 right-0 top-[calc(4rem+env(safe-area-inset-top,0px))] z-[92] w-full max-w-sm overflow-y-auto border-l border-border bg-card p-4 md:top-16"
            aria-label={`Events on ${prettyDate(selectedDay)}`}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold">{prettyDate(selectedDay)}</p>
              <button onClick={() => setSelectedDay(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label={t("calendar.close")}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2">
              {dayEvents.length === 0 && dayTasks.length === 0 && (
                <p className="py-8 text-center text-xs text-muted-foreground">{t("calendar.nothing_planned_double_click_the_grid_to")}</p>
              )}
              {dayEvents.map((ev) => (
                <button key={ev.id} onClick={() => openEdit(ev)} className="flex w-full items-center gap-2.5 rounded-xl border border-border p-2.5 text-left hover:bg-secondary">
                  <span className="h-8 w-1.5 rounded-full" style={{ backgroundColor: ev.color }} />
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{ev.title}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {ev.time || "All day"}{ev.repeat !== "none" && ` · repeats ${ev.repeat}`}
                    </span>
                  </span>
                </button>
              ))}
              {dayTasks.map((tk) => (
                <div key={tk.id} className="flex items-center gap-2.5 rounded-xl border border-dashed border-border p-2.5">
                  <ListTodo className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-sm">{tk.title}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">task</span>
                </div>
              ))}
            </div>
            <button onClick={() => openNew(selectedDay)} className="btn-primary mt-4 flex w-full items-center justify-center gap-1.5 py-2 text-sm">
              <Plus className="h-4 w-4" />{t("calendar.add_event")}</button>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Quick add (natural language) modal */}
      <AnimatePresence>
        {quickOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[95] flex items-start justify-center bg-black/70 p-4 pt-[18vh] backdrop-blur-md" onClick={() => setQuickOpen(false)}>
            <motion.div
              initial={{ scale: 0.96, y: -8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: -8 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl rounded-2xl border border-border bg-card p-4 shadow-2xl"
              role="dialog"
              aria-label="Quick add event"
            >
              <input
                value={quickText}
                onChange={(e) => setQuickText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitQuick();
                  if (e.key === "Escape") setQuickOpen(false);
                }}
                placeholder={'Try: "Gym tomorrow 18:00" · "Moms birthday 26 Sep" · "Standup every monday 9:15"'}
                className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground/50"
                autoFocus
              />
              {(() => {
                const p = quickText.trim() ? parseQuickEvent(quickText) : null;
                if (!p || !p.title.trim()) return null;
                return (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="rounded-full bg-muted/60 px-2 py-0.5 font-medium text-foreground">{p.title}</span>
                    <span className="rounded-full bg-muted/40 px-2 py-0.5">{prettyDate(p.date)}</span>
                    <span className="rounded-full bg-muted/40 px-2 py-0.5">{p.time ? `${p.time}${p.endTime ? "–" + p.endTime : ""}` : "all-day"}</span>
                    {p.repeat !== "none" && <span className="rounded-full bg-primary-500/15 px-2 py-0.5 text-primary-500">{p.repeat}</span>}
                    <span className="ml-auto text-[10px] opacity-60">Enter to create</span>
                  </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Event modal */}
      <AnimatePresence>
        {showEventModal && editing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onClick={() => setShowEventModal(false)}>
            <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("calendar.event")} className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
              <p className="mb-4 text-sm font-bold">{editing.id ? "Edit event" : "New event"}</p>
              <input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder={t("calendar.title")}
                className="mb-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground/20"
                autoFocus
              />
              <div className="mb-3 grid grid-cols-3 gap-2">
                <label className="text-xs text-muted-foreground">{t("calendar.date")}<input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none" />
                </label>
                <label className="text-xs text-muted-foreground">Starts<input type="time" value={editing.time || ""} onChange={(e) => setEditing({ ...editing, time: e.target.value || null })} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none" />
                </label>
                <label className="text-xs text-muted-foreground">Ends<input type="time" value={editing.endTime || ""} onChange={(e) => setEditing({ ...editing, endTime: e.target.value || null })} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none" />
                </label>
              </div>
              <label className="mb-3 block text-xs text-muted-foreground">{t("calendar.repeat")}<select value={editing.repeat} onChange={(e) => setEditing({ ...editing, repeat: e.target.value as CalendarEvent["repeat"] })} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none">
                  <option value="none">{t("calendar.never")}</option>
                  <option value="daily">{t("calendar.daily")}</option>
                  <option value="weekly">{t("calendar.weekly")}</option>
                  <option value="monthly">{t("calendar.monthly")}</option>
                </select>
              </label>
              <div className="mb-3 flex gap-1.5">
                {EVENT_COLORS.map((c) => (
                  <button key={c} onClick={() => setEditing({ ...editing, color: c })} className={cn("h-6 w-6 rounded-full transition-transform", editing.color === c && "ring-2 ring-foreground ring-offset-2 ring-offset-card")} style={{ backgroundColor: c }} aria-label={`Color ${c}`} />
                ))}
              </div>
              <textarea
                value={editing.notes}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                placeholder={t("calendar.notes_optional")}
                rows={2}
                className="mb-4 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground/20"
              />
              <div className="flex gap-2">
                {editing.id && (
                  <button onClick={() => removeEvent(editing.id)} className="rounded-xl border border-destructive/30 p-2.5 text-destructive hover:bg-destructive/10" aria-label={t("calendar.delete_event")}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <button onClick={() => setShowEventModal(false)} className="flex-1 rounded-xl border border-border py-2.5 text-sm text-muted-foreground hover:text-foreground">{t("calendar.cancel")}</button>
                <button onClick={saveEvent} disabled={!editing.title.trim()} className="btn-primary flex-1 py-2.5 text-sm disabled:opacity-50">{t("calendar.save")}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Noor plan modal */}
      <AnimatePresence>
        {showNoor && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onClick={() => setShowNoor(false)}>
            <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("calendar.noor_weekly_plan")} className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-bold"><Sparkles className="h-4 w-4 text-primary-500" />{t("calendar.noor_s_plan_for_your_week")}</p>
              <p className="mb-3 text-xs text-muted-foreground">{t("calendar.based_on_your_open_tasks_and_habits")}</p>
              {noorBusy ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Planning…</div>
              ) : (
                <div className="whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-sm leading-relaxed">{noorPlan || "No plan yet."}</div>
              )}
              <div className="mt-4 flex gap-2">
                <button onClick={askNoorPlan} disabled={noorBusy} className="btn-ghost flex-1 border border-border py-2 text-sm disabled:opacity-50">{t("calendar.regenerate")}</button>
                <button onClick={() => setShowNoor(false)} className="btn-primary flex-1 py-2 text-sm">{t("calendar.done")}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
