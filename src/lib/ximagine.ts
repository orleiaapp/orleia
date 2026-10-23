// ============================================================
// Ximagine — Orleia's experimental app-builder beta.
// Types, storage and constants. All Ximagine state (chats, built
// apps, per-app data) lives in localStorage on the user's device.
// The only thing that leaves the device is the chat text itself,
// sent through the guarded /api/ximagine route to the AI provider
// (NVIDIA), under the same terms as Noor chats.
// ============================================================

export type XMode = "plan" | "build";
export type XThemeId = "noir" | "paper" | "ocean" | "sunset" | "forest" | "mono";

export interface XFile {
  path: string;
  content: string;
}

export interface XMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Streamed reasoning trace (assistant only). Shown in a collapsible block. */
  thinking?: string;
  ts: number;
  /** Set on assistant messages whose reply wrote app files. */
  fileCount?: number;
}

export interface XChat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  mode: XMode;
  messages: XMessage[];
  appId?: string;
}

export interface XApp {
  id: string;
  chatId: string;
  name: string;
  theme: XThemeId;
  files: XFile[];
  createdAt: number;
  updatedAt: number;
}

export interface XData {
  v: 1;
  onboarded: boolean;
  /** Server-tracked daily credit usage mirror; the server is the source of truth. */
  credits: { day: string; used: number };
  /** Theme preselected for the next build. */
  defaultTheme: XThemeId;
  chats: XChat[];
  apps: XApp[];
}

/** Free beta allowance: 50 AI turns per device per UTC day. Server-enforced in /api/ximagine. */
export const XIMAGINE_DAILY_CREDITS = 50;

export const X_STORAGE_KEY = "ximagine-data-v1";
const X_APPDATA_PREFIX = "ximagine-appdata-";

// Storage hygiene caps (localStorage is ~5MB; keep worst case well under).
const MAX_CHATS = 30;
const MAX_MESSAGES_PER_CHAT = 60;
const MAX_APPS = 30;
const MAX_FILE_CHARS = 150_000;
export const MAX_TOTAL_FILE_CHARS = 400_000;

export const X_THEMES: { id: XThemeId; name: string; swatch: string; hint: string }[] = [
  { id: "noir", name: "Noir", swatch: "#18181b", hint: "near-black background (#0b0d10), zinc-gray text, white accents, thin subtle borders" },
  { id: "paper", name: "Paper", swatch: "#faf9f6", hint: "warm off-white background (#faf9f6), ink-black text, one restrained accent color" },
  { id: "ocean", name: "Ocean", swatch: "#0e7490", hint: "deep blue-slate background, cyan/teal accents, soft layered depth" },
  { id: "sunset", name: "Sunset", swatch: "#fb7185", hint: "warm cream background with coral and amber accents" },
  { id: "forest", name: "Forest", swatch: "#052e16", hint: "dark forest-green tinted background with mint-green accents" },
  { id: "mono", name: "Mono", swatch: "#a1a1aa", hint: "pure black and white, zero color, high contrast" },
];

export function themeById(id: XThemeId) {
  return X_THEMES.find((t) => t.id === id) || X_THEMES[0];
}

