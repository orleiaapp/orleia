"use client";

// ============================================================
// Noor Coder (beta) — the coding surface behind the header switch.
// Deep editor-dark canvas, monospace chrome, terminal-style transcript,
// separate history (`orleia.coderChat.v1`), server-truth billing chip.
// The foggy crossfade with Noor lives in the Noor page (this component
// is mounted as the incoming surface). Desktop (lg+) only — the page
// guards entry with matchMedia; CSS hides the switch below lg.
//
// The client gate is decoration: /api/coder enforces the tier (403) and
// the coder daily cap (402) server-side, and this surface renders both.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Lock, Plus, Send, Square, Terminal, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Markdown } from "@/components/chat/Markdown";
import { getDeviceId } from "@/lib/device-id";
import { cn, generateId } from "@/lib/utils";

type CMsg = { id: string; role: "user" | "assistant"; content: string };

const STORE_KEY = "orleia.coderChat.v1";

// Quick-action prompt templates. These are prompt engineering, not UI copy
// (the model answers in the interface language via /api/coder's rule), so
// they stay out of the i18n tables; only the chip labels are translated.
const TEMPLATES: Record<string, string> = {
  explain: "Explain this code step by step:\n\n",
  debug: "Find the bug in this code and explain the fix:\n\n",
  test: "Write tests for this code:\n\n",
  refactor: "Refactor this code for clarity without changing behavior:\n\n",
};

function loadTranscript(): CMsg[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const msgs: unknown[] = Array.isArray(parsed?.messages) ? parsed.messages : [];
    return msgs
      .filter((m): m is CMsg => {
        const x = m as CMsg | null;
        return Boolean(
          x &&
            typeof x.id === "string" &&
            (x.role === "user" || x.role === "assistant") &&
            typeof x.content === "string"
        );
      })
      .slice(-80);
  } catch {
    return [];
  }
}

