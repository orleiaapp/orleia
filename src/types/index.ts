// ============================================================
// Core Types
// ============================================================

export type Theme = "light" | "dark" | "system";
export type ViewMode = "list" | "grid" | "kanban" | "calendar";
export type AccentColor = "slate" | "amber" | "emerald" | "sky" | "violet" | "rose" | "orange";
export type OrleiaMode = "workspace" | "canvas" | "clone";

// ============================================================
// Project Types
// ============================================================

export type ProjectStatus = "active" | "on_hold" | "completed" | "archived";

export interface ProjectFile {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string; // base64 data URL for persistence
  uploadedAt: string;
}

export type DeckSlideLayout = 'title' | 'bullets' | 'statement' | 'quote' | 'end' | 'two-col' | 'stats' | 'timeline' | 'section';

export interface DeckSlide {
  id: string;
  layout: DeckSlideLayout;
  kicker?: string; // small label above the title
  title: string;
  content: string[]; // bullet lines / subtitle / quote lines depending on layout
  contentRight?: string[]; // right column for two-col layout
  imageUrl?: string; // optional image (data URL or remote URL)
  stats?: Array<{ value: string; label: string }>; // for 'stats' layout
  notes: string; // speaker notes
  accent?: string; // per-slide accent override
}

export interface Deck {
  id: string;
  title: string;
  description: string;
  slides: DeckSlide[];
  theme: string; // key of DECK_THEMES
  transition: 'fade' | 'slide' | 'zoom';
  starred: boolean;
  createdAt: string;
  updatedAt: string;
}


export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  status: ProjectStatus;
  taskIds: string[];
  noteIds: string[];
  documentIds: string[];
  habitIds: string[];
  deckIds?: string[];
  files: ProjectFile[];
  noorMessages: AIMessage[];
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
}
export type NoorRelationship = "observer" | "assistant" | "operator";

export interface UserProfile {
  name?: string;
  pronouns?: string;
  ageRange?: string;
  timeZone?: string;
  workStudy?: string | string[];
  interests?: string[];
  schedule?: string;
  productivityPrefs?: string | string[];
  communicationPrefs?: string | string[];
  goals?: string;
  helpWith?: string[];
}

export interface ThemeConfig {
  theme: Theme;
  primaryColor: string;
  accentColor: AccentColor;
  fontSize: "sm" | "md" | "lg";
  reducedMotion: boolean;
  dyslexiaFriendly: boolean;
  highContrast: boolean;
  underlineLinks: boolean;
  language: string;
  voiceId: string | null;
  remindersEnabled: boolean;
  remindEvents: boolean;
  remindHabits: boolean;
  remindTasks: boolean;
  remindMentions: boolean;
  remindWellness: boolean;
  desktopNotifications: boolean;
  wellnessTime: string;
}

// ============================================================
// Habit Types
// ============================================================

export type HabitFrequency = "daily" | "weekly" | "monthly" | "custom";
export type HabitTimeOfDay = "morning" | "afternoon" | "evening" | "anytime";

export const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DAYS_OF_WEEK_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export interface HabitCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  createdAt: string;
}

export interface Habit {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  frequency: HabitFrequency;
  customDays?: number[];
  timeOfDay: HabitTimeOfDay;
  targetCount: number;
  createdAt: string;
  archived: boolean;
  color: string;
  icon: string;
}

export interface HabitLog {
  id: string;
  habitId: string;
  date: string;
  count: number;
  note?: string;
  createdAt: string;
}

export interface HabitStreak {
  habitId: string;
  currentStreak: number;
  longestStreak: number;
  lastLogDate: string | null;
  totalCompletions: number;
  completionRate: number;
}

// ============================================================
// Note Types
// ============================================================

export interface NoteTag {
  id: string;
  name: string;
  color: string;
}

export interface NoteFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  contentHtml: string;
  folderId: string | null;
  projectId: string | null;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  favorite: boolean;
  attachments: Attachment[];
  aiSummary?: string;
  aiActionItems?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id?: string;
  name: string;
  type?: "image" | "file" | "link" | string;
  url?: string;
  dataUrl?: string;
  description?: string;
  kind?: string;
  size?: number;
  createdAt?: string;
}

// ============================================================
// Journal Types
// ============================================================

export type Mood = "amazing" | "good" | "neutral" | "bad" | "terrible";

export interface MoodConfig {
  value: Mood;
  emoji: string;
  label: string;
  color: string;
}

export const MOODS: MoodConfig[] = [
  { value: "amazing", emoji: "🌟", label: "Amazing", color: "#d4d4d8" },
  { value: "good", emoji: "😊", label: "Good", color: "#a1a1aa" },
  { value: "neutral", emoji: "😐", label: "Neutral", color: "#71717a" },
  { value: "bad", emoji: "😔", label: "Bad", color: "#52525b" },
  { value: "terrible", emoji: "😢", label: "Terrible", color: "#3f3f46" },
];

export interface JournalEntry {
  id: string;
  date: string;
  title: string;
  content: string;
  mood: Mood;
  gratitude: string[];
  reflectionPrompts: ReflectionPrompt[];
  createdAt: string;
  updatedAt: string;
}

