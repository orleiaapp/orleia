"use client";

// ============================================================
// Sidebar — desktop rail only.
// Mobile navigation is a separate full-screen page: MobileNavScreen.
//
// The five primary destinations (dashboard, habits, mindfulness,
// tasks, noor) moved to the bottom row — see BottomNav. This rail
// keeps the secondary surfaces: recent Noor/agent chats, Deck,
// the reminder bell and settings. The old "Office" group is gone;
// for now it is replaced by the recent-chats list (more returns
// here later).
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, ChevronLeft, Presentation, MessageSquare, PawPrint } from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { storage } from "@/lib/storage";
import type { AIConversation } from "@/types";
import { ReminderBell } from "./ReminderCenter";

/** Most-recent-first slice for the rail. Pet-agent threads get the paw. */
function recentConversations(): AIConversation[] {
  try {
    return [...storage.getConversations()]
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .slice(0, 6);
  } catch {
    return [];
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [convos, setConvos] = useState<AIConversation[]>([]);
  const { t } = useI18n();

  // Publish the rail width for full-screen takeovers (the notes page
  // insets by it on md+ so THIS sidebar stays visible + clickable —
  // it's the only way out of those pages on desktop, which has no
  // floating top bar). Falls back to 260px in :root before mount.
  useEffect(() => {
    document.documentElement.style.setProperty("--orleia-sidebar-w", collapsed ? "72px" : "260px");
  }, [collapsed]);

  // Refresh the rail whenever the user moves around (cheap read), and on
  // storage writes while it's mounted (a chat renamed in Noor updates live).
  useEffect(() => {
    setConvos(recentConversations());
    return storage.subscribe(() => setConvos(recentConversations()));
  }, [pathname]);

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-50 hidden md:flex h-full flex-col border-r border-border bg-sidebar transition-[width] duration-300",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div className={cn("flex items-center gap-3 border-b border-border px-4 py-4", collapsed && "justify-center px-2")}>
        {collapsed ? (
          /* White "o." mark: inverted to a dark version in LIGHT mode so
              it doesn't vanish on the light sidebar; stays white in dark. */
          <img src="/orleia-logo-white.png" alt="Orleia" className="h-7 w-7 invert dark:invert-0" />
        ) : (
          <img src="/orleia-wordmark.png" alt="Orleia" className="h-7 w-auto dark:invert" />
        )}
      </div>

      {/* Recent Noor + agent chats */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-3 pt-6 pb-4">
          {convos.length > 0 && (
            <>
              <p className="px-1 pb-2 text-[11px] font-medium tracking-wide text-muted-foreground/40">
                {t("nav.recentChats")}
              </p>
              <ul className="space-y-0.5" role="list">
                {convos.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/noor?c=${c.id}`}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all duration-200",
                        "text-muted-foreground/60 hover:text-muted-foreground hover:bg-sidebar-hover"
                      )}
                    >
                      {c.petAgentId || c.petAgentGroup ? (
                        <PawPrint className="h-4 w-4 shrink-0" />
                      ) : (
                        <MessageSquare className="h-4 w-4 shrink-0" />
                      )}
                      <span className="flex-1 truncate">{c.title || t("nav.noor")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="my-4" />

          {/* Deck — its own surface, no longer buried in Office */}
          <Link
            href="/deck"
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
              pathname === "/deck"
                ? "bg-primary-500/10 text-primary-500"
                : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-sidebar-hover"
            )}
          >
            <Presentation className="h-5 w-5 shrink-0" />
            <span className="flex-1">{t("nav.deck")}</span>
          </Link>
        </div>
      )}
      {collapsed && <div className="flex-1" />}

      {/* Bottom */}
      <div className="border-t border-border p-3 space-y-1 overflow-hidden">
        <ReminderBell collapsed={collapsed} />
        <Link href="/settings" className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] transition-all duration-200", collapsed && "justify-center px-2", pathname === "/settings" ? "bg-primary-500/10 text-primary-500" : "text-muted-foreground/60 hover:text-foreground hover:bg-sidebar-hover")}><Settings className="h-3.5 w-3.5 shrink-0" />{!collapsed && <span>{t("nav.settings")}</span>}</Link>
        <button onClick={() => { const next = !collapsed; setCollapsed(next); window.dispatchEvent(new CustomEvent("orleia:sidebar-collapsed", { detail: next })); }} className="hidden md:flex w-full items-center justify-center rounded-xl px-3 py-1.5 text-muted-foreground/40 hover:text-foreground transition-colors duration-200" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}><ChevronLeft className={cn("h-3.5 w-3.5 transition-transform duration-200", collapsed && "rotate-180")} /></button>
      </div>
    </aside>
  );
}
