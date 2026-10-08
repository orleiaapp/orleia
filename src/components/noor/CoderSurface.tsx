"use client";

// ============================================================
// Noor Coder (beta) — the coding surface behind the header switch.
// Visual language mirrors Noor (app tokens, pill composer, primary
// accents) so mode switching feels like one product; only the message
// grammar differs (prompts, code panes, dev-oriented quick actions).
//
// Features borrowed from the top coding tools (CODER_PLAN rev 6):
//   - slash commands + skills          (Claude Code)
//   - reasoning/"thinking" disclosure  (Claude Code, Codex)
//   - retry the last reply             (Claude Code /rewind-lite)
//   - model + effort picker            (Codex reasoning-effort selector)
//   - token budget, shown as % of      (usage meters; replaces the
//     today                          gameable message count)
//   - web research toggle + source     (Codex / Claude Code web search)
//     chips
//   - queued sends while busy          (multi-task: type ahead, the
//     queue drains when the reply lands)
//   - conversation branches            (Git-branch style forks from any
//     message + a thread switcher)
//   - workspace folder + action cards  (real writes to the PC via the
//     File System Access API) with a
//     terminal-style log of every action
//   - copy conversation & code-block copy buttons, Esc = stop
// The client gate is decoration: /api/coder enforces tier (403) and the
// daily token budget (402) server-side. Desktop (lg+) only — the page
// guards entry with matchMedia; CSS hides the switch below lg.
// ============================================================

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Bug,
  Check,
  Copy,
  FileText,
  FlaskConical,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Globe,
  Info,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  Square,
  Terminal,
  Wand2,
  X,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Markdown } from "@/components/chat/Markdown";
import { getDeviceId } from "@/lib/device-id";
import { storage } from "@/lib/storage";
import { buildSkillsBlock, getSkills, skillForCommand } from "@/lib/noor-skills";
import { cn, generateId } from "@/lib/utils";
import {
  type CoderAction,
  ensurePermission,
  getWorkspace,
  makeWorkspaceDir,
  pickWorkspace,
  writeWorkspaceFile,
} from "@/lib/coder-workspace";

type Source = { title: string; url: string };
type CMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  sources?: Source[];
};
/** One conversation fork. `parent` builds the branch tree in the menu. */
type Thread = {
  id: string;
  title: string;
  parent?: string;
  messages: CMsg[];
  /** For the shared recent-chats sidebar's recency sort. */
  updatedAt?: number;
};
type ActionState = "ok" | "err";
type LogEntry = { id: string; t: string; op: string; target: string; ok: boolean };

const STORE_KEY = "orleia.coderChat.v2";
const LEGACY_KEY = "orleia.coderChat.v1";

// Quick-action prompt templates. Prompt engineering, not UI copy (the
// model answers in the interface language via /api/coder's rule); only
// the labels are translated.
const TEMPLATES: Record<string, { icon: typeof Info; prompt: string }> = {
  explain: { icon: Info, prompt: "Explain this code step by step:\n\n" },
  debug: { icon: Bug, prompt: "Find the bug in this code and explain the fix:\n\n" },
  test: { icon: FlaskConical, prompt: "Write tests for this code:\n\n" },
  refactor: { icon: Wand2, prompt: "Refactor this code for clarity without changing behavior:\n\n" },
  scaffold: {
    icon: FolderPlus,
    prompt:
      "Scaffold a complete, runnable project from scratch — design the folder structure and write every file needed:\n\n",
  },
};

const skillSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const isValidMsg = (x: unknown): x is CMsg => {
  const m = x as CMsg | null;
  return Boolean(
    m &&
      typeof m.id === "string" &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string"
  );
};

function makeThread(messages: CMsg[], id: string, parent?: string): Thread {
  const title = messages.find((m) => m.role === "user")?.content.trim().slice(0, 48) || "";
  return { id, title, parent, messages, updatedAt: Date.now() };
}