export interface ReflectionPrompt {
  question: string;
  answer: string;
}

// ============================================================
// Task Types
// ============================================================

export type TaskPriority = "urgent" | "high" | "medium" | "low";
export type TaskStatus = "todo" | "in_progress" | "done" | "archived";
export type RecurringType = "daily" | "weekly" | "monthly" | "yearly" | "none";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  dueTime: string | null;
  completedAt: string | null;
  tags: string[];
  listId: string | null;
  projectId: string | null;
  recurring: RecurringType;
  recurringDays?: number[];
  recurringEndDate: string | null;
  estimatedMinutes: number | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskList {
  id: string;
  name: string;
  color: string;
  icon: string;
  createdAt: string;
}

// ============================================================
// Analytics Types
// ============================================================

export interface ProductivityScore {
  date: string;
  score: number;
  habitsCompleted: number;
  tasksCompleted: number;
  journalWritten: boolean;
  notesCreated: number;
}

export interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  habitCompletions: number;
  tasksCompleted: number;
  journalEntries: number;
  notesCreated: number;
  averageMood: Mood | null;
  productivityScores: ProductivityScore[];
}

// ============================================================
// AI Types
// ============================================================

// Cloud tiers are the fixed ids below; "local-*" ids (Local AI, powered by
// the user's own Ollama install) are validated at the usage sites. The
// (string & {}) trick keeps literal autocomplete while allowing local ids.
export type AIModel = "fast-1" | "core-1" | "agent-1" | (string & {});

export type AISource = {
  id?: string;
  kind: "document" | "journal" | "task" | "habit" | "web";
  title: string;
  url?: string;
  href?: string;
  snippet: string;
};

export type BriefAction = {
  id?: string;
  type?: string;
  label?: string;
  detail?: string;
  action?: string;
  params?: Record<string, unknown>;
};

export const MODEL_ALIASES: Record<string, AIModel> = {
  // Legacy (Ethos/Logos/Verse era) -> new tiers, so old stored
  // conversations and settings keep resolving.
  ethos: "agent-1",
  logos: "core-1",
  verse: "fast-1",
  "ethos-4.7": "agent-1",
  "logos-4.5": "core-1",
  "verse-4": "fast-1",
  fast: "fast-1",
  core: "core-1",
  agent: "agent-1",
  "fast-1": "fast-1",
  "core-1": "core-1",
  "agent-1": "agent-1",
  // Legacy aliases for migration
};

export const AI_MODELS: { id: AIModel; name: string; description: string; tagline: string; contextWindow: number; responseStyle: string }[] = [
  { id: "fast-1", name: "Fast", description: "Instant answers, zero wait", tagline: "Quick, concise, to the point", contextWindow: 12, responseStyle: "concise" },
  { id: "core-1", name: "Core", description: "Best for everyday work", tagline: "Balanced, practical, actionable", contextWindow: 24, responseStyle: "balanced" },
  // "agent-1" remains a valid AIModel (saved preferences alias to it) but is
  // deliberately not offered in pickers - Agent mode is parked for now.
];

export interface AIMessage {
  id: string;
  role: "user" | "assistant";
  /** Confirm chip: a proposed action awaiting the user's one-tap decision. */
  proposal?: { action: string; params: Record<string, unknown> };
  /** Set once the user confirmed/dismissed this proposal (chip renders inert). */
  proposalResolved?: "confirmed" | "dismissed";
  /** System-injected banner (e.g. "5 messages left today"). Never sent to the LLM. */
  kind?: "usage-warning";
  content: string;
  timestamp: string;
  model?: AIModel;
  pinned?: boolean;
  attachments?: Attachment[];
  image?: string | { dataUrl: string; prompt: string; };
  sources?: AISource[];
  /** Model's internal reasoning (thinking tokens). Local-only: never sent back to the LLM. */
  thinking?: string;
  research?: import("@/lib/research").ResearchResult;
  actions?: BriefAction[];
  branch?: string | boolean;
}

export interface AIConversation {
  id: string;
  title: string;
  messages: AIMessage[];
  pinned?: boolean;
  /** Set on threads bound to a hired pet agent (chat-with-pet mode). */
  petAgentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AISuggestion {
  id: string;
  type: "insight" | "tip" | "motivation" | "suggestion";
  title: string;
  content: string;
  timestamp: string;
  read: boolean;
}

// ============================================================
// Graph Types
// ============================================================

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  type: string;
}

// ============================================================
// Widget Types
// ============================================================

export type WidgetId =
  | "productivity" | "stats" | "tasks" | "habits" | "notes"
  | "streak" | "quote" | "quick-note" | "pomodoro" | "mood" | "wrapped" | "pet";

export interface WidgetDef {
  id: WidgetId;
  name: string;
  description: string;
  icon: string;
  default: boolean;
  /** iOS-style size class: "small" (half-row square), "wide" (full-row
   *  rectangle), "large" (full-row, tall). Defaults to "small". */
  size?: "small" | "wide" | "large";
}

