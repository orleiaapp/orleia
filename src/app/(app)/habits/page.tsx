"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  CheckCircle2,
  Flame,
  Snowflake,
  BarChart2,
  Calendar,
  Target,
  TrendingUp,
  Trash2,
  Edit3,
  X,
  Sparkles,
  ShieldCheck,
  MoreHorizontal,
  BarChart3,
  Zap,
} from "lucide-react";
import { useLongPress, LongPressMenu } from "@/components/ui/long-press";
import { showUndo } from "@/lib/undo-toast";
import { storage } from "@/lib/storage";
import { useHydrated, useFirstVisit } from "@/lib/use-hydrated";
import { ai } from "@/lib/ai";
import { cn, getToday, calculateStreak, formatDate, getDaysInMonth, hexToRgba } from "@/lib/utils";
import { getFreezeState, setFreezeState, autoFreeze, checkPerfectWeek, freezeAwareStreak, flameStage, type FreezeState } from "@/lib/habit-game";
import { Habit, HabitFrequency, HabitTimeOfDay, DAYS_OF_WEEK } from "@/types";
import { useI18n } from "@/lib/i18n";
import { HABIT_ICONS, TIME_OF_DAY_ICONS, habitIconFor, habitIconName } from "@/lib/habit-icons";
import { PetMascot } from "@/components/habits/PetMascot";
import { petById } from "@/lib/pets";

const WEEK_HEADER = ["M", "T", "W", "T", "F", "S", "S"];
// Monday-first offset: getDay() is 0=Sun..6=Sat, so (getDay()+6)%7 gives 0=Mon
const monthPad = (year: number, month: number) => (new Date(year, month, 1).getDay() + 6) % 7;

