"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, CornerDownLeft, Square, Hammer, ClipboardList, Sparkles, FolderOpen, Menu } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Markdown } from "@/components/chat/Markdown";
import { parseQuestions } from "@/lib/ximagine-ai";
import { X_THEMES, type XChat, type XMode, type XThemeId } from "@/lib/ximagine";

const SUGGESTIONS = [
  "A film tracker for my 2026 watchlist",
  "A packing list builder for weekend trips",
  "A unit converter that remembers history",
];

function ThinkingBlock({ text, active }: { text: string; active: boolean }) {
  const [open, setOpen] = useState(false);
  const isOpen = open || active;
  if (!text && !active) return null;
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 transition-colors hover:bg-white/[0.06]"
      >
        {active ? (
          <>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Thinking
          </>
        ) : (
          <>
            Thought process
            <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </>
        )}
      </button>
      <AnimatePresence initial={false}>
        {isOpen && text && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <p className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] leading-relaxed text-muted-foreground/60">
              {text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ThemePicker({ value, onChange }: { value: XThemeId; onChange: (t: XThemeId) => void }) {
  const [open, setOpen] = useState(false);
  const theme = X_THEMES.find((t) => t.id === value) || X_THEMES[0];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-muted-foreground/70 transition-colors hover:bg-white/[0.07]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className="h-3 w-3 rounded-[4px] border border-white/10"
          style={{ background: theme.swatch }}
          aria-hidden
        />
        {theme.name}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
            <motion.ul
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              role="listbox"
              className="absolute bottom-full left-0 z-20 mb-2 w-40 rounded-2xl border border-white/10 bg-[#0c0c10] p-1.5 shadow-xl"
            >
              {X_THEMES.map((t) => (
                <li key={t.id}>
                  <button
                    role="option"
                    aria-selected={t.id === value}
                    onClick={() => {
                      onChange(t.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-white/[0.07] ${
                      t.id === value ? "bg-white/[0.06]" : ""
                    }`}
                  >
                    <span
                      className="h-3 w-3 rounded-[4px] border border-white/10"
                      style={{ background: t.swatch }}
                      aria-hidden
                    />
                    {t.name}
                  </button>
                </li>
              ))}
            </motion.ul>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export function XimagineChat({
  chat,
  busy,
  defaultTheme,
  creditCap,
  onSend,
  onStop,
  onModeChange,
  onThemeChange,
  onOpenApp,
  onMenu,
}: {
  chat: XChat | null;
  busy: boolean;
  defaultTheme: XThemeId;
  creditCap: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onModeChange: (m: XMode) => void;
  onThemeChange: (t: XThemeId) => void;
  onOpenApp: (appId: string) => void;
  onMenu?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const mode: XMode = chat?.mode ?? "plan";
  const messages = chat?.messages ?? [];
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const isLastAssistant = (id: string) => !busy && lastAssistant?.id === id;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: busy ? "auto" : "smooth", block: "end" });
  }, [messages.length, busy, lastAssistant?.content.length, lastAssistant?.thinking?.length]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [draft]);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy || creditCap) return;
    setDraft("");
    onSend(text);
  };

  const questions = !busy && mode === "plan" && lastAssistant ? parseQuestions(lastAssistant.content) : [];
  const planReady = !busy && mode === "plan" && lastAssistant && questions.length === 0 && messages.length > 0;

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-[#050508]">
      {/* header */}
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {onMenu && (
            <button
              onClick={onMenu}
              aria-label="Open menu"
              className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] p-1.5 text-muted-foreground/70 lg:hidden"
            >
              <Menu className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{chat?.title || "New app"}</p>
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/35">
              {mode === "plan" ? "Plan mode" : "Build mode"} · local only
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemePicker value={defaultTheme} onChange={onThemeChange} />
          <div className="flex rounded-full border border-white/10 bg-white/[0.03] p-0.5" role="tablist" aria-label="Mode">
            {(
              [
                { id: "plan" as XMode, label: "Plan", icon: ClipboardList },
                { id: "build" as XMode, label: "Build", icon: Hammer },
              ]
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={mode === id}
                onClick={() => onModeChange(id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                  mode === id ? "bg-white text-black" : "text-muted-foreground/70 hover:text-foreground"
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="mx-auto max-w-2xl space-y-5">
          {messages.length === 0 && (
            <div className="pt-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                <Sparkles className="h-5 w-5 text-muted-foreground/60" />
              </div>
              <h2 className="mt-5 text-2xl font-bold tracking-tight">What should we build?</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground/60">
                One small app that does exactly your job. Noor will ask a couple of questions,
                then write it — and you get every line of the code.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => !busy && !creditCap && onSend(s)}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-[12px] text-muted-foreground/70 transition-colors hover:bg-white/[0.07]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-white/[0.10] px-4 py-2.5 text-[14px] leading-relaxed">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.id}>
                <div className="mb-1.5 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/noor-mark-white.png" alt="" className="h-4 w-4 opacity-80" />
                  <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/40">Noor</span>
                </div>
                <ThinkingBlock text={m.thinking || ""} active={busy && isLastAssistant(m.id) && !m.content} />
                {m.content && (
                  <div className="text-[14px] text-foreground/90">
                    <Markdown content={m.content} codeCopy />
                  </div>
                )}
                {busy && isLastAssistant(m.id) && m.content && (
                  <span className="ml-0.5 inline-block h-4 w-[7px] animate-pulse bg-foreground/70 align-middle" aria-hidden />
                )}
                {!busy && m.fileCount ? (
                  <button
                    onClick={() => chat?.appId && onOpenApp(chat.appId)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[12px] text-emerald-200 transition-colors hover:bg-emerald-400/15"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    {m.fileCount} {m.fileCount === 1 ? "file" : "files"} written — open the app
                  </button>
                ) : null}
                {isLastAssistant(m.id) && mode === "plan" && questions.length === 0 && (
                  <button
                    onClick={() => {
                      onModeChange("build");
                      onSend("Build it.");
                    }}
                    disabled={busy || creditCap}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-[12px] font-medium text-black transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
                  >
                    Approve &amp; build
                  </button>
                )}
              </div>
            )
          )}

          {questions.length > 0 && lastAssistant && (
            <div className="space-y-3">
              {questions.map((q, qi) => (
                <div key={qi} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <p className="text-[13px] font-medium">{q.q}</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {q.options.map((o, oi) => (
                      <button
                        key={oi}
                        onClick={() => !busy && !creditCap && onSend(o)}
                        disabled={busy || creditCap}
                        className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-left text-[12px] text-foreground/85 transition-colors hover:bg-white/[0.09] disabled:opacity-40"
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* composer */}
      <div className="border-t border-white/10 px-4 py-4 md:px-8">
        <div className="mx-auto max-w-2xl">
          {creditCap ? (
            <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-[13px] text-amber-200/90">
              Today&apos;s free credits are used up. They reset at 00:00 UTC — Ximagine is a free
              beta, and this keeps it that way for everyone.
            </div>
          ) : (
            <div className="flex items-end gap-2 rounded-2xl border border-white/15 bg-white/[0.04] px-3 py-2.5 transition-colors focus-within:border-white/30">
              <textarea
                ref={taRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={1}
                placeholder={mode === "plan" ? "Describe the app you want…" : "Describe it — or ask for a change to your app…"}
                className="max-h-[200px] flex-1 resize-none bg-transparent px-1 py-1 text-[14px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/35"
                aria-label="Message Noor"
              />
              {busy ? (
                <button
                  onClick={onStop}
                  aria-label="Stop generating"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/90 text-black transition-transform hover:scale-105 active:scale-95"
                >
                  <Square className="h-3 w-3 fill-current" />
                </button>
              ) : (
                <button
                  onClick={submit}
                  disabled={!draft.trim()}
                  aria-label="Send"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-black transition-all hover:opacity-90 active:scale-95 disabled:opacity-25"
                >
                  <CornerDownLeft className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          <p className="mt-2 text-center text-[10px] text-muted-foreground/35">
            {mode === "plan"
              ? "Plan mode: Noor asks questions, nothing is written yet · 1 credit per turn"
              : "Build mode: Noor writes the app's files · 1 credit per turn"}
          </p>
        </div>
      </div>
    </section>
  );
}