export function CoderSurface({
  onExit,
  onTierLocked,
}: {
  onExit: () => void;
  onTierLocked: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [messages, setMessages] = useState<CMsg[]>(() =>
    typeof window === "undefined" ? [] : loadTranscript()
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [capHit, setCapHit] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ used: number; limit: number | null } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Keep the parent callback in a ref so the mount effect never re-runs.
  const tierLockedCb = useRef(onTierLocked);
  tierLockedCb.current = onTierLocked;

  // Server-truth on mount: today's coder usage + lock state (covers a
  // license that lapsed while the surface was mounted).
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
        // too), and cap chips must not seed from outage-era numbers.
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
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Persist after each settled exchange (not per streamed token).
  useEffect(() => {
    if (busy) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, messages: messages.slice(-80) }));
    } catch {
      /* quota — transcript is a convenience, not data of record */
    }
  }, [messages, busy]);

  // Auto-scroll the transcript, only its own container.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const dropReplyIfEmpty = (replyId: string) =>
    setMessages((ms) => ms.filter((m) => !(m.id === replyId && !m.content)));

  async function send(text?: string) {
    const value = (text ?? input).trim();
    if (!value || busy) return;
    setErr(null);
    setCapHit(false);
    const userMsg: CMsg = { id: generateId(), role: "user", content: value };
    const history = [...messages, userMsg];
    const replyId = generateId();
    setMessages([...history, { id: replyId, role: "assistant", content: "" }]);
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/coder", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-orleia-device": getDeviceId() },
        body: JSON.stringify({
          messages: history.slice(-59).map(({ role, content }) => ({ role, content })),
          stream: true,
          lang: document.documentElement.lang || "en",
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
        // License gone/lapsed — flip the switch lock too.
        setLocked(true);
        tierLockedCb.current();
        dropReplyIfEmpty(replyId);
        return;
      }
      if (res.status === 402) {
        setCapHit(true);
        dropReplyIfEmpty(replyId);
        return;
      }
      if (!res.ok || !res.body) throw new Error(`http ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let full = "";
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
            const delta = j?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) {
              full += delta;
              const seen = full;
              setMessages((ms) => ms.map((m) => (m.id === replyId ? { ...m, content: seen } : m)));
            }
          } catch {
            /* partial frame — the next chunk completes it */
          }
        }
      }
      if (!full.trim()) {
        dropReplyIfEmpty(replyId);
        setErr(t("coder.err"));
      }
    } catch (e) {
      const aborted = (e as Error)?.name === "AbortError";
      // Keep whatever partial content streamed; only an empty pane is dropped.
      dropReplyIfEmpty(replyId);
      if (!aborted) setErr(t("coder.err"));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function applyAction(key: string) {
    const tpl = TEMPLATES[key];
    if (!tpl) return;
    setInput((cur) => (cur.trim() ? `${tpl}\n${cur}` : tpl));
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (el) {
        el.focus();
        const end = el.value.length;
        el.setSelectionRange(end, end);
      }
    });
  }

  function newChat() {
    abortRef.current?.abort();
    setMessages([]);
    setErr(null);
    setCapHit(false);
  }

  // ---- Locked (free tier / lapsed license): honest upgrade gate ----
  if (locked) {
    return (
      <div
        className="dark flex h-full min-h-0 flex-col items-center justify-center gap-4 bg-zinc-950 p-8 text-center font-mono"
        style={{ colorScheme: "dark" }}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10">
          <Lock className="h-6 w-6 text-amber-400" />
        </div>
        <p className="max-w-md text-[13px] leading-relaxed text-zinc-400">{t("coder.lockedBody")}</p>
        <div className="flex gap-2">
          <button
            onClick={() => router.push("/pricing")}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
          >
            {t("coder.viewPlans")}
          </button>
          <button
            onClick={onExit}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:bg-zinc-900"
          >
            {t("coder.notNow")}
          </button>
        </div>
      </div>
    );
  }

  const left = usage && usage.limit !== null ? Math.max(0, usage.limit - usage.used) : null;

  return (
    <div
      className="dark flex h-full min-h-0 flex-col bg-zinc-950 font-mono text-zinc-100"
      style={{ colorScheme: "dark" }}
    >
      {/* Top strip: beta tag + server-truth usage chip + new chat */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800/80 px-4 py-2 md:px-6">
        <div className="flex items-center gap-2.5">
          <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-400">
            Coder {t("coder.beta")}
          </span>
          {usage && (
            <span
              className={cn(
                "text-[11px]",
                capHit ? "text-amber-400" : usage.limit === null ? "text-emerald-400/80" : "text-zinc-500"
              )}
            >
              {usage.limit === null
                ? t("coder.unlimited")
                : t("coder.left").replace("{n}", String(left ?? 0))}
            </span>
          )}
        </div>
        {messages.length > 0 && (
          <button
            onClick={newChat}
            className="flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("coder.newChat")}
          </button>
        )}
      </div>

      {/* Transcript — terminal-style: › prompts, answers in panes */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {messages.length === 0 && (
            <div className="flex min-h-full flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
                <Terminal className="h-6 w-6 text-emerald-400" />
              </div>
              <p className="max-w-sm text-[13px] leading-relaxed text-zinc-500">{t("coder.empty")}</p>
            </div>
          )}
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex gap-2.5">
                <span className="select-none pt-0.5 text-emerald-400">›</span>
                <div className="min-w-0 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-zinc-300">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.id} className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/70">
                <div className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Noor Coder
                  </span>
                  {m.content && (
                    <button
                      onClick={() => void navigator.clipboard?.writeText(m.content)}
                      title="Copy"
                      className="text-zinc-500 transition-colors hover:text-zinc-200"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="px-3.5 py-3 text-[13px] leading-relaxed text-zinc-200">
                  {m.content ? (
                    <Markdown content={m.content} />
                  ) : (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-zinc-800/60 px-4 pt-2 md:px-6">
        {Object.keys(TEMPLATES).map((k) => (
          <button
            key={k}
            onClick={() => applyAction(k)}
            disabled={busy}
            className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] text-zinc-400 transition-colors hover:border-emerald-500/40 hover:text-emerald-300 disabled:opacity-40"
          >
            {t(`coder.${k}`)}
          </button>
        ))}
      </div>

      {/* Cap / error banners */}
      {capHit && (
        <p className="px-4 pt-2 text-[11px] text-amber-400 md:px-6">{t("coder.capBody")}</p>
      )}
      {err && <p className="px-4 pt-2 text-[11px] text-red-400 md:px-6">{err}</p>}

      {/* Composer — square editor input */}
      <div className="shrink-0 px-4 py-3 md:px-6">
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 transition-colors focus-within:border-emerald-500/60">
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 176) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={t("coder.composerPh")}
            className="max-h-44 min-w-0 flex-1 resize-none bg-transparent py-1 text-[13px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <button
            onClick={() => {
              if (busy) abortRef.current?.abort();
              else void send();
            }}
            disabled={!busy && !input.trim()}
            aria-label={busy ? "Stop" : "Send"}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
              busy
                ? "bg-red-500/15 text-red-400 hover:bg-red-500/25"
                : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600"
            )}
          >
            {busy ? <Square className="h-3.5 w-3.5" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-zinc-600">{t("coder.sendHint")}</p>
      </div>
    </div>
  );
}