export default function HabitsPage() {
  const { t } = useI18n();
  const [data, setData] = useState(storage.getData());
  const hydrated = useHydrated();
  const enter = useFirstVisit("habits");
  const [showForm, setShowForm] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [selectedHabit, setSelectedHabit] = useState<string | null>(null);
  const [tab, setTab] = useState<"habits" | "stats">("habits");
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());

  const refresh = () => setData({ ...storage.getData() });
  // The pet's display name, or empty when the user has no pet (toasts
  // then fall back to the petless copy).
  const petName = () =>
    (storage.getData().profile?.petName || "").trim() ||
    petById(storage.getData().profile?.pet)?.name ||
    "";
  const [freeze, setFreeze] = useState<FreezeState>(() => getFreezeState(storage.getData()));
  const [gameToast, setGameToast] = useState<string | null>(null);

  // Shortcut / deep-link: open the New Habit form (Ctrl+Shift+H or ?new=1).
  const router = useRouter();
  useEffect(() => {
    const openNew = () => { setEditingHabit(null); setShowForm(true); };
    window.addEventListener("orleia:new-habit", openNew);
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      openNew();
      router.replace("/habits", { scroll: false });
    }
    return () => window.removeEventListener("orleia:new-habit", openNew);
  }, [router]);
  useEffect(() => storage.subscribe(() => setData({ ...storage.getData() })), []);
  const today = getToday();
  const habits = data.habits.filter((h) => !h.archived);

  // ---- Streak game engine: auto-freeze dying streaks, track records,
  //      award perfect weeks. Converges (idempotent) so it can't loop.
  // Flicker guard: the engine only re-runs when its real inputs change
  // (log count / habit count / token balance), not on every storage write,
  // so the stat cards stop churning between renders.
  const engineSig = data.habitLogs.length + "|" + habits.length + "|" + freeze.freezeTokens;
  useEffect(() => {
    let next = freeze;
    let changed = false;
    for (const h of habits) {
      const dates = storage.getHabitLogDates(h.id);
      const af = autoFreeze(next, h.id, new Set(dates));
      if (af) {
        next = af; changed = true;
        // The pet spent one of its shields to defend the streak.
        const pn = petName();
        setGameToast(pn ? t("habits.pet.shieldSaved").replace("{name}", pn) : t("habits.streakSaved"));
      }
      const fas = freezeAwareStreak(next, h.id, dates);
      if (fas.state !== next) {
        next = fas.state; changed = true;
        if (fas.recordBeaten) setGameToast(t("habits.newRecord") + " · " + h.name);
      }
    }
    const logsByDate = new Map<string, Set<string>>();
    for (const l of data.habitLogs) {
      if (!logsByDate.has(l.date)) logsByDate.set(l.date, new Set());
      logsByDate.get(l.date)!.add(l.habitId);
    }
    const pw = checkPerfectWeek(next, habits, logsByDate);
    if (pw.state !== next) {
      changed = true;
      if (pw.awarded) {
        const pn = petName();
        setGameToast(pn ? t("habits.pet.shieldEarned").replace("{name}", pn) : t("habits.perfectWeek"));
      }
      next = pw.state;
    }
    if (changed) { setFreezeState(storage, next); setFreeze(next); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineSig]);

  useEffect(() => {
    if (!gameToast) return;
    const id = window.setTimeout(() => setGameToast(null), 3600);
    return () => window.clearTimeout(id);
  }, [gameToast]);

  const categories = data.habitCategories;

  const getHabitStats = (habitId: string) => {
    const dates = storage.getHabitLogDates(habitId);
    const streak = freezeAwareStreak(freeze, habitId, dates);
    const monthLogs = dates.filter((d) => {
      const date = new Date(d);
      return date.getMonth() === viewMonth && date.getFullYear() === viewYear;
    });
    const daysInMonth = getDaysInMonth(viewYear, viewMonth).length;
    return { dates, streak, monthLogs: monthLogs.length, daysInMonth };
  };

  const selectedHabitData = selectedHabit ? habits.find((h) => h.id === selectedHabit) : null;
  const selectedStats = selectedHabit ? getHabitStats(selectedHabit) : null;

  // Hydration gate: the SSR tree shows default data, then hydration swaps
  // in real localStorage data and replays every entrance animation —
  // the "blocks double load" flicker. Show a static skeleton until
  // mounted; real content then mounts once, cleanly.
  if (!hydrated) {
    return (
      <div className="relative space-y-6 md:space-y-8" aria-busy="true" aria-live="polite">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
            <div className="h-3 w-56 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-9 w-24 animate-pulse rounded-xl bg-muted" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="relative space-y-6 md:space-y-8">

      {/* Header */}
      <motion.div
        initial={enter ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="flex items-start justify-between relative"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-none">{t("habits.title")}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed mt-2 max-w-xs">
            {t("habits.subtitle")}
          </p>
        </div>
        <button onClick={() => { setEditingHabit(null); setShowForm(true); }} className="flex shrink-0 items-center gap-2 rounded-xl border border-foreground/20 bg-background/40 px-3.5 py-2 text-sm font-medium text-foreground/60 backdrop-blur-md transition-all hover:border-foreground/40 hover:text-foreground active:scale-95">
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          <span className="hidden sm:inline">{t("habits.newHabit")}</span>
        </button>
      </motion.div>

      {/* Tab pill - Habits / Stats */}
      <div className="inline-flex items-center rounded-full border border-border bg-muted/40 p-1" role="tablist">
        {(["habits", "stats"] as const).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-all active:scale-95",
              tab === key
                ? "bg-background text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground border border-transparent"
            )}
          >
            {t(key === "habits" ? "habits.title" : "habits.tabStats")}
          </button>
        ))}
      </div>

      {tab === "habits" && (
        <>
      {/* Pet companion — feeds off habit logs */}
      <PetMascot />

      {/* Habits Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {habits.map((habit, i) => {
          const stats = getHabitStats(habit.id);
          const logged = storage.isHabitLogged(habit.id, today);
          const category = categories.find((c) => c.id === habit.categoryId);
          const IconComp = habitIconFor(habit.icon);
          const completionRate = stats.daysInMonth > 0 ? Math.round((stats.monthLogs / stats.daysInMonth) * 100) : 0;

          return (
            <HabitCardShell
              key={habit.id}
              habit={habit}
              selected={selectedHabit === habit.id}
              onSelect={() => setSelectedHabit(selectedHabit === habit.id ? null : habit.id)}
              onEdit={() => { setEditingHabit(habit); setShowForm(true); }}
              onDelete={() => {
                // Capture BEFORE deletion so undo restores everything verbatim
                // (habit + its logs + calendar mirrors are all cascaded).
                const snapshot = storage.getData();
                const habitLogs = snapshot.habitLogs.filter((l) => l.habitId === habit.id);
                const calendarEvents = (snapshot.calendarEvents || []).filter((e) => e.notes === "sync:habit:" + habit.id);
                storage.deleteHabit(habit.id);
                refresh();
                showUndo(t("habits.deletedToast") || "Habit deleted", () => {
                  const d = storage.getData();
                  const habit2 = snapshot.habits.find((h) => h.id === habit.id);
                  if (habit2) d.habits.push(habit2);
                  d.habitLogs.push(...habitLogs);
                  d.calendarEvents = [...(d.calendarEvents || []), ...calendarEvents];
                  storage.saveData();
                  refresh();
                });
              }}
              enterDelay={0.05 * i}
              enter={enter}
            >
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const wasLogged = storage.isHabitLogged(habit.id, today);
                    if (wasLogged) {
                      storage.unlogHabit(habit.id, today);
                      setGameToast(t("habits.unloggedToast") || "Logged off for today");
                    } else {
                      storage.logHabit(habit.id, today);
                      setGameToast(`✅ ${habit.name}`);
                    }
                    // First feed of the day: the pet celebrates.
                    const fedNow = storage.getData().habitLogs.filter((l) => l.date === today).length;
                    if (!wasLogged && fedNow === 1) {
                      const petName =
                        (storage.getData().profile?.petName || "").trim() ||
                        petById(storage.getData().profile?.pet)?.name ||
                        "";
                      setGameToast(t("habits.pet.fedToast").replace("{name}", petName));
                    }
                    refresh();
                  }}
                  className={cn(
                    "absolute right-0 top-0 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all active:scale-90",
                    logged
                      ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-500"
                      : "border-foreground/15 text-muted-foreground hover:border-emerald-500/50 hover:text-emerald-500"
                  )}
                  aria-label={logged ? t("habits.done") : t("habits.notDone")}
                >
                  <CheckCircle2 className="h-5 w-5" />
                </button>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: hexToRgba(category?.color || "#a1a1aa", 0.1) }}>
                  <IconComp className="h-[18px] w-[18px]" style={{ color: category?.color || "#a1a1aa" }} />
                </div>
                <h3 className="mt-2.5 break-words pr-9 font-semibold leading-snug">{habit.name}</h3>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Flame className={cn("h-3.5 w-3.5 shrink-0", !logged && flameStage() === "warn" && "text-amber-500", !logged && flameStage() === "danger" && "text-red-500")} />
                  <span>{stats.streak.current} {t("habits.dayStreak")} · {completionRate}%</span>
                  {(freeze.frozenDates[habit.id]?.length ?? 0) > 0 && (
                    <ShieldCheck className="h-3 w-3 shrink-0 text-sky-400" aria-hidden />
                  )}
                </div>
              </div>
            </HabitCardShell>
          );

          return null;
        })}
      </div>

      {/* Game toasts: new record / streak saved / perfect week */}
      <AnimatePresence>
        {gameToast && (
          <motion.div
            initial={enter ? { opacity: 0, y: 20 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 z-[90] -translate-x-1/2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium shadow-xl"
          >
            {gameToast}
          </motion.div>
        )}
      </AnimatePresence>

      {habits.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <Target className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-1">{t("habits.noHabits")}</h3>
          <p className="text-sm text-muted-foreground mb-4">{t("habits.startFirst")}</p>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-xl border border-foreground/20 bg-background/40 px-3.5 py-2 text-sm font-medium text-foreground/60 backdrop-blur-md transition-all hover:border-foreground/40 hover:text-foreground active:scale-95">
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            {t("habits.createHabit")}
          </button>
        </motion.div>
      )}        {/* Selected Habit Detail */}
      <AnimatePresence>
        {selectedHabit && selectedHabitData && selectedStats && (
          <motion.div
            initial={enter ? { opacity: 0, y: 12 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="card relative"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold tracking-tight">{selectedHabitData.name}</h3>
                <div className="flex items-center gap-1 text-sm">
                  <Flame className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{selectedStats.streak.current} {t("habits.dayStreak")}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setEditingHabit(selectedHabitData); setShowForm(true); }} className="btn-ghost p-2">
                  <Edit3 className="h-4 w-4" />
                </button>
                <button onClick={() => { storage.deleteHabit(selectedHabit); setSelectedHabit(null); refresh(); }} className="btn-ghost p-2 text-muted-foreground">
                  <Trash2 className="h-4 w-4" />
                </button>
                <button onClick={() => setSelectedHabit(null)} className="btn-ghost p-2">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="rounded-xl bg-muted p-3 text-center">
                <p className="text-2xl font-bold">{selectedStats.streak.current}</p>
                <p className="text-xs text-muted-foreground">{t("habits.currentStreak")}</p>
              </div>
              <div className="rounded-xl bg-muted p-3 text-center">
                <p className="text-2xl font-bold">{selectedStats.streak.longest}</p>
                <p className="text-xs text-muted-foreground">{t("habits.bestStreak")}</p>
              </div>
              <div className="rounded-xl bg-muted p-3 text-center">
                <p className="text-2xl font-bold">{selectedStats?.dates.length || 0}</p>
                <p className="text-xs text-muted-foreground">{t("habits.total")}</p>
              </div>
            </div>

            {/* Heatmap - real month grid, green, compact */}
            <div>
              <h4 className="text-sm font-medium mb-3">
                {new Date(viewYear, viewMonth).toLocaleString("default", { month: "long", year: "numeric" })}
              </h4>
              <div className="grid grid-cols-7 gap-[3px]">
                {WEEK_HEADER.map((d, i) => (
                  <span key={i} className="text-center text-[8px] text-muted-foreground/40">{d}</span>
                ))}
                {Array.from({ length: monthPad(viewYear, viewMonth) }).map((_, i) => (
                  <div key={`pad-${i}`} />
                ))}
                {getDaysInMonth(viewYear, viewMonth).map((date) => {
                  const dateStr = date.toISOString().split("T")[0];
                  const isLogged = selectedStats.dates.includes(dateStr);
                  const isToday = dateStr === today;
                  return (
                    <div
                      key={dateStr}
                      className={cn(
                        "h-3 w-full rounded-[3px]",
                        isLogged
                          ? "bg-emerald-500"
                          : isToday
                          ? "border border-emerald-500/60"
                          : "bg-muted"
                      )}
                      title={`${formatDate(date)}: ${isLogged ? t("habits.done") : t("habits.notDone")}`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Month navigation */}
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => {
                  if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
                  else setViewMonth(viewMonth - 1);
                }}
                className="btn-ghost text-sm"
              >
                ← {t("habits.previous")}
              </button>
              <button
                onClick={() => {
                  if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
                  else setViewMonth(viewMonth + 1);
                }}
                className="btn-ghost text-sm"
              >
                {t("habits.next")} →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

        </>
      )}

      {/* ===== Stats tab ===== */}
      {tab === "stats" && (
        <div className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: t("habits.active"), value: habits.length, icon: CheckCircle2 },
                { label: t("common.today"), value: data.habitLogs.filter((l) => l.date === today).length, icon: Target },
                { label: t("habits.bestStreak"), value: Math.max(...habits.map((h) => freezeAwareStreak(freeze, h.id, storage.getHabitLogDates(h.id)).longest), 0), icon: Flame },
                { label: t("habits.pet.shields").replace("{n}", String(freeze.freezeTokens)), value: freeze.freezeTokens, icon: ShieldCheck },
              ].map((stat) => (
                <div key={stat.label} className="card">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                    <stat.icon className="h-5 w-5 text-primary-500" />
                  </div>
                  <p className="mt-3 text-2xl font-bold">{stat.value}</p>
                  <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

          <div className="card">
            <h3 className="text-sm font-semibold mb-4">{t("analytics.activeDays")}</h3>
            {(() => {
              const WD = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
              const counts = Array(7).fill(0);
              for (const l of data.habitLogs) counts[new Date(l.date).getDay()]++;
              const max = Math.max(...counts, 1);
              const best = counts.indexOf(max);
              const wdLabels = WD.map((k) => t(`analytics.${k}`));
              return (
                <>
                  <div className="flex items-end justify-between gap-2 h-32">
                    {counts.map((c, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">{c}</span>
                        <div
                          className={cn("w-full rounded-t-md", i === best && c > 0 ? "bg-primary-500" : "bg-muted-foreground/25")}
                          style={{ height: `${Math.max((c / max) * 100, 4)}%` }}
                        />
                        <span className={cn("text-[10px]", i === best && c > 0 ? "text-foreground font-semibold" : "text-muted-foreground")}>{wdLabels[i]}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {counts.reduce((a, b) => a + b, 0)} {t("analytics.logs")}
                  </p>
                </>
              );
            })()}
          </div>

          <div className="card divide-y divide-border">
            <h3 className="text-sm font-semibold py-3.5">{t("habits.title")}</h3>
            {habits.length === 0 && <p className="py-6 text-sm text-muted-foreground">{t("analytics.noHabitData")}</p>}
            {habits.map((h) => {
              const st = freezeAwareStreak(freeze, h.id, storage.getHabitLogDates(h.id));
              const monthLogs = storage.getHabitLogDates(h.id).filter((d) => {
                const dt = new Date(d);
                return dt.getMonth() === viewMonth && dt.getFullYear() === viewYear;
              }).length;
              const dim = getDaysInMonth(viewYear, viewMonth).length;
              const pct = dim > 0 ? Math.round((monthLogs / dim) * 100) : 0;
              return (
                <div key={h.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{h.name}</p>
                    <p className="text-xs text-muted-foreground">{t("analytics.completionRate")} - {pct}%</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Flame className="h-3.5 w-3.5 text-orange-500" />
                    <span className="text-sm font-semibold">{st.current}</span>
                    <span className="text-[10px] text-muted-foreground mr-2">/{st.longest}</span>
                  </div>
                  <div className="w-16 h-1.5 rounded-full bg-muted shrink-0 overflow-hidden" aria-hidden>
                    <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* Habit Form Modal */}
      <AnimatePresence>
        {showForm && (
          <HabitForm
            habit={editingHabit}
            categories={categories}
            onSave={(habitData) => {
              if (editingHabit) {
                storage.updateHabit(editingHabit.id, habitData);
              } else {
                storage.createHabit(habitData as any);
              }
              refresh();
              setShowForm(false);
            }}
            onClose={() => setShowForm(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function HabitForm({
  habit,
  categories,
  onSave,
  onClose,
}: {
  habit: Habit | null;
  categories: { id: string; name: string; color: string }[];
  onSave: (data: any) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(habit?.name || "");
  const [description, setDescription] = useState(habit?.description || "");
  const [categoryId, setCategoryId] = useState(habit?.categoryId || categories[0]?.id || "health");
  const [frequency, setFrequency] = useState<HabitFrequency>(habit?.frequency || "daily");
  const [customDays, setCustomDays] = useState<number[]>(habit?.customDays || []);
  const [timeOfDay, setTimeOfDay] = useState<HabitTimeOfDay>(habit?.timeOfDay || "morning");
  const [icon, setIcon] = useState(habitIconName(habit?.icon));
  const [iconOpen, setIconOpen] = useState(false);

  const toggleDay = (day: number) => {
    setCustomDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold">{habit ? t("habits.editHabit") : t("habits.newHabit")}</h2>
          <button onClick={onClose} className="btn-ghost p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">{t("habits.icon")}</label>
            {/* Collapsed: just the current icon. Tap to reveal the picker. */}
            <button
              type="button"
              onClick={() => setIconOpen((v) => !v)}
              className={cn(
                "flex h-9 items-center gap-2 rounded-lg px-2 transition-all",
                iconOpen ? "bg-primary-500/10 ring-1 ring-primary-500/40" : "bg-muted hover:bg-muted/80"
              )}
              aria-expanded={iconOpen}
            >
              {(() => {
                const Current = HABIT_ICONS.find((i) => i.name === icon)?.Icon || HABIT_ICONS[0].Icon;
                return <Current className="h-4 w-4 text-primary-500" />;
              })()}
              <span className="text-xs text-muted-foreground">{iconOpen ? "−" : "+"}</span>
            </button>
            {iconOpen && (
              <div className="mt-2 grid grid-cols-6 gap-1.5">
                {HABIT_ICONS.map(({ name, label, Icon }) => (
                  <button
                    key={name}
                    type="button"
                    title={label}
                    onClick={() => { setIcon(name); setIconOpen(false); }}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg transition-all",
                      icon === name ? "bg-primary-500/20 ring-2 ring-primary-500 scale-110" : "bg-muted hover:bg-muted/80"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">{t("habits.name")}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("habits.name")}
              className="input-field"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">{t("habits.descOptional")}</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("habits.descOptional")}
              className="input-field"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("habits.category")}</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input-field">
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("habits.frequency")}</label>
              <select value={frequency} onChange={(e) => { setFrequency(e.target.value as HabitFrequency); setCustomDays([]); }} className="input-field">
                <option value="daily">{t("habits.daily")}</option>
                <option value="custom">{t("habits.customDays")}</option>
                <option value="weekly">{t("habits.weekly")}</option>
                <option value="monthly">{t("habits.monthly")}</option>
              </select>
            </div>
          </div>

          {frequency === "custom" && (
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("habits.repeatOn")}</label>
              <div className="flex gap-1.5">
                {DAYS_OF_WEEK.map((day, idx) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg text-xs font-medium transition-all",
                      customDays.includes(idx)
                        ? "border-2 border-primary-500 text-primary-500 ring-2 ring-primary-500/30 scale-110"
                        : "border-2 border-transparent bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium mb-1.5 block">{t("habits.timeOfDay")}</label>
            <div className="grid grid-cols-4 gap-1.5">
              {TIME_OF_DAY_ICONS.map(({ value, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTimeOfDay(value as HabitTimeOfDay)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg py-2 transition-all",
                    timeOfDay === value ? "bg-primary-500/20 ring-2 ring-primary-500" : "bg-muted hover:bg-muted/80"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-[10px]">{t("habits." + value)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">{t("common.cancel")}</button>
            <button
              onClick={() => {
                if (!name.trim()) return;
                onSave({ name, description, categoryId, frequency, customDays: frequency === "custom" ? customDays : [], timeOfDay, icon, targetCount: 1, color: "#6366f1" });
              }}
              disabled={!name.trim()}
              className="btn-primary flex-1"
            >
              {habit ? t("habits.saveChanges") : t("habits.createHabit")}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Wrapper that keeps the habit card's motion/selection behavior identical
 * while adding the Apple-style long-press context menu (log, edit, delete).
 */
function HabitCardShell({
  habit,
  selected,
  onSelect,
  onEdit,
  onDelete,
  enter,
  enterDelay,
  children,
}: {
  habit: Habit;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  enter: boolean;
  enterDelay: number;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const { menu, closeMenu, longPressProps } = useLongPress();
  // NOTE: deliberately NO entrance animation on these cards — every
  // framer/CSS animation on the grid produced visible flicker on mobile.
  return (
    <div
      className={cn(
        "card cursor-pointer",
        selected && "ring-2 ring-primary-500"
      )}
      onClick={onSelect}
      {...longPressProps(habit.id)}
    >
      {children}
      <LongPressMenu menu={menu} onClose={closeMenu}>
        <button
          onClick={() => { closeMenu(); const today = getToday(); if (storage.isHabitLogged(habit.id, today)) storage.unlogHabit(habit.id, today); else storage.logHabit(habit.id, today); onSelect(); }}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> {t("habits.done")}
        </button>
        <button
          onClick={() => { closeMenu(); onEdit(); }}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
        >
          <Edit3 className="h-3.5 w-3.5" /> {t("habits.editHabit")}
        </button>
        <div className="border-t border-border" />
        <button
          onClick={() => { closeMenu(); if (confirm(t("habits.deleteHabitConfirm") || "Delete this habit?")) onDelete(); }}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-destructive transition-colors hover:bg-muted"
        >
          <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
        </button>
      </LongPressMenu>
    </div>
  );
}

