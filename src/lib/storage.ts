"use client";

import { AppData, Note, Task, Habit, UserProfile, NoorRelationship, OrleiaMode, WidgetId, Spreadsheet, AIModel as AIModelType, HabitLog, JournalEntry, AIConversation, AISuggestion, AIMessage, Project, Deck, CalendarEvent, Form, Board } from "@/types";
import { generateId, getToday, calculateStreak } from "./utils";
import { loadFromIDB, saveToIDB, clearIDB } from "./db";

const STORAGE_KEY = "orleia-data";
const SYNC_KEY = "orleia-sync";

const DEFAULT_DATA: AppData = {
  theme: { theme: "system", primaryColor: "#6366f1", accentColor: "slate", fontSize: "md", reducedMotion: false, dyslexiaFriendly: false, highContrast: false, underlineLinks: false, language: "en", languageExplicit: false, voiceId: null, remindersEnabled: true, remindEvents: true, remindHabits: true, remindTasks: true, remindMentions: true, remindWellness: false, desktopNotifications: true, wellnessTime: "15:00" },
  calendarEvents: [],
  forms: [],
  boards: [],
  habits: [],
  habitCategories: [
    { id: "health", name: "Health", color: "#22c55e", icon: "heart", createdAt: new Date().toISOString() },
    { id: "productivity", name: "Productivity", color: "#3b82f6", icon: "zap", createdAt: new Date().toISOString() },
    { id: "learning", name: "Learning", color: "#a855f7", icon: "book", createdAt: new Date().toISOString() },
    { id: "mindfulness", name: "Mindfulness", color: "#f59e0b", icon: "sparkles", createdAt: new Date().toISOString() },
    { id: "fitness", name: "Fitness", color: "#ef4444", icon: "running", createdAt: new Date().toISOString() },
  ],
  habitLogs: [],
  notes: [],
  noteTags: [
    { id: "important", name: "Important", color: "#ef4444" },
    { id: "personal", name: "Personal", color: "#22c55e" },
    { id: "work", name: "Work", color: "#3b82f6" },
    { id: "ideas", name: "Ideas", color: "#a855f7" },
  ],
  noteFolders: [
    { id: "general", name: "General", parentId: null, createdAt: new Date().toISOString() },
    { id: "projects", name: "Projects", parentId: null, createdAt: new Date().toISOString() },
  ],
  journalEntries: [],
  tasks: [],
  taskLists: [
    { id: "inbox", name: "Inbox", color: "#64748b", icon: "inbox", createdAt: new Date().toISOString() },
    { id: "today", name: "Today", color: "#3b82f6", icon: "sun", createdAt: new Date().toISOString() },
    { id: "this-week", name: "This Week", color: "#22c55e", icon: "calendar", createdAt: new Date().toISOString() },
  ],
  projects: [],
  decks: [],
  aiConversations: [],
  aiSuggestions: [],
  selectedModel: "core-1" as const,

  profile: {},
  noorRelationship: "assistant" as const,
  orleiaMode: "workspace" as const,
  onboardingCompleted: false,
  lastSync: null,
  links: [],
  reminderDismissed: {},
  dashboardWidgets: ["productivity", "stats", "pet"],
  spreadsheets: [],
};

class Storage {
  private data: AppData | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private listeners = new Set<() => void>();

