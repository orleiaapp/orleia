"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  ListTodo,
  FileText,
  Upload,
  Trash2,
  Edit3,
  X,
  Send,
  MoreHorizontal,
  CheckCircle2,
  Circle,
  AlertCircle,
  ArrowUp,
  Minus,
  ArrowDown,
  Paperclip,
  Sparkles,
  Loader2,
  Presentation,
  Unlink,
} from "lucide-react";
import { storage } from "@/lib/storage";
import { chat } from "@/lib/ai";
import { NoorCapError } from "@/lib/noor-cap";
import { cn, generateId, getToday } from "@/lib/utils";
import { isBlockedUpload, blockedUploadReason } from "@/lib/upload-guard";
import { useI18n } from "@/lib/i18n";
import { Project, Task, TaskPriority, TaskStatus, AIMessage, Deck, AI_MODELS } from "@/types";
import type { AIModel } from "@/types";
import { SlideThumb } from "@/components/deck/SlideCanvas";
import { DECK_THEMES } from "@/lib/deck-themes";
import { ThinkingOrb } from "thinking-orbs";

type ProjectTab = "tasks" | "files" | "decks" | "noor";

const PRIORITY_ICONS = {
  urgent: AlertCircle,
  high: ArrowUp,
  medium: Minus,
  low: ArrowDown,
};

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  todo: Circle,
  in_progress: Loader2,
  done: CheckCircle2,
  archived: Circle,
};

