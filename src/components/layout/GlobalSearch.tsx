"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, usePathname } from "next/navigation";
import {
  Search,
  FileText,
  ListTodo,
  BookOpen,
  CheckCircle2,
  Sparkles,
  CornerDownLeft,
} from "lucide-react";

import { storage } from "@/lib/storage";
import { globalSearch, SearchGroup, SearchResult } from "@/lib/global-search";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const KIND_ICON = {
  note: FileText,
  task: ListTodo,
  journal: BookOpen,
  habit: CheckCircle2,
} as const;

interface QuickAction {
  id: string;
  label: string;
  hint: string;
  icon: typeof Sparkles;
  run: () => void;
}

export function GlobalSearch({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [navActive, setNavActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();

  const data = useMemo(() => storage.getData(), [open]);
  const groups = useMemo(() => globalSearch(data, query, 5), [data, query]);

  // Flatten for keyboard navigation: quick actions first, then all results.
  const quickActions: QuickAction[] = useMemo(
    () => [
            {
        id: "daily-brief",
        label: t("search.dailyBrief"),
        hint: t("search.dailyBriefHint"),
        icon: Sparkles,
        run: () => {
          onClose();
          router.push("/noor");
        },
      },
    ],
    [t, router, onClose]
  );

  const flatItems = useMemo(() => {
    const items: { kind: "action" | "result"; ref: QuickAction | SearchResult }[] = [];
    if (!query.trim()) {
      for (const a of quickActions) items.push({ kind: "action", ref: a });
    }
    for (const g of groups) {
      for (const r of g.results) {
        items.push({ kind: "result", ref: r });
      }
    }
    return items;
  }, [query, quickActions, groups]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setNavActive(false);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setNavActive(true);
        setActiveIdx((i) => Math.min(i + 1, flatItems.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setNavActive(true);
        setActiveIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = flatItems[activeIdx];
        if (!item) return;
        if (item.kind === "action") {
          (item.ref as QuickAction).run();
          return;
        }
        // Documents is desktop-only: on phones, search results for notes and
        // the new-note action go to Notes instead of a broken overlay.
        if (
          window.matchMedia("(max-width: 767px)").matches &&
          (item.ref as SearchResult).kind === "note"
        ) {
          (item.ref as SearchResult).href = "/notes";
        }
        openResult(item.ref as SearchResult);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flatItems, activeIdx, router, onClose]);

  // Keep the active item visible while typing/arrowing.
  useEffect(() => {
    setActiveIdx(0);
    setNavActive(false);
  }, [query]);

  const openResult = (result: SearchResult) => {
    onClose();
    // Documents is retired: note results open Notes everywhere.
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches &&
      result.kind === "note"
    ) {
      result.href = "/notes";
    }
    if (result.kind === "note") {
      router.push("/notes?open=" + encodeURIComponent(result.id));
    } else {
      router.push(result.href);
    }
  };

  const handlePick = (idx: number) => {
    const item = flatItems[idx];
    if (!item) return;
    if (item.kind === "action") {
      (item.ref as QuickAction).run();
      return;
    }
    openResult(item.ref as SearchResult);
  };

  let flatCounter = -1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[120] flex items-start justify-center bg-black/50 backdrop-blur-sm px-4 pt-[12vh]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          role="dialog"
          aria-modal="true"
          aria-label={t("search.title")}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            {/* Input */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search.placeholder")}
                className="flex-1 bg-transparent text-[15px] outline-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
                aria-label={t("search.placeholder")}
              />
              <kbd className="hidden sm:inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[46vh] overflow-y-auto p-2">
              {flatItems.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <p className="text-sm text-muted-foreground">{t("search.noResults")}</p>
                  <p className="mt-1 text-xs text-muted-foreground/60">{t("search.noResultsHint")}</p>
                </div>
              )}

              {!query.trim() && quickActions.length > 0 && (
                <div className="mb-1">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {t("search.actions")}
                  </p>
                  {quickActions.map((a) => {
                    flatCounter++;
                    const idx = flatCounter;
                    return (
                      <button
                        key={a.id}
                        onMouseEnter={() => setActiveIdx(idx)}
                        onClick={() => handlePick(idx)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                          navActive && activeIdx === idx ? "bg-secondary" : "hover:bg-secondary/60"
                        )}
                      >
                        <a.icon className="h-4 w-4 shrink-0 text-primary-500" />
                        <span className="flex-1 font-medium">{a.label}</span>
                        <span className="text-xs text-muted-foreground/60">{a.hint}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {groups.map((g) => {
                const Icon = KIND_ICON[g.kind];
                return (
                  <div key={g.kind} className="mb-1">
                    <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {g.label}
                    </p>
                    {g.results.map((r) => {
                      flatCounter++;
                      const idx = flatCounter;
                      return (
                        <button
                          key={r.id}
                          onMouseEnter={() => setActiveIdx(idx)}
                          onClick={() => handlePick(idx)}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                            navActive && activeIdx === idx ? "bg-secondary" : "hover:bg-secondary/60"
                          )}
                        >
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{r.title}</span>
                            {r.snippet && (
                              <span className="block truncate text-xs text-muted-foreground/70">
                                {r.snippet}
                              </span>
                            )}
                          </span>
                          <CornerDownLeft className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/40" />
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Footer hint */}
            <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
              <span className="text-[11px] text-muted-foreground/60">{t("search.footer")}</span>
              <kbd className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                ⌘K
              </kbd>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