// ============================================================
// Grid (Spreadsheet) Types
// ============================================================

export type CellFormat = {
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  bgColor?: string;
  textColor?: string;
};

export interface Cell {
  value: string;
  formula?: string;
  format?: CellFormat;
}

export interface Sheet {
  id: string;
  name: string;
  cells: Record<string, Cell>;
  colWidths: Record<string, number>;
  rowHeights: Record<string, number>;
  rowCount: number;
  colCount: number;
  frozenRows: number;
  frozenCols: number;
  createdAt: string;
}

export interface Spreadsheet {
  id: string;
  name: string;
  sheets: Sheet[];
  activeSheetId: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// App State
// ============================================================

// ============================================================
// Orleia Office: Calendar / Forms / Board
// ============================================================

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // yyyy-mm-dd
  time: string | null; // HH:mm or null for all-day
  endTime?: string | null; // optional duration end, HH:mm (15-min grid)
  color: string;
  repeat: "none" | "daily" | "weekly" | "monthly";
  notes: string;
  createdAt: string;
}

export type FormQuestionType = "text" | "choice" | "checkbox" | "rating" | "date";

export interface FormQuestion {
  id: string;
  type: FormQuestionType;
  label: string;
  options: string[]; // for choice/checkbox
  required: boolean;
}

export interface Form {
  id: string;
  title: string;
  description: string;
  questions: FormQuestion[];
  responses: FormResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface FormResponse {
  id: string;
  answers: Record<string, string | string[] | number>;
  submittedAt: string;
}

export interface BoardSticky {
  id: string;
  x: number; // percentage 0-100
  y: number;
  text: string;
  color: string;
}

export interface BoardShape {
  id: string;
  kind: "rect" | "ellipse" | "arrow";
  x1: number; y1: number; x2: number; y2: number; // percentages
  color: string;
}

export interface Board {
  id: string;
  name: string;
  stickies: BoardSticky[];
  shapes: BoardShape[];
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Pet Agent Types — hired pet agents (paid feature). Noor stays the
// operator; pets are role-based agents the user hires into a job
// catalog. v1 is confirm-first: agents propose, the user taps.
// ============================================================

export type PetAgentRole = "wrangler" | "planner" | "scout" | "auditor";

export interface PetAgent {
  id: string;
  /** The cosmetic pet (lib/pets.ts PETS id) wearing this role. */
  petId: string;
  role: PetAgentRole;
  /** Display name: petName || pet.name. */
  name: string;
  autonomy: "suggest";
  /** Trust points: +1 accepted proposal, -1 dismissed (floor 0). */
  trust: number;
  hiredAt: string;
}

export interface PetReceipt {
  id: string;
  agentId: string;
  role: PetAgentRole;
  kind: "hired" | "released" | "proposed" | "accepted" | "dismissed";
  summary: string;
  createdAt: string;
}

export interface PetAgentState {
  roster: PetAgent[];
  /** Newest first, capped (oldest trimmed). */
  receipts: PetReceipt[];
  /** Proposal dedupe: key -> date shown. */
  seenProposals: Record<string, string>;
  /** Role -> date the user said "Later" (no re-proposal that day). */
  snoozedUntil: Record<string, string>;
}

export interface AppData {
  petAgents?: PetAgentState;
  theme: ThemeConfig;
  habits: Habit[];
  habitCategories: HabitCategory[];
  habitLogs: HabitLog[];
  notes: Note[];
  noteTags: NoteTag[];
  noteFolders: NoteFolder[];
  journalEntries: JournalEntry[];
  tasks: Task[];
  taskLists: TaskList[];
  projects: Project[];
  aiConversations: AIConversation[];
  aiSuggestions: AISuggestion[];
  selectedModel: AIModel;
  profile: UserProfile;
  noorRelationship: NoorRelationship;
  orleiaMode: OrleiaMode;
  onboardingCompleted: boolean;
  lastSync: string | null;
  links: GraphLink[];
  reminderDismissed: Record<string, string>;
  streakFreezeTokens?: number;
  habitFrozenDates?: Record<string, string[]>;
  habitStreakRecords?: Record<string, number>;
  perfectWeeks?: number;
  lastPerfectWeek?: string;
  dashboardWidgets: WidgetId[];
  spreadsheets: Spreadsheet[];
  decks: Deck[];
  calendarEvents: CalendarEvent[];
  forms: Form[];
  boards: Board[];
}

export const PRIORITY_CONFIG = {
  urgent: { label: "Urgent", color: "#a1a1aa", icon: "alert-circle" },
  high: { label: "High", color: "#a1a1aa", icon: "arrow-up" },
  medium: { label: "Medium", color: "#a1a1aa", icon: "minus" },
  low: { label: "Low", color: "#52525b", icon: "arrow-down" },
} as const;

export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string }> = {
  todo: { label: "To Do", color: "#52525b" },
  in_progress: { label: "In Progress", color: "#a1a1aa" },
  done: { label: "Done", color: "#d4d4d8" },
  archived: { label: "Archived", color: "#3f3f46" },
};
