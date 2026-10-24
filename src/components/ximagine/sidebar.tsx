"use client";

import { useState } from "react";
import { Plus, Trash2, Boxes, MessageSquare, Search } from "lucide-react";
import type { XApp, XChat } from "@/lib/ximagine";
import { themeById } from "@/lib/ximagine";

function fmtAgo(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

export function XimagineSidebar({
  chats,
  apps,
  activeChatId,
  creditsUsed,
  creditsLimit,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onOpenApp,
}: {
  chats: XChat[];
  apps: XApp[];
  activeChatId: string | null;
  creditsUsed: number;
  creditsLimit: number;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onOpenApp: (id: string) => void;
}) {
  const pct = Math.min(100, Math.round((creditsUsed / Math.max(1, creditsLimit)) * 100));
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visibleApps = q ? apps.filter((a) => a.name.toLowerCase().includes(q)) : apps;

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-white/10 bg-[#07070a]">
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em]">Ximagine</span>
        </div>
        <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground/35">by Orleia</p>
        <button
          onClick={onNewChat}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/[0.03] py-2 text-[13px] font-medium transition-colors hover:bg-white/[0.07] active:scale-[0.98]"
        >
          <Plus className="h-3.5 w-3.5" /> New app
        </button>
        {searchOpen ? (
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearchOpen(false);
                setQuery("");
              }
            }}
            onBlur={() => {
              if (!query.trim()) setSearchOpen(false);
            }}
            placeholder="Search apps…"
            aria-label="Search apps"
            className="mt-2 w-full rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/40"
          />
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] py-2 text-[13px] font-medium text-muted-foreground/70 transition-colors hover:bg-white/[0.06] active:scale-[0.98]"
          >
            <Search className="h-3.5 w-3.5" /> Search apps
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <p className="flex items-center gap-1.5 px-2 pb-1.5 pt-2 text-[9px] uppercase tracking-[0.25em] text-muted-foreground/35">
          <MessageSquare className="h-3 w-3" /> Chats
        </p>
        <div className="space-y-0.5">
          {chats.length === 0 && (
            <p className="px-2 py-1.5 text-[12px] text-muted-foreground/35">Nothing yet — describe an app.</p>
          )}
          {chats.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-1 rounded-xl px-2 py-1.5 transition-colors cursor-pointer ${
                c.id === activeChatId ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
              }`}
              onClick={() => onSelectChat(c.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onSelectChat(c.id)}
            >
              <span className="min-w-0 flex-1 truncate text-[13px]">{c.title}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground/30 group-hover:hidden">
                {fmtAgo(c.updatedAt)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteChat(c.id);
                }}
                aria-label={`Delete chat ${c.title}`}
                className="hidden shrink-0 rounded-md p-1 text-muted-foreground/50 hover:text-destructive group-hover:block"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        <p className="flex items-center gap-1.5 px-2 pb-1.5 pt-5 text-[9px] uppercase tracking-[0.25em] text-muted-foreground/35">
          <Boxes className="h-3 w-3" /> Your apps
        </p>
        <div className="space-y-0.5">
          {apps.length === 0 && (
            <p className="px-2 py-1.5 text-[12px] text-muted-foreground/35">Built apps live here.</p>
          )}
          {apps.length > 0 && visibleApps.length === 0 && (
            <p className="px-2 py-1.5 text-[12px] text-muted-foreground/35">No apps match “{query.trim()}”.</p>
          )}
          {visibleApps.map((a) => (
            <button
              key={a.id}
              onClick={() => onOpenApp(a.id)}
              className="group flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[4px] border border-white/10"
                style={{ background: themeById(a.theme).swatch }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-[13px]">{a.name}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground/30">{fmtAgo(a.updatedAt)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 px-4 py-4">
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/35">Credits</p>
          <p className="text-[12px] tabular-nums text-muted-foreground/70">
            {Math.max(0, creditsLimit - creditsUsed)} left
          </p>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-red-400/80" : "bg-white/70"}`}
            style={{ width: `${Math.max(2, 100 - pct)}%` }}
            aria-hidden
          />
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground/35">
          {Math.max(0, creditsLimit - creditsUsed)} of {creditsLimit} free turns left today · resets 00:00 UTC
        </p>
      </div>
    </aside>
  );
}