/** v2 store with a v1 → v2 migration (old flat transcript becomes one thread). */
function loadState(): { threads: Thread[]; activeId: string } {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const threads: unknown[] = Array.isArray(parsed?.threads) ? parsed.threads : [];
      const ok = threads
        .filter((t): t is Thread => {
          const x = t as Thread | null;
          return Boolean(x && typeof x.id === "string" && Array.isArray(x.messages));
        })
        .map((t, i, arr) => ({
          ...t,
          messages: t.messages.filter(isValidMsg).slice(-80),
          // Sidebar recency: threads saved before updatedAt existed keep
          // their creation order, anchored near now.
          updatedAt:
            typeof t.updatedAt === "number" ? t.updatedAt : Date.now() - (arr.length - i) * 60000,
        }));
      if (ok.length > 0) {
        const activeId =
          typeof parsed?.activeId === "string" && ok.some((t) => t.id === parsed.activeId)
            ? parsed.activeId
            : ok[0].id;
        return { threads: ok, activeId };
      }
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const msgs = (JSON.parse(legacy)?.messages as unknown[]) || [];
      const ok = msgs.filter(isValidMsg);
      if (ok.length > 0) {
        const thread = makeThread(ok.slice(-80), generateId());
        return { threads: [thread], activeId: thread.id };
      }
    }
  } catch {
    /* corrupt store — start fresh */
  }
  const fresh = makeThread([], generateId());
  return { threads: [fresh], activeId: fresh.id };
}

/**
 * Pull `orleia-action` fences out of a reply: each becomes a real action
 * card (write to the connected folder / copy a shell command). Invalid
 * JSON keeps the raw fence so nothing the model wrote disappears.
 */
function extractActions(content: string): { rest: string; actions: CoderAction[] } {
  const actions: CoderAction[] = [];
  const rest = content.replace(/```orleia-action[ \t]*\n([\s\S]*?)```/g, (whole, body) => {
    try {
      const j = JSON.parse(String(body).trim());
      if (j && typeof j.op === "string") {
        actions.push(j as CoderAction);
        return "\n";
      }
    } catch {
      /* not valid JSON — render it as a code block instead */
    }
    return whole;
  });
  return { rest, actions };
}

/** Apply a message list to a thread, deriving the title from the first prompt. */
function finalize(t: Thread, messages: CMsg[]): Thread {
  const title = t.title || (messages.find((m) => m.role === "user")?.content.trim().slice(0, 48) || "");
  return { ...t, messages, title, updatedAt: Date.now() };
}

/** Collapsible reasoning pane — spinner while streaming, quiet after. */
function ThinkingBlock({ text, active }: { text: string; active: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-full border border-border/60 bg-secondary/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {active ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Sparkles className="h-3 w-3" />
        )}
        {t("coder.thinking")}
      </button>
      {open && (
        <div className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap border-l-2 border-border pl-3 text-[12px] leading-relaxed text-muted-foreground">
          {text}
        </div>
      )}
    </div>
  );
}