export default function ProjectWorkspace() {
  const params = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const projectId = params.id as string;

  const [data, setData] = useState(storage.getData());
  const [activeTab, setActiveTab] = useState<ProjectTab>("tasks");
  const [deckLinkOpen, setDeckLinkOpen] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");
  const [editingProject, setEditingProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [noorInput, setNoorInput] = useState("");
  // noorMessages and files come from project persistent storage
  const [noorLoading, setNoorLoading] = useState(false);
  const [noorModel, setNoorModel] = useState<AIModel>("novella-medium");

  const noorEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => setData({ ...storage.getData() });
  useEffect(() => storage.subscribe(() => setData({ ...storage.getData() })), []);

  const project = data.projects.find((p) => p.id === projectId);
  const uploadedFiles = project?.files || [];
  const noorMessages = project?.noorMessages || [];
  const projectTasks = data.tasks.filter((t) => project?.taskIds.includes(t.id));
  const linkedDecks = (data.decks || []).filter((d) => project?.deckIds?.includes(d.id));

  const linkDeckToProject = (deckId: string) => {
    if (!project) return;
    const deckIds = new Set(project.deckIds || []);
    deckIds.add(deckId);
    storage.updateProject(project.id, { deckIds: Array.from(deckIds) });
    refresh();
  };
  const unlinkDeckFromProject = (deckId: string) => {
    if (!project) return;
    const deckIds = (project.deckIds || []).filter((id) => id !== deckId);
    storage.updateProject(project.id, { deckIds });
    refresh();
  };
  const createProjectDeck = () => {
    if (!project) return;
    const d = storage.createDeck({
      title: project.name,
      description: project.description || "Deck for this project",
      slides: [
        { id: generateId(), layout: "title", title: project.name, content: [project.description || ""], notes: "", accent: project.color },
      ],
      theme: "midnight",
      transition: "fade",
    });
    const deckIds = new Set(project.deckIds || []);
    deckIds.add(d.id);
    storage.updateProject(project.id, { deckIds: Array.from(deckIds) } as never);
    refresh();
    router.push("/deck");
  };
  const projectNotes = data.notes.filter((n) => project?.noteIds.includes(n.id));

  useEffect(() => {
    if (!project) {
      router.push("/projects");
    } else {
      setProjectName(project.name);
      setProjectDesc(project.description);
    }
  }, [project, router]);

  useEffect(() => {
    noorEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [noorMessages]);

  if (!project) return null;

  const handleAddTask = () => {
    if (!taskTitle.trim()) return;
    const task = storage.createTask({
      title: taskTitle.trim(),
      description: "",
      status: "todo",
      priority: taskPriority,
      dueDate: null,
      dueTime: null,
      completedAt: null,
      tags: [],
      listId: null,
      projectId: project.id,
      recurring: "none",
      recurringEndDate: null,
      estimatedMinutes: null,
    });
    storage.linkItemToProject(project.id, "taskIds", task.id);
    setTaskTitle("");
    setShowTaskForm(false);
    refresh();
  };

  const handleToggleTask = (taskId: string) => {
    storage.toggleTask(taskId);
    refresh();
  };

  const handleDeleteTask = (taskId: string) => {
    storage.unlinkItemFromProject(project.id, "taskIds", taskId);
    storage.deleteTask(taskId);
    refresh();
  };

  const handleSaveProject = () => {
    storage.updateProject(project.id, {
      name: projectName.trim() || project.name,
      description: projectDesc.trim(),
    });
    setEditingProject(false);
    refresh();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !project) return;
    // ---- Upload hardening ----
    // Files never execute (stored as inert data URLs, shown in the UI only),
    // but a single huge file could exhaust the localStorage quota and break
    // saving for the WHOLE workspace. Cap per-file and per-project totals;
    // block executable/script formats outright.
    const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB per file
    const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB per project
    const BLOCKED_EXT = /\.(exe|msi|bat|cmd|com|scr|ps1|sh|bash|dll|jar|vbs|wsf|hta|cpl|scf|lnk|reg|iso|dmg|deb|rpm|apk|appimage)$/i; // legacy, superseded by upload-guard
    const currentTotal = (project.files || []).reduce((n, f) => n + (f.size || 0), 0);
    const errors: string[] = [];
    let added = 0;
    let runningTotal = currentTotal;

    const finish = () => {
      if (errors.length) alert(`Some files were not added:\n\n${errors.join("\n")}`);
      if (added > 0) refresh();
      e.target.value = ""; // allow re-selecting the same file
    };

    Array.from(files).forEach((file) => {
      if (isBlockedUpload(file)) {
        errors.push(blockedUploadReason(file));
        return;
      }
      if (BLOCKED_EXT.test(file.name)) {
        errors.push(`• ${file.name}: executable files are not allowed`);
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        errors.push(`• ${file.name}: larger than 8 MB (files stay on your device, so uploads are capped to protect your workspace storage)`);
        return;
      }
      if (runningTotal + file.size > MAX_TOTAL_BYTES) {
        errors.push(`• ${file.name}: project file storage would exceed 50 MB. Remove some files first.`);
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => errors.push(`• ${file.name}: could not be read`);
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const newFile = {
          id: generateId(),
          name: file.name,
          size: file.size,
          type: file.type,
          dataUrl,
          uploadedAt: new Date().toISOString(),
        };
        runningTotal += file.size;
        added += 1;
        storage.updateProject(project.id, {
          files: [...(project.files || []), newFile],
        });
        refresh();
      };
      reader.readAsDataURL(file);
    });
    setTimeout(finish, 50);
  };

  const handleNoorSend = async () => {
    if (!noorInput.trim() || noorLoading || !project) return;

    const userMsg: AIMessage = {
      id: generateId(),
      role: "user",
      content: noorInput.trim(),
      timestamp: new Date().toISOString(),
      model: noorModel,
    };
    const updatedMessages = [...noorMessages, userMsg];
    // Autosave user message to project
    storage.updateProject(project.id, { noorMessages: updatedMessages });
    refresh();
    setNoorInput("");
    setNoorLoading(true);

    try {
      const projectContext = [
        `You are currently inside the project "${project.name}".${project.description ? ` Description: ${project.description}` : ""}`,
        `\nPROJECT TASKS (${projectTasks.length} total, ${projectTasks.filter(t => t.status === "done").length} completed):`,
        projectTasks.length > 0 ? projectTasks.map((t) => `  - ${t.title} [${t.status === "done" ? "DONE" : "TODO"}] (${t.priority} priority)`).join("\n") : "  (none)",
        `\nPROJECT NOTES (${projectNotes.length} total):`,
        projectNotes.length > 0 ? projectNotes.map((n) => `  - ${n.title}`).join("\n") : "  (none)",
        `\nUPLOADED FILES (${(project.files || []).length} total):`,
        (project.files || []).length > 0 ? (project.files || []).map((f) => {
          const contentPreview = f.type.startsWith("text/") && f.dataUrl
            ? (() => { try { const raw = atob(f.dataUrl.split(",")[1] || ""); return raw.slice(0, 500); } catch { return "(binary)"; } })()
            : f.type.startsWith("image/") ? "(image file - Noor can see this)" : `(${f.type})`;
          return `  - ${f.name}: ${contentPreview}`;
        }).join("\n") : "  (none)",
        `\nYou are Noor, the AI assistant for this Orleia project. You have full context about the project's tasks, notes, and files. When the user asks you to do something, do it using the ORLEIA_ACTION tool. Always check existing tasks before creating new ones to avoid duplicates. For questions about files or content, just answer naturally - do NOT emit ORLEIA_ACTION. The file contents are provided above for you to read and reference.`,
      ].join("\n");

      let response: string;
      try {
        response = await chat(
          noorInput.trim(),
          noorMessages,
          noorModel,
          { extraSystem: projectContext }
        );
      } catch (e) {
        // Daily Noor cap: show the friendly upgrade message instead of
        // silently failing (the console error confused nobody, ever).
        if (e instanceof NoorCapError) {
          response = "⭐ You've used all of today's Noor messages. The cap resets at midnight — or upgrade in Settings → Billing for a higher daily limit.";
        } else {
          response = "I could not reach my models just now - try again in a moment.";
        }
      }

      const assistantMsg: AIMessage = {
        id: generateId(),
        role: "assistant",
        content: response,
        timestamp: new Date().toISOString(),
        model: noorModel,
      };
      // Autosave assistant message to project
      storage.updateProject(project.id, { noorMessages: [...updatedMessages, assistantMsg] });
      refresh();
    } catch (error) {
      console.error("Noor error:", error);
      // Fallback assistant message so the chat visibly fails, not silently.
      storage.updateProject(project.id, {
        noorMessages: [...updatedMessages, {
          id: generateId(),
          role: "assistant" as const,
          content: "I could not reach my models just now - try again in a moment.",
          timestamp: new Date().toISOString(),
          model: noorModel,
        }],
      });
      refresh();
    } finally {
      setNoorLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/projects")}
            className="p-2 text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div
            className="h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: project.color }}
          />
          <div>
            {editingProject ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="bg-transparent border-b border-border/50 text-2xl font-bold tracking-tight focus:outline-none focus:border-border"
                  autoFocus
                />
                <button onClick={handleSaveProject} className="text-green-500 hover:text-green-400">
                  <CheckCircle2 className="h-5 w-5" />
                </button>
                <button onClick={() => setEditingProject(false)} className="text-muted-foreground/60 hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{project.name}</h1>
            )}
            {project.description && !editingProject && (
              <p className="mt-1 text-sm text-muted-foreground/60 font-body">{project.description}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => setEditingProject(true)}
          className="p-2 text-muted-foreground/60 hover:text-foreground transition-colors"
        >
          <Edit3 className="h-4 w-4" />
        </button>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/50">
        {([
          { id: "tasks" as const, label: "Tasks", icon: ListTodo, count: projectTasks.length },
          { id: "files" as const, label: "Files", icon: FileText, count: uploadedFiles.length },
          { id: "decks" as const, label: "Decks", icon: Presentation, count: linkedDecks.length },
          { id: "noor" as const, label: "Noor", icon: Sparkles, count: noorMessages.length },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground/60 hover:text-muted-foreground"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-medium bg-muted-foreground/10 rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === "tasks" && (
          <motion.div
            key="tasks"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Add Task */}
            {showTaskForm ? (
              <div className="border border-border/50 rounded-xl p-4 space-y-3">
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder={t("projects.task_title")}
                  className="w-full bg-transparent text-sm focus:outline-none"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
                />
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    {(Object.keys(PRIORITY_ICONS) as TaskPriority[]).map((p) => {
                      const Icon = PRIORITY_ICONS[p];
                      return (
                        <button
                          key={p}
                          onClick={() => setTaskPriority(p)}
                          className={cn(
                            "p-1.5 rounded-lg transition-all",
                            taskPriority === p
                              ? "bg-muted-foreground/10 text-foreground"
                              : "text-muted-foreground/40 hover:text-muted-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowTaskForm(false)}
                      className="px-3 py-1.5 text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
                    >{t("calendar.cancel")}</button>
                    <button
                      onClick={handleAddTask}
                      disabled={!taskTitle.trim()}
                      className="px-3 py-1.5 text-xs font-medium border border-foreground/20 bg-transparent text-foreground/70 rounded-lg hover:border-foreground/40 hover:text-foreground disabled:opacity-30"
                    >{t("projects.add")}</button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowTaskForm(true)}
                className="w-full border border-dashed border-border/50 rounded-xl p-4 text-sm text-muted-foreground/60 hover:text-foreground hover:border-border transition-all flex items-center gap-2 justify-center"
              >
                <Plus className="h-4 w-4" />{t("projects.add_task")}</button>
            )}

            {/* Task List */}
            {projectTasks.length === 0 ? (
              <div className="text-center py-12">
                <ListTodo className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground/40">{t("projects.no_tasks_yet")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {projectTasks.map((task) => {
                  const StatusIcon = STATUS_ICONS[task.status] || Circle;
                  return (
                    <motion.div
                      key={task.id}
                      layout
                      className={cn(
                        "flex items-center gap-3 p-3 border border-border/50 rounded-xl transition-all",
                        task.status === "done" && "opacity-50"
                      )}
                    >
                      <button
                        onClick={() => handleToggleTask(task.id)}
                        className="shrink-0"
                      >
                        <StatusIcon
                          className={cn(
                            "h-5 w-5",
                            task.status === "done"
                              ? "text-green-500"
                              : "text-muted-foreground/40 hover:text-muted-foreground"
                          )}
                        />
                      </button>
                      <span
                        className={cn(
                          "flex-1 text-sm",
                          task.status === "done" && "line-through text-muted-foreground/40"
                        )}
                      >
                        {task.title}
                      </span>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1 text-muted-foreground/40 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "files" && (
          <motion.div
            key="files"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Upload Area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border border-dashed border-border/50 rounded-xl p-8 text-center cursor-pointer hover:border-border transition-all"
            >
              <Upload className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/60">{t("projects.click_to_upload_files")}</p>
              <p className="text-xs text-muted-foreground/40 mt-1">{t("projects.documents_images_and_more")}</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            {/* File List */}
            {uploadedFiles.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground/40">{t("projects.no_files_uploaded_yet")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {uploadedFiles.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 border border-border/50 rounded-xl"
                  >
                    <FileText className="h-5 w-5 text-muted-foreground/40 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground/40">{formatFileSize(file.size)}</p>
                    </div>
                    <button
                      onClick={() => {
                        if (!project) return;
                        storage.updateProject(project.id, {
                          files: (project.files || []).filter((_, j) => j !== i),
                        });
                        refresh();
                      }}
                      className="p-1 text-muted-foreground/40 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "decks" && (
          <motion.div
            key="decks"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {/* Actions */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">{t("projects.presentations_linked_to_this_project")}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDeckLinkOpen((v) => !v)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border/50 text-sm hover:bg-muted/30 transition-all"
                >
                  <Plus className="h-4 w-4" />{t("projects.link_existing")}</button>
                <button
                  onClick={createProjectDeck}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-foreground/20 bg-transparent text-sm font-medium text-foreground/70 hover:border-foreground/40 hover:text-foreground transition-all"
                >
                  <Presentation className="h-4 w-4" />{t("deck.new_deck")}</button>
              </div>
            </div>

            {/* Link picker */}
            {deckLinkOpen && (
              <div className="mb-4 border border-border/50 rounded-2xl p-4 bg-muted/20">
                <div className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-3">{t("projects.choose_a_deck_to_link")}</div>
                {(() => {
                  const unlinked = (data.decks || []).filter((d) => !project?.deckIds?.includes(d.id));
                  if (!unlinked.length) {
                    return <p className="text-sm text-muted-foreground/60">{t("projects.all_decks_are_already_linked_or_none_exi")}</p>;
                  }
                  return (
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {unlinked.map((d) => (
                        <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/40 px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{d.title}</div>
                            <div className="text-xs text-muted-foreground">{d.slides.length} slides</div>
                          </div>
                          <button
                            onClick={() => linkDeckToProject(d.id)}
                            className="px-3 py-1.5 rounded-lg border border-foreground/20 bg-transparent text-xs font-medium text-foreground/70 hover:border-foreground/40 hover:text-foreground transition-all shrink-0"
                          >{t("projects.link")}</button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Linked decks grid */}
            {linkedDecks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border/50 rounded-2xl">
                <Presentation className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground/60 mb-4">
                  No decks linked yet. Create one from this project or link an existing deck.
                </p>
                <button
                  onClick={createProjectDeck}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-foreground/20 bg-transparent text-sm font-medium text-foreground/70 hover:border-foreground/40 hover:text-foreground transition-all"
                >
                  <Plus className="h-4 w-4" />{t("projects.new_deck_for_this_project")}</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {linkedDecks.map((d) => {
                  const theme = DECK_THEMES[d.theme] || DECK_THEMES.midnight;
                  return (
                    <div
                      key={d.id}
                      className="group border border-border/50 rounded-2xl overflow-hidden hover:border-border transition-all"
                    >
                      <div className="pointer-events-none">
                        {d.slides[0] ? (
                          <SlideThumb slide={d.slides[0]} deck={d} />
                        ) : (
                          <div className="aspect-video" style={{ background: theme.bg }} />
                        )}
                      </div>
                      <div className="p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{d.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {d.slides.length} slides · {new Date(d.updatedAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => router.push("/deck")}
                            className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-all"
                            title={t("projects.open_in_deck_editor")}
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => unlinkDeckFromProject(d.id)}
                            className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-red-500 hover:bg-muted/50 transition-all"
                            title={t("projects.unlink_from_project")}
                          >
                            <Unlink className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
        {activeTab === "noor" && (
          <motion.div
            key="noor"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col h-[calc(100vh-280px)]"
          >
            {/* Model Selector */}
            <div className="flex items-center gap-2 mb-4">
              {AI_MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => setNoorModel(model.id)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
                    noorModel === model.id
                      ? "border-foreground/20 bg-foreground/5"
                      : "border-border/50 text-muted-foreground/60 hover:border-border"
                  )}
                >
                  {model.name}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
              {noorMessages.length === 0 && (
                <div className="text-center py-12">
                  <Sparkles className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground/40">{t("projects.ask_noor_anything_about_this_project")}</p>
                  <p className="text-xs text-muted-foreground/30 mt-1">{t("projects.noor_has_context_about_your_tasks_notes_")}</p>
                </div>
              )}
              {noorMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] px-4 py-3 rounded-2xl text-sm",
                      msg.role === "user"
                        ? "border border-foreground/25 bg-transparent text-foreground"
                        : "bg-muted/50 text-foreground"
                    )}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {noorLoading && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 rounded-2xl bg-muted/50">
                    <ThinkingOrb state="solving" size={20} theme="dark" />
                  </div>
                </div>
              )}
              <div ref={noorEndRef} />
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 border border-border/50 rounded-xl p-2">
              <input
                type="text"
                value={noorInput}
                onChange={(e) => setNoorInput(e.target.value)}
                placeholder={t("projects.ask_about_this_project")}
                className="flex-1 bg-transparent text-sm px-2 focus:outline-none"
                onKeyDown={(e) => e.key === "Enter" && handleNoorSend()}
              />
              <button
                onClick={handleNoorSend}
                disabled={!noorInput.trim() || noorLoading}
                className="p-2 border border-foreground/20 bg-transparent text-foreground/70 rounded-lg hover:border-foreground/40 hover:text-foreground disabled:opacity-30 transition-all"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