export function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export function uid(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyXData(): XData {
  return {
    v: 1,
    onboarded: false,
    credits: { day: utcDay(), used: 0 },
    defaultTheme: "noir",
    chats: [],
    apps: [],
  };
}

function clampFiles(files: XFile[]): XFile[] {
  const out: XFile[] = [];
  let total = 0;
  for (const f of files) {
    if (!f || typeof f.path !== "string" || typeof f.content !== "string") continue;
    const content = f.content.slice(0, MAX_FILE_CHARS);
    total += content.length;
    if (total > MAX_TOTAL_FILE_CHARS) break;
    out.push({ path: f.path.slice(0, 200), content });
  }
  return out;
}

/** Load persisted state (client only). Returns defaults on any error. */
export function loadXData(): XData {
  if (typeof window === "undefined") return emptyXData();
  try {
    const raw = localStorage.getItem(X_STORAGE_KEY);
    if (!raw) return emptyXData();
    const d = JSON.parse(raw) as XData;
    if (!d || typeof d !== "object" || d.v !== 1) return emptyXData();
    const data = emptyXData();
    data.onboarded = Boolean(d.onboarded);
    data.credits =
      d.credits && typeof d.credits.day === "string" && typeof d.credits.used === "number"
        ? { day: d.credits.day, used: Math.max(0, Math.floor(d.credits.used)) }
        : data.credits;
    data.defaultTheme = X_THEMES.some((t) => t.id === d.defaultTheme) ? d.defaultTheme : "noir";
    if (Array.isArray(d.chats))
      data.chats = d.chats.slice(0, MAX_CHATS).map((c) => ({
        id: typeof c?.id === "string" ? c.id : uid(),
        title: typeof c?.title === "string" ? c.title.slice(0, 120) : "New chat",
        createdAt: Number(c?.createdAt) || Date.now(),
        updatedAt: Number(c?.updatedAt) || Date.now(),
        mode: c?.mode === "build" ? "build" : "plan",
        appId: typeof c?.appId === "string" ? c.appId : undefined,
        messages: Array.isArray(c?.messages)
          ? c.messages.slice(-MAX_MESSAGES_PER_CHAT).map((m) => ({
              id: typeof m?.id === "string" ? m.id : uid(),
              role: m?.role === "user" ? "user" : "assistant",
              content: typeof m?.content === "string" ? m.content : "",
              thinking: typeof m?.thinking === "string" ? m.thinking.slice(0, 20_000) : undefined,
              ts: Number(m?.ts) || Date.now(),
              fileCount: typeof m?.fileCount === "number" ? m.fileCount : undefined,
            }))
          : [],
      }));
    if (Array.isArray(d.apps))
      data.apps = d.apps.slice(0, MAX_APPS).map((a) => ({
        id: typeof a?.id === "string" ? a.id : uid(),
        chatId: typeof a?.chatId === "string" ? a.chatId : "",
        name: typeof a?.name === "string" ? a.name.slice(0, 80) : "Untitled app",
        theme: X_THEMES.some((t) => t.id === a?.theme) ? (a.theme as XThemeId) : "noir",
        files: clampFiles(Array.isArray(a?.files) ? a.files : []),
        createdAt: Number(a?.createdAt) || Date.now(),
        updatedAt: Number(a?.updatedAt) || Date.now(),
      }));
    if (data.credits.day !== utcDay()) data.credits = { day: utcDay(), used: 0 };
    return data;
  } catch {
    return emptyXData();
  }
}

/** Persist state (client only). Best-effort: quota errors are swallowed. */
export function saveXData(data: XData): void {
  if (typeof window === "undefined") return;
  try {
    const slim: XData = {
      ...data,
      chats: data.chats.slice(0, MAX_CHATS).map((c) => ({
        ...c,
        messages: c.messages.slice(-MAX_MESSAGES_PER_CHAT).map((m) => ({
          ...m,
          thinking: m.thinking ? m.thinking.slice(0, 20_000) : undefined,
        })),
      })),
      apps: data.apps.slice(0, MAX_APPS).map((a) => ({ ...a, files: clampFiles(a.files) })),
    };
    localStorage.setItem(X_STORAGE_KEY, JSON.stringify(slim));
  } catch {
    /* quota exceeded — state stays in memory for this session */
  }
}

// ---- Per-app generated-app data (via the sandbox postMessage bridge) ----

export function loadAppData(appId: string): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(X_APPDATA_PREFIX + appId);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Save data posted from a sandboxed preview iframe. Returns false when the
 *  payload is structurally implausible (spam guard). */
export function saveAppData(appId: string, data: unknown): boolean {
  if (typeof window === "undefined") return false;
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  try {
    const json = JSON.stringify(data);
    if (json.length > 400_000) return false; // generated-app storage spam guard
    localStorage.setItem(X_APPDATA_PREFIX + appId, json);
    return true;
  } catch {
    return false;
  }
}

export function clearAppData(appId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(X_APPDATA_PREFIX + appId);
  } catch {
    /* ignore */
  }
}
