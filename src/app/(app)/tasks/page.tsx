"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Reorder,
  useDragControls,
  AnimatePresence,
  motion,
  LayoutGroup,
} from "framer-motion";
import {
  Plus,
  ListTodo,
  Calendar as CalendarIcon,
  Columns,
  List,
  Trash2,
  Edit3,
  X,
  Clock,
  Flag,
  Repeat,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  MoreHorizontal,
  AlertCircle,
  ArrowUp,
  Minus,
  ArrowDown,
  CheckCircle2,
  Circle,
  GripVertical,
  Share2,
} from "lucide-react";
import { useLongPress, LongPressMenu } from "@/components/ui/long-press";
import { shareText } from "@/lib/share";
import { showUndo } from "@/lib/undo-toast";
import { storage } from "@/lib/storage";
import { useHydrated, useFirstVisit } from "@/lib/use-hydrated";
import { cn, getToday, formatDate, generateId } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { Task, TaskPriority, TaskStatus, RecurringType, ViewMode, PRIORITY_CONFIG, STATUS_CONFIG, DAYS_OF_WEEK } from "@/types";
import { CalendarSurface } from "@/components/calendar/CalendarSurface";

export default function TasksPage() {
  const { t } = useI18n();
  const VIEW_KEY = "orleia-tasks-view";
  const [data, setData] = useState(storage.getData());
  const hydrated = useHydrated();
  const enter = useFirstVisit("tasks");
  const [showForm, setShowForm] = useState(false);
  // View mode persists across reloads/visits (per device). Kanban & calendar
  // are desktop layouts, so on narrow screens list wins on init.
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "list") return "list";
      if ((v === "kanban" || v === "calendar") && typeof window !== "undefined" && window.innerWidth >= 768) return v;
    } catch { /* ignore */ }
    return "list";
  });
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "all">("all");
  const [justCompleted, setJustCompleted] = useState<string | null>(null);

  const refresh = () => setData({ ...storage.getData() });
  useEffect(() => storage.subscribe(() => setData({ ...storage.getData() })), []);

  const changeView = (mode: ViewMode) => {
    setViewMode(mode);
    try { localStorage.setItem(VIEW_KEY, mode); } catch { /* ignore */ }
  };

  // Shortcut / deep-link: open the New Task form (Ctrl+Shift+T or ?new=1).
  const router = useRouter();
  useEffect(() => {
    const openNew = () => { setEditingTask(null); setShowForm(true); };
    window.addEventListener("orleia:new-task", openNew);
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      openNew();
      router.replace("/tasks", { scroll: false });
    }
    return () => window.removeEventListener("orleia:new-task", openNew);
  }, [router]);

  const tasks = data.tasks
    .filter((t) => t.status !== "archived")
    .filter((t) => filterStatus === "all" || t.status === filterStatus)
    .filter((t) => filterPriority === "all" || t.priority === filterPriority)
    .sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      if (a.priority !== b.priority) return priorityOrder[a.priority] - priorityOrder[b.priority];
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return a.order - b.order;
    });

  const today = getToday();
  const overdueTasks = tasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== "done");
  const todayTasks = tasks.filter((t) => t.dueDate === today);
  const upcomingTasks = tasks.filter((t) => t.dueDate && t.dueDate > today);

  const kanbanColumns: TaskStatus[] = ["todo", "in_progress", "done"];

  // Manual order only applies to undated tasks (the "Other" group).
  const otherTasks = tasks
    .filter((t) => !t.dueDate && t.status !== "done")
    .sort((a, b) => a.order - b.order);

  // Optimistic local order while dragging: persist only on drag END.
  // Persisting every onReorder tick replaced the array with fresh objects,
  // which broke framer-motion's drag tracking (snapping / dropped drags).
  const [dragOrder, setDragOrder] = useState<Task[] | null>(null);
  const dragCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayedOtherTasks = dragOrder ?? otherTasks;
  const handleReorder = (next: Task[]) => {
    setDragOrder(next);
    if (dragCommitTimer.current) clearTimeout(dragCommitTimer.current);
    dragCommitTimer.current = setTimeout(() => {
      storage.reorderTasks(next.map((t) => t.id));
      setDragOrder(null);
      refresh();
    }, 500); // commits shortly after the last reorder event of a drag
  };
  useEffect(() => () => { if (dragCommitTimer.current) clearTimeout(dragCommitTimer.current); }, []);

  const moveTask = (id: string, dir: -1 | 1) => {
    const idx = otherTasks.findIndex((t) => t.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= otherTasks.length) return;
    const a = otherTasks[idx];
    const b = otherTasks[swap];
    storage.updateTask(a.id, { order: b.order });
    storage.updateTask(b.id, { order: a.order });
    refresh();
  };

  const getPriorityIcon = (p: TaskPriority) => {
    switch (p) {
      case "urgent": return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
      case "high": return <ArrowUp className="h-4 w-4 text-muted-foreground" />;
      case "medium": return <Minus className="h-4 w-4 text-muted-foreground" />;
      case "low": return <ArrowDown className="h-4 w-4 text-muted-foreground" />;
    }
  };

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
        className="flex flex-wrap items-start justify-between gap-3 relative"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-none">Tasks</h1>
          <p className="text-sm text-muted-foreground leading-relaxed mt-2 max-w-xs">
            {overdueTasks.length > 0
              ? `${overdueTasks.length} ${t("tasks.overdue")}`
              : `${tasks.filter((t) => t.status !== "done").length} ${t("tasks.pending")}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* View toggle — on every width now: the calendar view IS the
              calendar (merged into Tasks), so mobile needs a way in. */}
          <div className="inline-flex items-center rounded-full border border-border bg-muted/40 p-1" role="tablist">
            {[
              { mode: "list" as ViewMode, icon: List },
              { mode: "kanban" as ViewMode, icon: Columns },
              { mode: "calendar" as ViewMode, icon: CalendarIcon },
            ].map(({ mode, icon: Icon }) => (
              <button
                key={mode}
                onClick={() => changeView(mode)}
                aria-selected={viewMode === mode}
                className={cn(
                  "rounded-full p-2 transition-all active:scale-95",
                  viewMode === mode
                    ? "bg-background text-foreground shadow-sm border border-border"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
          <button onClick={() => { setEditingTask(null); setShowForm(true); }} className="flex shrink-0 items-center gap-2 rounded-xl border border-foreground/20 bg-transparent px-3.5 py-2 text-sm font-medium text-foreground/60 transition-all hover:border-foreground/40 hover:text-foreground active:scale-95">
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            <span className="hidden sm:inline">{t("tasks.addTask")}</span>
          </button>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={enter ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.35, ease: "easeOut" }}
        className="relative"
      >
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex items-center rounded-full border border-border bg-muted/40 p-1" role="tablist">
            {["all", "todo", "in_progress", "done"].map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={filterStatus === s}
                onClick={() => setFilterStatus(s as any)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-all active:scale-95",
                  filterStatus === s
                    ? "bg-background text-foreground shadow-sm border border-border"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                )}
              >
                {s === "all" ? t("tasks.all") : t(s === "todo" ? "tasks.toDo" : s === "in_progress" ? "tasks.inProgress" : "tasks.done")}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center rounded-full border border-border bg-muted/40 p-1" role="tablist">
            {(["all", "urgent", "high", "medium", "low"] as const).map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={filterPriority === p}
                onClick={() => setFilterPriority(p)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-all active:scale-95",
                  filterPriority === p
                    ? "bg-background text-foreground shadow-sm border border-border"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                )}
              >
                {p === "all" ? t("tasks.all") : t("tasks." + p)}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* List View */}
      {viewMode === "list" && (
        <div className="space-y-4">
          {/* Overdue */}
          {overdueTasks.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {t("tasks.overdue")} ({overdueTasks.length})
              </h3>
              <div className="space-y-2">
                {overdueTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onRefresh={refresh} onEdit={() => { setEditingTask(task); setShowForm(true); }} />
                ))}
              </div>
            </div>
          )}

          {/* Today */}
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-primary-500" />
              {t("tasks.today")}
            </h3>
            {todayTasks.length > 0 ? (
              <div className="space-y-2">
                {todayTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onRefresh={refresh} onEdit={() => { setEditingTask(task); setShowForm(true); }} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-3 px-4">{t("tasks.noTasksDueToday")}</p>
            )}
          </div>

          {/* Upcoming */}
          {upcomingTasks.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {t("tasks.upcoming")}
              </h3>
              <div className="space-y-2">
                {upcomingTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onRefresh={refresh} onEdit={() => { setEditingTask(task); setShowForm(true); }} />
                ))}
              </div>
            </div>
          )}

          {/* Remaining (no due date) - manually ordered, drag to reorder */}
          {otherTasks.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-muted-foreground" />
                {t("tasks.other")}
              </h3>
              <Reorder.Group
                axis="y"
                values={displayedOtherTasks}
                onReorder={handleReorder}
                className="space-y-2"
                as="ul"
              >
                {displayedOtherTasks.map((task) => (
                  <SortableTaskCard
                    key={task.id}
                    task={task}
                    onRefresh={refresh}
                    onEdit={() => { setEditingTask(task); setShowForm(true); }}
                    onMoveUp={() => moveTask(task.id, -1)}
                    onMoveDown={() => moveTask(task.id, 1)}
                  />
                ))}
              </Reorder.Group>
            </div>
          )}

          {/* Done */}
          {tasks.filter((t) => t.status === "done").length > 0 && (
            <div>
              <details className="group">
                <summary className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer py-2">
                  <ChevronRight className="h-4 w-4 group-open:rotate-90 transition-transform" />
                  {t("tasks.completed")} ({tasks.filter((t) => t.status === "done").length})
                </summary>
                <div className="space-y-2 mt-2">
                  {tasks.filter((t) => t.status === "done").map((task) => (
                    <TaskCard key={task.id} task={task} onRefresh={refresh} onEdit={() => { setEditingTask(task); setShowForm(true); }} />
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>
      )}

      {/* Kanban View */}
      {viewMode === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {kanbanColumns.map((status) => {
            const columnTasks = tasks.filter((t) => t.status === status);
            return (
              <div key={status} className="rounded-2xl bg-muted/50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: STATUS_CONFIG[status].color }} />
                    <h3 className="font-medium text-sm">{t(status === "todo" ? "tasks.toDo" : status === "in_progress" ? "tasks.inProgress" : "tasks.done")}</h3>
                  </div>
                  <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                    {columnTasks.length}
                  </span>
                </div>
                <div className="space-y-2 min-h-[200px]">
                  {columnTasks.map((task) => (
                    <div
                      key={task.id}
                      className="card p-3 cursor-pointer hover:shadow-md transition-all"
                      onClick={() => {
                        storage.updateTask(task.id, {
                          status: status === "todo" ? "in_progress" as TaskStatus : status === "in_progress" ? "done" as TaskStatus : "todo" as TaskStatus,
                        });
                        refresh();
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {getPriorityIcon(task.priority)}
                            <p className={cn("text-sm font-medium", task.status === "done" && "line-through text-muted-foreground")}>
                              {task.title}
                            </p>
                          </div>
                          {task.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
                          )}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); storage.deleteTask(task.id); refresh(); }}
                          className="touch-reveal text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {task.dueDate && (
                        <p className={cn("text-xs mt-2",                          task.dueDate < getToday() && task.status !== "done" ? "text-muted-foreground" : "text-muted-foreground")}>
                          {formatDate(task.dueDate)}
                        </p>
                      )}
                    </div>
                  ))}
                  {columnTasks.length === 0 && (
                    <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
                      {t("tasks.dropHere")}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Calendar — merged into Tasks: the full month/week/day surface
          (events, due-dated tasks, Noor weekly plan), bounded to the view. */}
      {viewMode === "calendar" && (
        <div className="h-[calc(100dvh-14rem)] min-h-[480px]">
          <CalendarSurface embedded />
        </div>
      )}        {/* Empty State */}
      {tasks.length === 0 && viewMode === "list" && (
        <motion.div
          initial={enter ? { opacity: 0, y: 12 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="relative flex flex-col items-center justify-center py-20 text-center"
        >
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-muted">
            <ListTodo className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-bold tracking-tight mb-1">{t("tasks.noTasksYet")}</h3>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed max-w-xs">{t("tasks.createFirst")}</p>
          <button onClick={() => { setEditingTask(null); setShowForm(true); }} className="flex items-center gap-2 rounded-xl border border-foreground/20 bg-transparent px-3.5 py-2 text-sm font-medium text-foreground/60 transition-all hover:border-foreground/40 hover:text-foreground active:scale-95">
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            {t("tasks.addTask")}
          </button>
        </motion.div>
      )}

      {/* Task Form Modal */}
      <AnimatePresence>
        {showForm && (
          <TaskForm
            task={editingTask}
            taskLists={data.taskLists}
            onSave={(taskData) => {
              if (editingTask) {
                storage.updateTask(editingTask.id, taskData);
              } else {
                storage.createTask(taskData as any);
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

// Shared card interior so the plain and drag-sortable variants stay identical.
function TaskCardBody({ task, onRefresh, onEdit }: { task: Task; onRefresh: () => void; onEdit?: () => void }) {
  const { t } = useI18n();
  const today = getToday();

  return (
    <>
      <button
        onClick={() => { storage.toggleTask(task.id); onRefresh(); }}
        className="shrink-0"
        aria-label={task.status === "done" ? t("tasks.markUndone") : t("tasks.markDone")}
      >
        <motion.div
          key={task.completedAt || "open"}
          initial={task.status === "done" ? { scale: 0.4 } : false}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 18 }}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors",
            task.status === "done"
              ? "border-zinc-500 bg-zinc-500"
              : "border-muted-foreground/30 hover:border-primary-500"
          )}
        >
          {task.status === "done" && <CheckCircle2 className="h-4 w-4 text-white" />}
        </motion.div>
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn("text-sm font-medium", task.status === "done" && "line-through text-muted-foreground")}>
            {task.title}
          </p>
          {task.priority === "urgent" && (
            <span className="tag bg-muted text-muted-foreground text-[10px]">{t("tasks.urgent")}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
          {task.dueDate && (
            <span className={cn(
              "text-xs flex items-center gap-1 min-w-0",
              task.dueDate < today && task.status !== "done" ? "text-muted-foreground" : "text-muted-foreground"
            )}>
              <Clock className="h-3 w-3 shrink-0" />
              <span className="truncate">{formatDate(task.dueDate)}</span>
            </span>
          )}
          {task.recurring !== "none" && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Repeat className="h-3 w-3" />
              {task.recurring === "weekly" && task.recurringDays?.length
                ? `${t("tasks.weeklyOn")} ${task.recurringDays.map((d) => DAYS_OF_WEEK[d]).join(", ")}`
                : task.recurring === "daily" ? t("tasks.daily") : task.recurring === "weekly" ? t("tasks.weeklyPick") : t("tasks.monthly")}
            </span>
          )}
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {t("tasks." + task.priority)}
          </span>
        </div>
      </div>

      <div className="touch-reveal flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="btn-ghost p-1 text-muted-foreground hover:text-foreground"
            title={t("tasks.editTask")}
            aria-label={t("tasks.editTask")}
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); storage.deleteTask(task.id); onRefresh(); }}
          className="btn-ghost p-1 text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </>
  );
}

function TaskCard({ task, onRefresh, onEdit }: { task: Task; onRefresh: () => void; onEdit?: () => void }) {
  const { t } = useI18n();
  const { menu, closeMenu, longPressProps } = useLongPress();
  return (
    <motion.div
      layout
      initial={false}  // cards appear instantly; layout animations unaffected
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className={cn(
        "card p-3 flex items-center gap-3 group transition-all",
        task.status === "done" && "opacity-60"
      )}
      {...longPressProps(task.id)}
    >
      <TaskCardBody task={task} onRefresh={onRefresh} onEdit={onEdit} />
      <LongPressMenu menu={menu} onClose={closeMenu}>
        <button
          onClick={() => { closeMenu(); storage.toggleTask(task.id); onRefresh(); }}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> {task.status === "done" ? t("tasks.markUndone") : t("tasks.markDone")}
        </button>
        {onEdit && (
          <button
            onClick={() => { closeMenu(); onEdit(); }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <Edit3 className="h-3.5 w-3.5" /> {t("tasks.editTask")}
          </button>
        )}
        <button
          onClick={async () => { closeMenu(); await shareText(task.title, task.title + (task.description ? "\n\n" + task.description : "")); }}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
        >
          <Share2 className="h-3.5 w-3.5"> </Share2> {t("common.share")}
        </button>
        <div className="border-t border-border" />
        <button
          onClick={() => {
            closeMenu();
            const snapshot = storage.getData();
            const taskSnapshot = snapshot.tasks.find((x) => x.id === task.id);
            storage.deleteTask(task.id);
            onRefresh();
            showUndo(t("tasks.deletedToast") || "Task deleted", () => {
              const d = storage.getData();
              if (taskSnapshot) d.tasks.push(taskSnapshot);
              storage.saveData();
              onRefresh();
            });
          }}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-destructive transition-colors hover:bg-muted"
        >
          <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
        </button>
      </LongPressMenu>
    </motion.div>
  );
}

/** Draggable variant used in the manually-ordered "Other" group. */
function SortableTaskCard({ task, onRefresh, onEdit, onMoveUp, onMoveDown }: {
  task: Task;
  onRefresh: () => void;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { t } = useI18n();
  const controls = useDragControls();
  const atTop = task.order <= 0;

  return (
    <Reorder.Item
      value={task}
      dragListener={false}
      dragControls={controls}
      whileDrag={{
        scale: 1.02,
        boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
        zIndex: 30,
      }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className={cn(
        "card p-3 flex items-center gap-2 group list-none",
        task.status === "done" && "opacity-60"
      )}
    >
      <button
        onPointerDown={(e) => controls.start(e)}
        className="shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground/40 hover:text-foreground active:cursor-grabbing"
        aria-label={t("tasks.dragToReorder")}
        title={t("tasks.dragToReorder")}
        style={{ touchAction: "none" }}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <TaskCardBody task={task} onRefresh={onRefresh} onEdit={onEdit} />

      <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
        <motion.button
          whileTap={{ scale: 0.8, y: -1 }}
          onClick={() => onMoveUp()}
          disabled={atTop}
          className="btn-ghost p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25"
          title={t("tasks.moveUp")}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.8, y: 1 }}
          onClick={() => onMoveDown()}
          className="btn-ghost p-0.5 text-muted-foreground hover:text-foreground"
          title={t("tasks.moveDown")}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </motion.button>
      </div>
    </Reorder.Item>
  );
}

function TaskForm({
  task,
  taskLists,
  onSave,
  onClose,
}: {
  task: Task | null;
  taskLists: { id: string; name: string }[];
  onSave: (data: any) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority || "medium");
  const [dueDate, setDueDate] = useState(task?.dueDate || "");
  const [dueTime, setDueTime] = useState(task?.dueTime || "");
  const [status, setStatus] = useState<TaskStatus>(task?.status || "todo");
  const [recurring, setRecurring] = useState<RecurringType>(task?.recurring || "none");
  const [recurringDays, setRecurringDays] = useState<number[]>(task?.recurringDays || []);
  const [listId, setListId] = useState(task?.listId || "");

  const toggleDay = (day: number) => {
    setRecurringDays((prev) =>
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
          <h2 className="text-lg font-bold">{task ? t("tasks.editTask") : t("tasks.newTask")}</h2>
          <button onClick={onClose} className="btn-ghost p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">{t("tasks.titleField")}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("tasks.titleField")}
              className="input-field"
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">{t("tasks.descOptional")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("tasks.descOptional")}
              className="input-field min-h-[80px] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("tasks.priority")}</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className="input-field">
                <option value="urgent">🔴 {t("tasks.urgent")}</option>
                <option value="high">🟠 {t("tasks.high")}</option>
                <option value="medium">🔵 {t("tasks.medium")}</option>
                <option value="low">⚪ {t("tasks.low")}</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("tasks.status")}</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className="input-field">
                <option value="todo">📋 {t("tasks.toDo")}</option>
                <option value="in_progress">🔄 {t("tasks.inProgress")}</option>
                <option value="done">✅ {t("tasks.done")}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block sm:text-sm sm:mb-1.5">{t("tasks.dueDate")}</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="input-field-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block sm:text-sm sm:mb-1.5">{t("tasks.dueTime")}</label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="input-field-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("tasks.recurring")}</label>
              <select value={recurring} onChange={(e) => { setRecurring(e.target.value as RecurringType); setRecurringDays([]); }} className="input-field">
                <option value="none">{t("tasks.never")}</option>
                <option value="daily">{t("tasks.daily")}</option>
                <option value="weekly">{t("tasks.weeklyPick")}</option>
                <option value="monthly">{t("tasks.monthly")}</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("tasks.list")}</label>
              <select value={listId} onChange={(e) => setListId(e.target.value)} className="input-field">
                <option value="">{t("common.none")}</option>
                {taskLists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>

          {recurring === "weekly" && (
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("tasks.repeatOn")}</label>
              <div className="flex gap-1.5">
                {DAYS_OF_WEEK.map((day, idx) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg text-xs font-medium transition-all",
                      recurringDays.includes(idx)
                        ? "bg-primary-500 text-white ring-2 ring-primary-500/30 scale-110"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-foreground/20 bg-transparent px-3.5 py-2 text-sm font-medium text-foreground/60 transition-all hover:border-foreground/40 hover:text-foreground active:scale-95"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={() => {
                if (!title.trim()) return;
                onSave({
                  title,
                  description,
                  priority,
                  status,
                  dueDate: dueDate || null,
                  dueTime: dueTime || null,
                  recurring,
                  recurringDays: recurring === "weekly" ? recurringDays : [],
                  listId: listId || null,
                  tags: [],
                  recurringEndDate: null,
                  estimatedMinutes: null,
                  completedAt: status === "done" ? new Date().toISOString() : null,
                });
              }}
              disabled={!title.trim()}
              className="flex-1 rounded-xl border border-foreground/20 bg-transparent px-3.5 py-2 text-sm font-medium text-foreground/60 transition-all hover:border-foreground/40 hover:text-foreground active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
            >
              {task ? t("tasks.saveChanges") : t("tasks.addTask")}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