export function CoderSurface({
  onExit,
  onTierLocked,
  openThread,
  model,
  effort,
  temperature,
  maxTokens,
  maxContext,
  modelLabel,
}: {
  onExit: () => void;
  onTierLocked: () => void;
  /** Pending "open this thread" request from the shared recent-chats sidebar. */
  openThread?: { id: string; seq: number } | null;
  /** Resolved NVIDIA model id from the shared model/effort picker. */
  model: string;
  /** Effort level id — drives the server-side token cost weight. */
  effort: string;
  temperature: number;
  maxTokens: number;
  /** Max messages sent per request — the effort profile's context window. */
  maxContext: number;
  modelLabel: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [{ threads, activeId }, setState] = useState(() =>
    typeof window === "undefined"
      ? { threads: [makeThread([], "init")], activeId: "init" }
      : loadState()
  );
  // Casual hero greeting word — picked once after mount (hydration-safe).
  const [greetIdx, setGreetIdx] = useState(0);
  useEffect(() => {
    setGreetIdx(Math.floor(Math.random() * 3));
  }, []);
  // Sidebar request: open/focus a specific thread (seq makes repeat taps
  // re-fire; cleared on leave so remounts keep the persisted active thread).
  useEffect(() => {
    if (!openThread) return;
    setState((s) =>
      s.threads.some((t) => t.id === openThread.id) ? { ...s, activeId: openThread.id } : s
    );
  }, [openThread]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [capHit, setCapHit] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ used: number; limit: number | null } | null>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);
  // Web research toggle — server also auto-searches live queries.
  const [web, setWeb] = useState(false);
  // Multi-task queue: messages typed while a reply streams, drained in order.
  const [queueLen, setQueueLen] = useState(0);
  const queueRef = useRef<string[]>([]);
  // Threads menu + terminal log.
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [termOpen, setTermOpen] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [actionState, setActionState] = useState<Record<string, ActionState>>({});
  // Connected workspace folder (File System Access API).
  const wsRef = useRef<FileSystemDirectoryHandle | null>(null);
  const [wsName, setWsName] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const tierLockedCb = useRef(onTierLocked);
  tierLockedCb.current = onTierLocked;
  // Latest-state mirrors so the queue dispatcher (fired from a timer)
  // never reads a stale closure.
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const activeThread = threads.find((t) => t.id === activeId) ?? threads[0];
  const messages = activeThread?.messages ?? [];

  // "Hi, Maciej — let's write some code." (word randomized, name local).
  const coderGreet =
    [t("assistant.greetHi"), t("assistant.greetHey"), t("assistant.greetHello")][greetIdx] ||
    t("assistant.greetHi");
  const coderWho = storage.getData().profile?.name?.trim() || t("assistant.there");

  const slashMatches =
    slashOpen && input.startsWith("/") && !input.slice(1).includes(" ")
      ? getSkills().filter(
          (s) => s.enabled && skillSlug(s.name).startsWith(input.slice(1).toLowerCase())
        )
      : [];

  // Server-truth on mount: today's token usage + lock state (covers a
  // license that lapsed while the surface was mounted) + a previously
  // granted workspace folder.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/billing/license?deviceId=${encodeURIComponent(getDeviceId())}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const j = await res.json();
        if (!alive) return;
        // Lock only when a HEALTHY store says free — a tier resolved during
        // a storage outage must not show the upgrade gate (server fails open
        // too), and the % chip must not seed from outage-era numbers.
        if (j.billingConfigured && j.tier === "free" && j.storageHealthy !== false) {
          setLocked(true);
          tierLockedCb.current();
        }
        if (typeof j.coderUsed === "number" && j.storageHealthy !== false) {
          setUsage({ used: j.coderUsed, limit: j.coderLimit ?? null });
        }
      } catch {
        /* enforcement is server-side; the chip just stays hidden */
      }
      const handle = await getWorkspace().catch(() => null);
      if (alive && handle) {
        wsRef.current = handle;
        setWsName(handle.name);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Persist after each settled exchange (not per streamed token).
  useEffect(() => {
    if (busy) return;
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          v: 2,
          activeId,
          threads: threads.slice(-30).map((t) => ({ ...t, messages: t.messages.slice(-80) })),
        })
      );
    } catch {
      /* quota — transcript is a convenience, not data of record */
    }
  }, [threads, activeId, busy]);

  // Auto-scroll the transcript, only its own container.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, activeId]);

  const dropReplyIfEmpty = (threadId: string, replyId: string) =>
    setState((s) => ({
      ...s,
      threads: s.threads.map((t) =>
        t.id === threadId
          ? { ...t, messages: t.messages.filter((m) => !(m.id === replyId && !m.content && !m.thinking)) }
          : t
      ),
    }));

  /** Core send: `history` already ends with the user message. */
  async function runSend(threadId: string, history: CMsg[]) {
    const replyId = generateId();
    setState((s) => ({
      ...s,
      threads: s.threads.map((t) =>
        t.id === threadId ? finalize(t, [...history, { id: replyId, role: "assistant", content: "" }]) : t
      ),
    }));
    setInput("");
    setSlashOpen(false);
    if (taRef.current) taRef.current.style.height = "auto";
    setBusy(true);
    setErr(null);
    setCapHit(false);
    const controller = new AbortController();
    abortRef.current = controller;
    let replySources: Source[] | null = null;
    try {
      const res = await fetch("/api/coder", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-orleia-device": getDeviceId() },
        body: JSON.stringify({
          messages: history.slice(-maxContext).map(({ role, content }) => ({ role, content })),
          model,
          effort,
          temperature,
          maxTokens,
          stream: true,
          lang: document.documentElement.lang || "en",
          // User's standing skills, same injection style as Noor's situation block.
          skills: buildSkillsBlock("coder"),
          // Web research: chip state; the server ALSO auto-searches live queries.
          research: web,
        }),
      });
      const raw = res.headers.get("x-orleia-usage");
      if (raw) {
        try {
          const u = JSON.parse(raw);
          if (typeof u.used === "number") setUsage({ used: u.used, limit: u.limit ?? null });
        } catch {
          /* header is advisory */
        }
      }
      if (res.status === 403) {
        setLocked(true);
        tierLockedCb.current();
        dropReplyIfEmpty(threadId, replyId);
        return;
      }
      if (res.status === 402) {
        setCapHit(true);
        dropReplyIfEmpty(threadId, replyId);
        return;
      }
      if (!res.ok || !res.body) throw new Error(`http ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let full = "";
      let think = "";
      const publish = () =>
        setState((s) => ({
          ...s,
          threads: s.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: t.messages.map((m) =>
                    m.id === replyId
                      ? {
                          ...m,
                          content: full,
                          ...(think ? { thinking: think } : {}),
                          ...(replySources ? { sources: replySources } : {}),
                        }
                      : m
                  ),
                }
              : t
          ),
        }));
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buf += dec.decode(chunk, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const j = JSON.parse(data);
            // Server control frames: source chips + post-charge usage.
            const o = j?.orleia;
            if (o && typeof o === "object") {
              if (Array.isArray(o.sources)) replySources = o.sources;
              if (o.usage && typeof o.usage.used === "number") {
                setUsage({ used: o.usage.used, limit: o.usage.limit ?? null });
              }
              continue;
            }
            const delta = j?.choices?.[0]?.delta;
            const rc = delta?.reasoning_content;
            let changed = false;
            if (typeof rc === "string" && rc) {
              think += rc;
              changed = true;
            }
            if (typeof delta?.content === "string" && delta.content) {
              full += delta.content;
              changed = true;
            }
            if (changed) publish();
          } catch {
            /* partial frame — the next chunk completes it */
          }
        }
      }
      if (!full.trim()) {
        dropReplyIfEmpty(threadId, replyId);
        setErr(t("coder.err"));
      }
    } catch (e) {
      const aborted = (e as Error)?.name === "AbortError";
      // Keep whatever partial content streamed; only an empty pane is dropped.
      dropReplyIfEmpty(threadId, replyId);
      if (!aborted) setErr(t("coder.err"));
    } finally {
      setBusy(false);
      abortRef.current = null;
      // Multi-task: drain the queue — the next queued prompt fires once
      // this reply has settled.
      const next = queueRef.current.shift();
      setQueueLen(queueRef.current.length);
      if (next !== undefined) window.setTimeout(() => void dispatch(next), 60);
    }
  }

  /** Expand a leading /skill like Noor does, then run against the ACTIVE thread. */
  async function dispatch(raw: string) {
    const pool = threadsRef.current;
    const thread = pool.find((x) => x.id === activeIdRef.current) ?? pool[0];
    if (!thread) return;
    let value = raw.trim();
    if (!value) return;
    const parsed = skillForCommand(value);
    if (parsed) {
      value = parsed.rest
        ? `${parsed.skill.instructions}\n\n---\n${parsed.rest}`
        : parsed.skill.instructions;
    }
    const userMsg: CMsg = { id: generateId(), role: "user", content: value };
    await runSend(thread.id, [...thread.messages, userMsg]);
  }

  /** Composer send — while busy the prompt joins the queue (type ahead). */
  function send(text?: string) {
    const value = (text ?? input).trim();
    if (!value) return;
    if (busy) {
      queueRef.current.push(value);
      setQueueLen(queueRef.current.length);
      setInput("");
      setSlashOpen(false);
      if (taRef.current) taRef.current.style.height = "auto";
      return;
    }
    void dispatch(value);
  }

  /** Stop = stop everything: abort the stream AND drop the queue. */
  function stopAll() {
    abortRef.current?.abort();
    queueRef.current = [];
    setQueueLen(0);
  }

  /** Rewind-lite: drop the last reply and regenerate it (Claude Code /rewind). */
  function retry() {
    if (busy || !activeThread) return;
    const ms = activeThread.messages;
    let li = -1;
    for (let i = ms.length - 1; i >= 0; i--) {
      if (ms[i].role === "user") { li = i; break; }
    }
    if (li === -1) return;
    void runSend(activeThread.id, [...ms.slice(0, li), ms[li]]);
  }

  function applyAction(key: string) {
    const tpl = TEMPLATES[key];
    if (!tpl) return;
    setInput((cur) => (cur.trim() ? `${tpl.prompt}\n${cur}` : tpl.prompt));
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (el) {
        el.focus();
        const end = el.value.length;
        el.setSelectionRange(end, end);
      }
    });
  }

  function insertSkill(name: string) {
    setInput(`/${skillSlug(name)} `);
    setSlashIdx(0);
    requestAnimationFrame(() => taRef.current?.focus());
  }

  function newChat() {
    setState((s) => {
      const cur = s.threads.find((t) => t.id === s.activeId);
      // Reuse an empty active thread instead of stacking blanks.
      if (cur && cur.messages.length === 0) return s;
      const id = generateId();
      return {
        threads: [...s.threads, makeThread([], id, cur?.messages.length ? cur.id : undefined)],
        activeId: id,
      };
    });
    setErr(null);
    setCapHit(false);
  }

  function branchFrom(idx: number) {
    if (idx < 0 || idx >= messages.length) return;
    const id = generateId();
    const slice = messages.slice(0, idx + 1);
    setState((s) => ({
      threads: [...s.threads, makeThread(slice, id, s.activeId)],
      activeId: id,
    }));
    setThreadsOpen(false);
  }

  function deleteThread(id: string) {
    setState((s) => {
      if (s.threads.length <= 1) return s;
      const threads = s.threads.filter((t) => t.id !== id);
      return { threads, activeId: s.activeId === id ? threads[0].id : s.activeId };
    });
  }

  function copyConversation() {
    const md = messages
      .map((m) => (m.role === "user" ? `**›** ${m.content}` : `**Noor Coder**\n\n${m.content}`))
      .join("\n\n");
    void navigator.clipboard?.writeText(md);
  }

  // ---- Workspace actions: real writes through the connected folder ----
  const pushLog = (op: string, target: string, ok: boolean) =>
    setLog((l) =>
      [{ id: generateId(), t: new Date().toLocaleTimeString(), op, target, ok }, ...l].slice(0, 100)
    );

  async function connectFolder(): Promise<typeof wsRef.current> {
    const handle = await pickWorkspace();
    if (handle) {
      wsRef.current = handle;
      setWsName(handle.name);
    }
    return wsRef.current;
  }

  async function applyOne(msgId: string, key: string, act: CoderAction): Promise<void> {
    if (act.op === "shell") {
      await navigator.clipboard?.writeText(act.command);
      setActionState((s) => ({ ...s, [key]: "ok" }));
      pushLog("shell", act.command, true);
      return;
    }
    let root = wsRef.current;
    if (!root) root = await connectFolder();
    if (!root || !(await ensurePermission(root))) {
      setErr(t("coder.needFolder"));
      setActionState((s) => ({ ...s, [key]: "err" }));
      pushLog(act.op, act.path, false);
      return;
    }
    try {
      if (act.op === "write_file") {
        await writeWorkspaceFile(root, act.path, act.content ?? "");
        pushLog("write", `${act.path} (${(act.content ?? "").length} B)`, true);
      } else {
        await makeWorkspaceDir(root, act.path);
        pushLog("mkdir", act.path, true);
      }
      setActionState((s) => ({ ...s, [key]: "ok" }));
    } catch (e) {
      setActionState((s) => ({ ...s, [key]: "err" }));
      pushLog(act.op, `${act.path}: ${(e as Error)?.message || "failed"}`, false);
    }
  }

  async function applyCard(msgId: string, idx: number, a: CoderAction, all?: CoderAction[]) {
    if (all) {
      for (let i = 0; i < all.length; i++) await applyOne(msgId, `${msgId}:${i}`, all[i]);
      setTermOpen(true);
      return;
    }
    await applyOne(msgId, `${msgId}:${idx}`, a);
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (slashMatches.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashIdx((i) => (i + 1) % slashMatches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashIdx((i) => (i - 1 + slashMatches.length) % slashMatches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertSkill((slashMatches[slashIdx] ?? slashMatches[0]).name);
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); setSlashOpen(false); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); return; }
    if (e.key === "Escape" && busy) { e.preventDefault(); stopAll(); }
  }

  // ---- Locked (free tier / lapsed license): honest upgrade gate ----
  if (locked) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{t("coder.lockedBody")}</p>
        <div className="flex gap-2">
          <button
            onClick={() => router.push("/pricing")}
            className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
          >
            {t("coder.viewPlans")}
          </button>
          <button
            onClick={onExit}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-secondary"
          >
            {t("coder.notNow")}
          </button>
        </div>
      </div>
    );
  }

  const pct =
    usage && usage.limit !== null && usage.limit > 0
      ? Math.min(100, Math.round((usage.used / usage.limit) * 100))
      : null;
  const isLast = (m: CMsg) => messages.length > 0 && messages[messages.length - 1].id === m.id;
  const canRetry = !busy && messages.some((m) => m.role === "user");
  const threadDepth = (t: Thread) => {
    let d = 0;
    let cur = t;
    const byId = new Map(threads.map((x) => [x.id, x]));
    while (cur.parent && d < 3) {
      const p = byId.get(cur.parent);
      if (!p) break;
      d++;
      cur = p;
    }
    return d;
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      {/* Top strip: beta tag + token % chip + threads/folder/terminal + copy/new chat */}
      <div className="relative flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-2 md:px-6">
        <div className="flex items-center gap-2.5">
          <span className="rounded-full bg-primary-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary-500">
            {t("coder.title")} · {t("coder.beta")}
          </span>
          {usage && (
            <span
              className={cn(
                "text-[11px]",
                capHit || (pct !== null && pct >= 80)
                  ? "font-semibold text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground"
              )}
            >
              {usage.limit === null || pct === null
                ? t("coder.unlimited")
                : t("coder.tokensUsed").replace("{p}", String(pct))}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Thread switcher (branch tree) */}
          <button
            onClick={() => setThreadsOpen((v) => !v)}
            title={t("coder.threads")}
            aria-label={t("coder.threads")}
            className={cn(
              "rounded-lg p-1.5 transition-colors",
              threadsOpen ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <GitBranch className="h-4 w-4" />
          </button>
          {/* Workspace folder */}
          <button
            onClick={() => void connectFolder()}
            title={wsName ? t("coder.folderOn").replace("{n}", wsName) : t("coder.folder")}
            aria-label={t("coder.folder")}
            className={cn(
              "flex max-w-[140px] items-center gap-1 rounded-lg p-1.5 transition-colors",
              wsName
                ? "text-primary-500 hover:bg-secondary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <FolderOpen className="h-4 w-4 shrink-0" />
            {wsName && <span className="truncate text-[11px] font-medium">{wsName}</span>}
          </button>
          {/* Terminal log */}
          <button
            onClick={() => setTermOpen((v) => !v)}
            title={t("coder.terminal")}
            aria-label={t("coder.terminal")}
            className={cn(
              "relative rounded-lg p-1.5 transition-colors",
              termOpen ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <Terminal className="h-4 w-4" />
            {log.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary-500" />
            )}
          </button>
          {canRetry && (
            <button
              onClick={retry}
              title={t("coder.retry")}
              aria-label={t("coder.retry")}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={copyConversation}
              title={t("coder.copyChat")}
              aria-label={t("coder.copyChat")}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Share2 className="h-4 w-4" />
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={newChat}
              className="flex items-center gap-1 rounded-full border border-border/70 bg-secondary/60 px-3 py-1 text-xs font-medium text-muted-foreground transition-all hover:border-primary-500/40 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("coder.newChat")}
            </button>
          )}
        </div>

        {/* Thread menu — every conversation + branch, Git-branch style */}
        {threadsOpen && (
          <div className="absolute right-4 top-11 z-50 max-h-80 w-80 overflow-y-auto rounded-2xl border border-border bg-background p-1.5 shadow-2xl">
            <p className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/40">
              {t("coder.threads")}
            </p>
            {threads.map((th) => (
              <div
                key={th.id}
                style={{ paddingLeft: threadDepth(th) * 14 }}
                className={cn(
                  "group flex items-center gap-1.5 rounded-xl px-2 py-1.5 transition-colors",
                  th.id === activeId ? "bg-secondary" : "hover:bg-secondary/60"
                )}
              >
                <button
                  onClick={() => {
                    setState((s) => ({ ...s, activeId: th.id }));
                    setThreadsOpen(false);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-xs font-medium text-foreground">
                    {th.title || t("coder.newChat")}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {th.messages.length} · {th.id === activeId ? t("coder.activeThread") : t("coder.switchThread")}
                  </p>
                </button>
                {threads.length > 1 && (
                  <button
                    onClick={() => deleteThread(th.id)}
                    title={t("coder.deleteThread")}
                    className="rounded-md p-1 text-muted-foreground/50 opacity-0 transition-all hover:text-red-500 group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transcript — Noor grammar: prompts right, answers left, plain */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 md:px-6">
        <div className="mx-auto w-full max-w-3xl py-6 space-y-5">
          {messages.length === 0 && (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
              {/* Noor mark (10%) → casual greeting with the user's name. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/noor-mark-white.png"
                alt=""
                aria-hidden
                className="h-36 w-36 object-contain opacity-10 invert dark:invert-0 sm:h-44 sm:w-44"
              />
              <p className="max-w-md text-lg font-medium tracking-tight text-foreground sm:text-xl">
                {t("coder.welcome")
                  .replace("{greet}", coderGreet)
                  .replace("{name}", coderWho)}
              </p>
            </div>
          )}
          {messages.map((m, mi) => {
            const { rest: mdBody, actions } =
              m.role === "assistant" && m.content ? extractActions(m.content) : { rest: m.content, actions: [] as CoderAction[] };
            return m.role === "user" ? (
              <div key={m.id} className="group flex items-center justify-end gap-1.5">
                <button
                  onClick={() => branchFrom(mi)}
                  title={t("coder.branch")}
                  aria-label={t("coder.branch")}
                  className="rounded-lg p-1.5 text-muted-foreground/50 opacity-0 transition-all hover:bg-secondary hover:text-foreground group-hover:opacity-100"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                </button>
                <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[28px] rounded-br-lg border border-primary-500/20 bg-primary-500/15 px-5 py-3 text-[15px] leading-relaxed">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.id} className="group flex justify-start">
                <div className="max-w-[92%] py-1">
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-foreground/50">{t("coder.title")}</span>
                    <span className="text-[10px] text-muted-foreground/40">· {modelLabel}</span>
                    <button
                      onClick={() => void navigator.clipboard?.writeText(m.content)}
                      title="Copy"
                      className="text-muted-foreground/40 opacity-0 transition-all hover:text-foreground group-hover:opacity-100"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => branchFrom(mi)}
                      title={t("coder.branch")}
                      aria-label={t("coder.branch")}
                      className="text-muted-foreground/40 opacity-0 transition-all hover:text-foreground group-hover:opacity-100"
                    >
                      <GitBranch className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {m.thinking && <ThinkingBlock text={m.thinking} active={busy && isLast(m)} />}
                  <div className="text-[15px] leading-relaxed text-foreground/90">
                    {m.content ? (
                      <>
                        <Markdown content={mdBody} codeCopy />
                        {actions.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {actions.map((a, ai) => {
                              const key = `${m.id}:${ai}`;
                              const st = actionState[key];
                              const isAll = actions.length > 1 && ai === 0;
                              return (
                                <div
                                  key={key}
                                  className="flex items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2"
                                >
                                  {a.op === "write_file" ? (
                                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
                                  ) : a.op === "mkdir" ? (
                                    <FolderPlus className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
                                  ) : (
                                    <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-medium">
                                      {a.op === "shell" ? a.command : a.path}
                                    </p>
                                    {a.op === "write_file" && (
                                      <pre className="mt-1 max-h-20 overflow-hidden whitespace-pre-wrap break-all text-[10px] leading-snug text-muted-foreground/70">
                                        {(a.content ?? "").split("\n").slice(0, 4).join("\n")}
                                      </pre>
                                    )}
                                    {a.op === "shell" && (
                                      <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                                        {t("coder.shellNote")}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    {isAll && (
                                      <button
                                        onClick={() => void applyCard(m.id, ai, a, actions)}
                                        className="rounded-lg border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                                      >
                                        {t("coder.applyAll")}
                                      </button>
                                    )}
                                    <button
                                      onClick={() => void applyCard(m.id, ai, a)}
                                      className={cn(
                                        "flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition-all",
                                        st === "ok"
                                          ? "bg-primary-500/10 text-primary-500"
                                          : st === "err"
                                            ? "bg-red-500/10 text-red-500"
                                            : "btn-primary"
                                      )}
                                    >
                                      {st === "ok" && <Check className="h-3 w-3" />}
                                      {a.op === "shell"
                                        ? t("coder.copyCmd")
                                        : st === "ok"
                                          ? t("coder.applied")
                                          : st === "err"
                                            ? t("coder.applyFail")
                                            : a.op === "mkdir"
                                              ? t("coder.createFolder")
                                              : t("coder.apply")}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {m.sources && m.sources.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {m.sources.map((s, i) => (
                              <a
                                key={i}
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={s.url}
                                className="inline-flex max-w-[210px] items-center gap-1 rounded-full border border-border/60 bg-secondary/50 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                              >
                                <Globe className="h-3 w-3 shrink-0" />
                                <span className="truncate">{s.title}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Terminal log — every workspace action, Claude-Code-exec style */}
      {termOpen && (
        <div className="mx-4 mt-2 max-h-40 overflow-y-auto rounded-2xl border border-border bg-card md:mx-6">
          <div className="sticky top-0 flex items-center justify-between border-b border-border/60 bg-card px-3 py-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <Terminal className="h-3.5 w-3.5" />
              {t("coder.terminal")}
            </span>
            <button onClick={() => setTermOpen(false)} className="rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {log.length === 0 ? (
            <p className="px-3 py-2.5 text-[11px] text-muted-foreground/70">{t("coder.termEmpty")}</p>
          ) : (
            <ul className="px-3 py-2 space-y-1">
              {log.map((e) => (
                <li key={e.id} className="flex items-start gap-2 font-mono text-[11px] leading-relaxed">
                  <span className="shrink-0 text-muted-foreground/50">{e.t}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1 text-[10px] font-semibold",
                      e.ok ? "bg-primary-500/10 text-primary-500" : "bg-red-500/10 text-red-500"
                    )}
                  >
                    {e.op}
                  </span>
                  <span className={cn("min-w-0 break-all", e.ok ? "text-muted-foreground" : "text-red-500")}>
                    {e.target}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Cap / error banners — Noor's usage-warning style */}
      {capHit && (
        <div className="flex justify-center px-4 pt-2 md:px-6">
          <p className="rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-center text-xs text-amber-600 dark:text-amber-400">
            {t("coder.capBody")}
          </p>
        </div>
      )}
      {err && (
        <div className="flex justify-center px-4 pt-2 md:px-6">
          <p className="rounded-full border border-red-500/40 bg-red-500/10 px-4 py-1.5 text-center text-xs text-red-600 dark:text-red-400">
            {err}
          </p>
        </div>
      )}

      {/* Composer — Noor's pill */}
      <div className="shrink-0 px-4 pb-3 pt-2 md:px-6">
        <div className="mx-auto w-full max-w-3xl">
          {/* Quick actions — centered on top of the pill; Web = live research toggle */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 pb-2.5">
            {Object.entries(TEMPLATES).map(([k, { icon: Icon }]) => (
              <button
                key={k}
                onClick={() => applyAction(k)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-secondary/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-primary-500/40 hover:text-foreground disabled:opacity-40"
              >
                <Icon className="h-3.5 w-3.5 text-primary-500" />
                {t(`coder.${k}`)}
              </button>
            ))}
            <button
              onClick={() => setWeb((v) => !v)}
              title={t("coder.web")}
              aria-pressed={web}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                web
                  ? "border-primary-500/50 bg-primary-500/15 text-primary-500"
                  : "border-border/70 bg-secondary/60 text-muted-foreground hover:border-primary-500/40 hover:text-foreground"
              )}
            >
              <Globe className="h-3.5 w-3.5" />
              {t("coder.webShort")}
            </button>
            {queueLen > 0 && (
              <button
                onClick={() => {
                  queueRef.current = [];
                  setQueueLen(0);
                }}
                title={t("coder.clearQueue")}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"
              >
                {t("coder.queued").replace("{n}", String(queueLen))}
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {/* Slash commands: type "/" for skills (Claude Code-style) */}
          {slashMatches.length > 0 && (
            <div className="relative bottom-1 z-50 mb-1 w-full rounded-2xl border border-border bg-background p-1.5 shadow-2xl">
              <p className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/40">
                {t("skills.title")}
              </p>
              {slashMatches.map((s, i) => (
                <button
                  key={s.id}
                  onMouseDown={(e) => { e.preventDefault(); insertSkill(s.name); }}
                  onMouseEnter={() => setSlashIdx(i)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                    i === slashIdx ? "bg-secondary" : ""
                  )}
                >
                  <Sparkles className="h-4 w-4 shrink-0 text-primary-500" />
                  <span className="truncate font-medium">/{skillSlug(s.name)}</span>
                  <span className="flex-1 truncate text-muted-foreground">{s.name}</span>
                </button>
              ))}
            </div>
          )}
          <div
            className={cn(
              "flex items-end gap-2 bg-secondary/40 pl-4 pr-2 py-2",
              input.split("\n").length > 1 ? "rounded-[22px]" : "rounded-full"
            )}
          >
            <textarea
              ref={taRef}
              rows={1}
              value={input}
              onChange={(e) => {
                const v = e.target.value;
                setInput(v);
                setSlashOpen(v.startsWith("/") && !v.slice(1).includes(" "));
                setSlashIdx(0);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
              }}
              onKeyDown={onComposerKey}
              placeholder={busy ? t("coder.composerQueuePh") : t("coder.composerPh")}
              className="max-h-40 flex-1 resize-none bg-transparent py-2 text-[15px] leading-relaxed outline-none focus-visible:ring-0"
            />
            {(busy || !!input.trim()) && (
              <button
                onClick={() => {
                  if (busy) stopAll();
                  else send();
                }}
                aria-label={busy ? "Stop" : "Send"}
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-200 active:scale-95",
                  busy
                    ? "border border-red-500 bg-red-500/10 text-red-500"
                    : "btn-primary"
                )}
              >
                {busy ? <Square className="h-4 w-4 fill-current" /> : <Send className="h-5 w-5" />}
              </button>
            )}
          </div>
          <p className="mt-2 hidden text-center text-[10px] text-muted-foreground/40 sm:block">
            {t("coder.sendHint")}
          </p>
        </div>
      </div>
    </div>
  );
}