  /**
   * Initialize storage — loads from IndexedDB, falls back to localStorage, then defaults.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        if (typeof window === "undefined") {
          this.data = { ...DEFAULT_DATA };
          this.initialized = true;
          return;
        }

        // Load from both sources — merge with localStorage winning on conflicts
        // (localStorage is updated more frequently by success pages, OAuth flows, etc.)
        const idbData = await loadFromIDB();
        const raw = localStorage.getItem(STORAGE_KEY);
        const lsData = raw ? JSON.parse(raw) : null;

        if (idbData || lsData) {
          // localStorage wins on most keys, but IDB is the source of truth for
          // file data (localStorage strips dataUrls to stay under quota).
          const merged = { ...DEFAULT_DATA, ...idbData, ...lsData };
          if (idbData?.projects && lsData?.projects) {
            const idbProjects = new Map(idbData.projects.map((p: any) => [p.id, p]));
            merged.projects = (lsData.projects || []).map((lsProj: any) => {
              const idbProj = idbProjects.get(lsProj.id);
              if (idbProj?.files?.length) {
                // IDB has file data — use it instead of localStorage's stripped version
                return { ...lsProj, files: idbProj.files, noorMessages: idbProj.noorMessages || lsProj.noorMessages || [] };
              }
              return lsProj;
            });
          }
          this.data = merged;
          // Sync merged result to both stores
          try {
            const lightweight = { ...merged };
            lightweight.projects = lightweight.projects.map((p: any) => ({
              ...p,
              files: (p.files || []).map((f: any) => ({ ...f, dataUrl: "" })),
            }));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweight));
          } catch {}
          await saveToIDB(this.data!);
          this.initialized = true;
          return;
        }

        // Fresh start — save defaults
        this.data = { ...DEFAULT_DATA };
        await saveToIDB(this.data);
        this.initialized = true;
      } catch (e) {
        console.warn("Storage init failed, using defaults", e);
        this.data = { ...DEFAULT_DATA };
        this.initialized = true;
      }
    })();

    return this.initPromise;
  }

  getData(): AppData {
    // Synchronous getter for components that can't await
    if (this.data) return this.data;
    if (typeof window === "undefined") return { ...DEFAULT_DATA };

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.data = { ...DEFAULT_DATA, ...JSON.parse(raw) };
        return this.data!;
      }
    } catch (e) {
      console.warn("Failed to load data from localStorage, using defaults", e);
    }

    this.data = { ...DEFAULT_DATA };
    return this.data!;
  }

  saveData(): void {
    if (typeof window === "undefined") return;
    const dataToSave = this.data;

    // Save to IndexedDB first (async, large capacity — handles file data URLs)
    if (dataToSave) {
      saveToIDB(dataToSave).catch((e) => console.error("IDB save failed", e));
    }

    // Save to localStorage (sync, fast, but 5MB quota — strip large file data URLs)
    try {
      if (dataToSave) {
        // Create a lightweight copy for localStorage — strip dataUrl from files
        // to avoid QuotaExceededError. IDB is the source of truth for file content.
        const lightweight = { ...dataToSave };
        lightweight.projects = lightweight.projects.map((p) => ({
          ...p,
          files: (p.files || []).map((f: any) => ({ ...f, dataUrl: "" })),
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweight));
        localStorage.setItem(SYNC_KEY, new Date().toISOString());
      }
    } catch (e) {
      // localStorage full — not critical, IDB has the real data
      console.warn("localStorage save failed (likely quota), IDB is primary", e);
    }

    // Notify subscribers (relay sync, React re-renders, etc.)
    this.notify();
  }

  // ============================================================
  // Theme
  // ============================================================

  // ============================================================
  // Orleia Office: Calendar / Forms / Board
  // ============================================================

  getCalendarEvents(): CalendarEvent[] {
    return this.getData().calendarEvents || [];
  }

  addCalendarEvent(ev: Omit<CalendarEvent, "id" | "createdAt">): CalendarEvent {
    const data = this.getData();
    const newEv: CalendarEvent = { ...ev, id: generateId(), createdAt: new Date().toISOString() };
    data.calendarEvents = [...(data.calendarEvents || []), newEv];
    this.saveData();
    return newEv;
  }

  updateCalendarEvent(id: string, updates: Partial<CalendarEvent>): void {
    const data = this.getData();
    data.calendarEvents = (data.calendarEvents || []).map((e) => (e.id === id ? { ...e, ...updates } : e));
    this.saveData();
  }

  deleteCalendarEvent(id: string): void {
    const data = this.getData();
    data.calendarEvents = (data.calendarEvents || []).filter((e) => e.id !== id);
    this.saveData();
  }

  getForms(): Form[] {
    return this.getData().forms || [];
  }

  addForm(form: Omit<Form, "id" | "createdAt" | "updatedAt" | "responses">): Form {
    const data = this.getData();
    const now = new Date().toISOString();
    const newForm: Form = { ...form, id: generateId(), responses: [], createdAt: now, updatedAt: now };
    data.forms = [...(data.forms || []), newForm];
    this.saveData();
    return newForm;
  }

  updateForm(id: string, updates: Partial<Form>): void {
    const data = this.getData();
    data.forms = (data.forms || []).map((f) => (f.id === id ? { ...f, ...updates, updatedAt: new Date().toISOString() } : f));
    this.saveData();
  }

  deleteForm(id: string): void {
    const data = this.getData();
    data.forms = (data.forms || []).filter((f) => f.id !== id);
    this.saveData();
  }

  addFormResponse(formId: string, answers: Record<string, string | string[] | number>): void {
    const data = this.getData();
    data.forms = (data.forms || []).map((f) =>
      f.id === formId
        ? { ...f, responses: [...f.responses, { id: generateId(), answers, submittedAt: new Date().toISOString() }], updatedAt: new Date().toISOString() }
        : f
    );
    this.saveData();
  }

  getBoards(): Board[] {
    return this.getData().boards || [];
  }

  addBoard(board: Omit<Board, "id" | "createdAt" | "updatedAt">): Board {
    const data = this.getData();
    const now = new Date().toISOString();
    const newBoard: Board = { ...board, id: generateId(), createdAt: now, updatedAt: now };
    data.boards = [...(data.boards || []), newBoard];
    this.saveData();
    return newBoard;
  }

  updateBoard(id: string, updates: Partial<Board>): void {
    const data = this.getData();
    data.boards = (data.boards || []).map((b) => (b.id === id ? { ...b, ...updates, updatedAt: new Date().toISOString() } : b));
    this.saveData();
  }

  deleteBoard(id: string): void {
    const data = this.getData();
    data.boards = (data.boards || []).filter((b) => b.id !== id);
    this.saveData();
  }

  updateTheme(config: Partial<AppData["theme"]>): AppData["theme"] {
    const data = this.getData();
    data.theme = { ...data.theme, ...config };
    this.saveData();
    return data.theme;
  }

  // ============================================================
  // Habits
  // ============================================================

  getHabits(): Habit[] {
    return this.getData().habits.filter((h) => !h.archived);
  }

  getHabit(id: string): Habit | undefined {
    return this.getData().habits.find((h) => h.id === id);
  }

  createHabit(habit: Omit<Habit, "id" | "createdAt" | "archived">): Habit {
    const data = this.getData();
    const newHabit: Habit = {
      ...habit,
      id: generateId(),
      createdAt: new Date().toISOString(),
      archived: false,
    };
    data.habits.push(newHabit);
    this.saveData();
    return newHabit;
  }

  updateHabit(id: string, updates: Partial<Habit>): Habit | undefined {
    const data = this.getData();
    const idx = data.habits.findIndex((h) => h.id === id);
    if (idx === -1) return undefined;
    data.habits[idx] = { ...data.habits[idx], ...updates };
    this.saveData();
    return data.habits[idx];
  }

  deleteHabit(id: string): void {
    const data = this.getData();
    data.habits = data.habits.filter((h) => h.id !== id);
    data.habitLogs = data.habitLogs.filter((l) => l.habitId !== id);
    // Cascade: remove this habit's mirror events from the calendar,
    // so deleting a habit never leaves ghost chips behind.
    const link = `sync:habit:` + id;
    data.calendarEvents = (data.calendarEvents || []).filter((e) => e.notes !== link);
    this.saveData();
  }

  logHabit(habitId: string, date: string = getToday()): HabitLog {
    const data = this.getData();
    const existing = data.habitLogs.find(
      (l) => l.habitId === habitId && l.date === date
    );
    if (existing) {
      existing.count += 1;
      this.saveData();
      return existing;
    }
    const log: HabitLog = {
      id: generateId(),
      habitId,
      date,
      count: 1,
      createdAt: new Date().toISOString(),
    };
    data.habitLogs.push(log);
    this.saveData();
    return log;
  }

  unlogHabit(habitId: string, date: string = getToday()): void {
    const data = this.getData();
    // HARD-REMOVE the day's log. The UI is a toggle — an untick must
    // unambiguously end that day's check-in, otherwise multi-count logs
    // (legacy data had count > 1) survived the old decrement and the
    // streak wrongly lived on after unticking.
    data.habitLogs = data.habitLogs.filter(
      (l) => !(l.habitId === habitId && l.date === date)
    );
    this.saveData();
  }

  isHabitLogged(habitId: string, date: string = getToday()): boolean {
    return this.getData().habitLogs.some(
      (l) => l.habitId === habitId && l.date === date
    );
  }

  getHabitLogs(habitId: string): HabitLog[] {
    return this.getData().habitLogs.filter((l) => l.habitId === habitId);
  }

  getHabitLogDates(habitId: string): string[] {
    return this.getHabitLogs(habitId).map((l) => l.date);
  }

  // ============================================================
  // Notes
  // ============================================================

  getNotes(): Note[] {
    return this.getData().notes.filter((n) => !n.archived);
  }

  getNote(id: string): Note | undefined {
    return this.getData().notes.find((n) => n.id === id);
  }

  createNote(note: Omit<Note, "id" | "createdAt" | "updatedAt" | "attachments">): Note {
    const data = this.getData();
    const now = new Date().toISOString();
    const newNote: Note = {
      ...note,
      id: generateId(),
      attachments: [],
      createdAt: now,
      updatedAt: now,
    };
    data.notes.push(newNote);
    this.saveData();
    return newNote;
  }

  updateNote(id: string, updates: Partial<Note>): Note | undefined {
    const data = this.getData();
    const idx = data.notes.findIndex((n) => n.id === id);
    if (idx === -1) return undefined;
    data.notes[idx] = { ...data.notes[idx], ...updates, updatedAt: new Date().toISOString() };
    this.saveData();
    return data.notes[idx];
  }

  deleteNote(id: string): void {
    this.getData().notes = this.getData().notes.filter((n) => n.id !== id);
    this.saveData();
  }

  searchNotes(query: string, filters?: { tags?: string[]; folderId?: string }): Note[] {
    let notes = this.getNotes();
    const q = query.toLowerCase();
    if (q) {
      notes = notes.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q)
      );
    }
    if (filters?.tags?.length) {
      notes = notes.filter((n) => filters.tags!.some((t) => n.tags.includes(t)));
    }
    if (filters?.folderId) {
      notes = notes.filter((n) => n.folderId === filters.folderId);
    }
    return notes.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  // ============================================================
  // Journal
  // ============================================================

  getJournalEntries(): JournalEntry[] {
    return this.getData().journalEntries.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  getJournalEntry(date: string): JournalEntry | undefined {
    return this.getData().journalEntries.find((e) => e.date === date);
  }

  createJournalEntry(entry: Omit<JournalEntry, "id" | "createdAt" | "updatedAt">): JournalEntry {
    const data = this.getData();
    const now = new Date().toISOString();
    const newEntry: JournalEntry = {
      ...entry,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    };
    const existing = data.journalEntries.findIndex((e) => e.date === entry.date);
    if (existing >= 0) {
      data.journalEntries[existing] = { ...data.journalEntries[existing], ...newEntry, updatedAt: now };
    } else {
      data.journalEntries.push(newEntry);
    }
    this.saveData();
    return newEntry;
  }

  getJournalDates(): string[] {
    return this.getData().journalEntries.map((e) => e.date);
  }

  getJournalStreak(): { current: number; longest: number } {
    const dates = this.getJournalDates();
    return calculateStreak(dates);
  }

  updateJournalEntry(id: string, updates: Partial<JournalEntry>): JournalEntry | undefined {
    const data = this.getData();
    const idx = data.journalEntries.findIndex((e) => e.id === id);
    if (idx === -1) return undefined;
    data.journalEntries[idx] = { ...data.journalEntries[idx], ...updates, updatedAt: new Date().toISOString() };
    this.saveData();
    return data.journalEntries[idx];
  }

  // ============================================================
  // Tasks
  // ============================================================

  getTasks(): Task[] {
    return this.getData().tasks.filter((t) => t.status !== "archived");
  }

  getTask(id: string): Task | undefined {
    return this.getData().tasks.find((t) => t.id === id);
  }

  createTask(task: Omit<Task, "id" | "createdAt" | "updatedAt" | "order">): Task {
    const data = this.getData();
    const now = new Date().toISOString();
    const newTask: Task = {
      ...task,
      id: generateId(),
      order: data.tasks.length,
      createdAt: now,
      updatedAt: now,
    };
    data.tasks.push(newTask);
    this.saveData();
    return newTask;
  }

  updateTask(id: string, updates: Partial<Task>): Task | undefined {
    const data = this.getData();
    const idx = data.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return undefined;
    data.tasks[idx] = { ...data.tasks[idx], ...updates, updatedAt: new Date().toISOString() };
    this.saveData();
    return data.tasks[idx];
  }

  deleteTask(id: string): void {
    const data = this.getData();
    data.tasks = data.tasks.filter((t) => t.id !== id);
    // Cascade: remove the task's mirror event from the calendar.
    const link = "sync:task:" + id;
    data.calendarEvents = (data.calendarEvents || []).filter((e) => e.notes !== link);
    this.saveData();
  }

  toggleTask(id: string): Task | undefined {
    const task = this.getTask(id);
    if (!task) return undefined;
    const done = task.status === "done";
    return this.updateTask(id, {
      status: done ? "todo" : "done",
      completedAt: done ? null : new Date().toISOString(),
    });
  }

  reorderTasks(taskIds: string[]): void {
    const data = this.getData();
    taskIds.forEach((id, index) => {
      const task = data.tasks.find((t) => t.id === id);
      if (task) task.order = index;
    });
    this.saveData();
  }

  // ============================================================
  // Projects
  // ============================================================

  getProjects(): Project[] {
    return this.getData().projects.filter((p) => p.status !== "archived");
  }

  getProject(id: string): Project | undefined {
    return this.getData().projects.find((p) => p.id === id);
  }

  // ===== Decks =====
  getDecks(): Deck[] {
    return this.getData().decks || [];
  }
  getDeck(id: string): Deck | undefined {
    return this.getDecks().find((d) => d.id === id);
  }
  createDeck(deck: Omit<Deck, "id" | "createdAt" | "updatedAt" | "starred">): Deck {
    
    const now = new Date().toISOString();
    const newDeck: Deck = {
      ...deck,
      id: generateId(),
      starred: false,
      createdAt: now,
      updatedAt: now,
    };
    const data = this.getData();
    data.decks = [newDeck, ...(data.decks || [])];
    this.saveData();
    return newDeck;
  }
  updateDeck(id: string, updates: Partial<Deck>): void {
    
    const data = this.getData();
    data.decks = (data.decks || []).map((d) =>
      d.id === id ? { ...d, ...updates, updatedAt: new Date().toISOString() } : d
    );
    this.saveData();
  }
  toggleDeckStar(id: string): void {
    
    const data = this.getData();
    data.decks = (data.decks || []).map((d) => (d.id === id ? { ...d, starred: !d.starred } : d));
    this.saveData();
  }
  deleteDeck(id: string): void {
    
    const data = this.getData();
    data.decks = (data.decks || []).filter((d) => d.id !== id);
    this.saveData();
  }

  createProject(project: Omit<Project, "id" | "createdAt" | "updatedAt" | "taskIds" | "noteIds" | "documentIds" | "habitIds" | "files" | "noorMessages">): Project {
    const data = this.getData();
    const now = new Date().toISOString();
    const newProject: Project = {
      ...project,
      id: generateId(),
      taskIds: [],
      noteIds: [],
      documentIds: [],
      habitIds: [],
      files: [],
      noorMessages: [],
      createdAt: now,
      updatedAt: now,
    };
    data.projects.push(newProject);
    this.saveData();
    return newProject;
  }

  updateProject(id: string, updates: Partial<Project>): Project | undefined {
    const data = this.getData();
    const idx = data.projects.findIndex((p) => p.id === id);
    if (idx === -1) return undefined;
    data.projects[idx] = { ...data.projects[idx], ...updates, updatedAt: new Date().toISOString() };
    this.saveData();
    return data.projects[idx];
  }

  deleteProject(id: string): void {
    const data = this.getData();
    data.projects = data.projects.filter((p) => p.id !== id);
    // Cascade: remove the project's deadline mirror from the calendar.
    const link = "sync:project:" + id;
    data.calendarEvents = (data.calendarEvents || []).filter((e) => e.notes !== link);
    this.saveData();
  }

  linkItemToProject(projectId: string, itemType: "taskIds" | "noteIds" | "documentIds" | "habitIds", itemId: string): void {
    const data = this.getData();
    const project = data.projects.find((p) => p.id === projectId);
    if (project && !project[itemType].includes(itemId)) {
      project[itemType].push(itemId);
      project.updatedAt = new Date().toISOString();
      this.saveData();
    }
  }

  unlinkItemFromProject(projectId: string, itemType: "taskIds" | "noteIds" | "documentIds" | "habitIds", itemId: string): void {
    const data = this.getData();
    const project = data.projects.find((p) => p.id === projectId);
    if (project) {
      project[itemType] = project[itemType].filter((id) => id !== itemId);
      project.updatedAt = new Date().toISOString();
      this.saveData();
    }
  }

  // ============================================================
  // AI
  // ============================================================

  getConversations(): AIConversation[] {
    return this.getData().aiConversations;
  }

  createConversation(): AIConversation {
    const data = this.getData();
    const conv: AIConversation = {
      id: generateId(),
      title: "New Chat",
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.aiConversations.push(conv);
    this.saveData();
    return conv;
  }

  addMessage(conversationId: string, message: Omit<AIMessage, "id" | "timestamp">): AIMessage | null {
    const data = this.getData();
    const conv = data.aiConversations.find((c) => c.id === conversationId);
    if (!conv) return null;
    const msg = {
      ...message,
      id: generateId(),
      timestamp: new Date().toISOString(),
    };
    conv.messages.push(msg);
    conv.updatedAt = new Date().toISOString();
    this.saveData();
    return msg;
  }

  getSuggestions(): AISuggestion[] {
    return this.getData().aiSuggestions;
  }

  addSuggestion(suggestion: Omit<AISuggestion, "id" | "timestamp" | "read">): AISuggestion {
    const data = this.getData();
    const sug: AISuggestion = {
      ...suggestion,
      id: generateId(),
      timestamp: new Date().toISOString(),
      read: false,
    };
    data.aiSuggestions.push(sug);
    this.saveData();
    return sug;
  }

  markSuggestionRead(id: string): void {
    const data = this.getData();
    const sug = data.aiSuggestions.find((s) => s.id === id);
    if (sug) {
      sug.read = true;
      this.saveData();
    }
  }

  // ============================================================
  // ============================================================

  // ============================================================
  // Mode
  // ============================================================



  // ============================================================
  // Onboarding
  // ============================================================

  completeOnboarding(): void {
    this.getData().onboardingCompleted = true;
    this.saveData();
    // Queue the tutorial for right after "Pick your look" — ClientLayout
    // consumes this flag in handleOnboardingComplete. New users get the
    // walkthrough; returning users (flag already consumed) never see it
    // again unless they clear data.
    try {
      localStorage.setItem("orleia-tutorial-pending", "true");
    } catch { /* private mode */ }
  }

  isOnboardingCompleted(): boolean {
    return this.getData().onboardingCompleted;
  }

  /** Age gate (13+ ToS requirement): one-time self-declaration, stored
      locally only — we never collect birthdates or IDs. */
  markAgeConfirmed(): void {
    try {
      localStorage.setItem("orleia_age_confirmed", "1");
    } catch { /* private mode - gate simply re-asks next launch */ }
  }

  isAgeConfirmed(): boolean {
    try {
      return localStorage.getItem("orleia_age_confirmed") === "1";
    } catch {
      return false;
    }
  }

  // ============================================================
  // Data Management
  // ============================================================

  exportData(): string {
    return JSON.stringify(this.getData(), null, 2);
  }

  importData(json: string): boolean {
    try {
      const data = JSON.parse(json);
      this.data = { ...DEFAULT_DATA, ...data };
      this.saveData();
      return true;
    } catch {
      return false;
    }
  }


  // ============================================================
  // Subscribe
  // ============================================================
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  // ============================================================
  // Profile
  // ============================================================
  getProfile(): UserProfile {
    return this.getData().profile || {};
  }

  updateProfile(profile: Partial<UserProfile>): UserProfile {
    const data = this.getData();
    data.profile = { ...data.profile, ...profile };
    this.saveData();
    return data.profile;
  }

  // ============================================================
  // Noor Relationship
  // ============================================================
  getNoorRelationship(): NoorRelationship {
    return this.getData().noorRelationship || "assistant";
  }

  updateNoorRelationship(rel: NoorRelationship): void {
    const data = this.getData();
    data.noorRelationship = rel;
    this.saveData();
  }

  // ============================================================
  // Orleia Mode
  // ============================================================
  getOrleiaMode(): OrleiaMode {
    return this.getData().orleiaMode || "workspace";
  }

  updateOrleiaMode(mode: OrleiaMode): void {
    const data = this.getData();
    data.orleiaMode = mode;
    this.saveData();
  }

  // ============================================================
  // Dashboard Widgets
  // ============================================================
  updateDashboardWidgets(widgets: WidgetId[]): void {
    const data = this.getData();
    data.dashboardWidgets = widgets;
    this.saveData();
  }

  // ============================================================
  // Spreadsheets (Grid)
  // ============================================================
  getSpreadsheets(): Spreadsheet[] {
    return this.getData().spreadsheets;
  }

  getSpreadsheet(id: string): Spreadsheet | undefined {
    return this.getData().spreadsheets.find((s) => s.id === id);
  }

  addSpreadsheet(name: string): Spreadsheet {
    const sheetId = generateId();
    const ss: Spreadsheet = {
      id: generateId(), name, activeSheetId: sheetId,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      sheets: [{ id: sheetId, name: "Sheet 1", cells: {}, colWidths: {}, rowHeights: {}, rowCount: 100, colCount: 26, frozenRows: 0, frozenCols: 0, createdAt: new Date().toISOString() }],
    };
    const data = this.getData();
    data.spreadsheets.push(ss);
    this.saveData();
    return ss;
  }

  updateSpreadsheet(id: string, patch: Partial<Spreadsheet>): void {
    const data = this.getData();
    const idx = data.spreadsheets.findIndex((s) => s.id === id);
    if (idx === -1) return;
    data.spreadsheets[idx] = { ...data.spreadsheets[idx], ...patch, updatedAt: new Date().toISOString() };
    this.saveData();
  }

  deleteSpreadsheet(id: string): void {
    const data = this.getData();
    data.spreadsheets = data.spreadsheets.filter((s) => s.id !== id);
    this.saveData();
  }

  updateCell(ssId: string, sheetId: string, cellKey: string, cell: import("@/types").Cell): void {
    const data = this.getData();
    const ss = data.spreadsheets.find((s) => s.id === ssId);
    if (!ss) return;
    const sheet = ss.sheets.find((s) => s.id === sheetId);
    if (!sheet) return;
    sheet.cells[cellKey] = cell;
    ss.updatedAt = new Date().toISOString();
    this.saveData();
  }

  // ============================================================
  // Conversation Messages
  // ============================================================
  updateConversation(id: string, patch: Partial<AIConversation>): void {
    const data = this.getData();
    const idx = data.aiConversations.findIndex((c) => c.id === id);
    if (idx === -1) return;
    data.aiConversations[idx] = { ...data.aiConversations[idx], ...patch, updatedAt: new Date().toISOString() };
    this.saveData();
  }

  replaceConversationMessages(convId: string, messages: AIMessage[]): void {
    const data = this.getData();
    const conv = data.aiConversations.find((c) => c.id === convId);
    if (!conv) return;
    conv.messages = messages;
    conv.updatedAt = new Date().toISOString();
    this.saveData();
  }

  // ============================================================
  // Link Entities (Graph)
  // ============================================================
  linkEntities(source: string, target: string, type: string = "related"): void {
    const data = this.getData();
    const id = generateId();
    data.links.push({ id, source, target, type });
    this.saveData();
  }

  async clearAll(): Promise<void> {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SYNC_KEY);
    localStorage.removeItem("orleia-password");
    localStorage.removeItem("orleia-tutorial-pending");
    await clearIDB();
    this.data = null;
  }
}

export const storage = new Storage();
