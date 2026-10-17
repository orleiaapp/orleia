"use client";

// ============================================================
// MobileNavScreen — the second screen.
// Full-screen navigation page OUTSIDE the app shell. Dragging left
// follows the finger 1:1 (release-to-complete, like iOS). Haptic
// ticks fire on open, on close, and on a successful flick-dismiss.
// The floating top bar slides away WITH the main card, leaving this
// sheet clean; the hamburger reappears on the card's right-edge
// sliver and closes this screen.
//
// Contents: New chat + Search actions, then the recent Noor/agent
// chats (always present, up to 7, renameable inline), pinned by the
// accent "Get premium" pill at the bottom. The five primary
// destinations live in BottomNav (mobile portrait), Deck is a subtab
// inside Noor, Settings lives in the top bar — none repeated here.
// ============================================================

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, PawPrint, Pencil, Plus, Search, Sparkles } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { storage } from "@/lib/storage";
import type { AIConversation } from "@/types";

const tick = (pattern: number | number[]) => {
  haptic.tick();
  void pattern; /* kept for signature compat */
};

/** The sheet keeps the 7 most recent threads — always rendered, even empty. */
function recentConversations(): AIConversation[] {
  try {
    return [...storage.getConversations()]
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .slice(0, 7);
  } catch {
    return [];
  }
}

export function MobileNavScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [convos, setConvos] = useState<AIConversation[]>([]);
  // Inline rename: the pencil on a row swaps that row for an input.
  const [editingId, setEditingId] = useState<string | null>(null);

  const close = () => {
    tick(6);
    onClose();
  };

  /* Close FIRST, then navigate — the card slides back over instantly
     while the new page loads underneath (no dead wait on the sheet). */
  const goTo = (href: string) => {
    // data-nav-open flips off immediately -> CSS hides the sheet content
    // instantly (see .orleia-nav-sheet rule) while the card slides back
    // over; the new page loads underneath.
    tick(6);
    onClose();
    if (href !== pathname) router.push(href);
  };

  /* New chat: if Noor is already open, the mount-time deep-link effect
     will never re-run, so fire the event for the live page too — and
     keep the URL clean either way. */
  const startChat = () => {
    tick(6);
    onClose();
    if (pathname.startsWith("/noor")) {
      window.dispatchEvent(new Event("orleia:new-chat"));
      router.replace("/noor", { scroll: false });
    } else {
      router.push("/noor?new=1");
    }
  };

  /* Search lives in the sheet now (the top-bar pill is gone). */
  const openSearch = () => {
    tick(6);
    onClose();
    window.dispatchEvent(new CustomEvent("orleia:open-search"));
  };

  const saveRename = (id: string, value: string) => {
    setEditingId(null);
    const title = value.trim().slice(0, 60);
    const current = storage.getConversations().find((c) => c.id === id);
    if (current && current.title !== title) storage.updateConversation(id, { title });
    setConvos(recentConversations());
  };

  /* Swipe LEFT anywhere on the sheet to fly it back under the app.
     (Swipe right to open lives in ClientLayout.) */
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const dx = e.changedTouches[0].clientX - touchRef.current.x;
    const dy = e.changedTouches[0].clientY - touchRef.current.y;
    touchRef.current = null;
    if (dx < -50 && Math.abs(dx) > Math.abs(dy) * 2) close();
  };

  /* While open: lock scroll, mark <html> (the shell hides itself), haptic. */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.setAttribute("data-nav-open", "");
    setConvos(recentConversations());
    setEditingId(null);
    tick(10);
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.removeAttribute("data-nav-open");
    };
  }, [open]);

  const quietRow =
    "flex w-full items-center gap-4 rounded-2xl px-4 py-3.5 text-[15px] font-medium text-muted-foreground/60 transition-all hover:bg-sidebar-hover hover:text-muted-foreground";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          initial={{ x: "-12%" }}
          animate={{ x: 0 }}
          exit={{ x: "-12%" }}
          transition={{ duration: 0.46, ease: [0.32, 0.72, 0, 1] }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="orleia-nav-sheet fixed inset-y-0 left-0 z-[40] flex w-[82vw] max-w-[340px] flex-col bg-sidebar md:hidden"
        >
          {/* Orleia text logo — big, top left. The floating top bar slides
              away WITH the main card when the nav opens, so nothing pins
              over this sheet anymore. */}
          <div className="px-5 pt-[calc(env(safe-area-inset-top,0px)+2.5rem)] pb-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/orleia-wordmark.png" alt="Orleia" className="h-9 w-auto dark:invert" />
          </div>
          <nav className="flex flex-1 flex-col overflow-y-auto px-3 pt-[calc(env(safe-area-inset-top,0px)+1rem)]">
            {/* New chat — starts a fresh Noor thread */}
            <button onClick={startChat} className={quietRow}>
              <Plus className="h-[18px] w-[18px] shrink-0" />
              <span>{t("nav.newChat")}</span>
            </button>

            {/* Search — moved here from the top bar */}
            <button onClick={openSearch} className={quietRow}>
              <Search className="h-[18px] w-[18px] shrink-0" />
              <span>{t("search.title")}</span>
            </button>

            {/* Recent Noor + agent chats — ALWAYS present (an empty list
                still shows its heading + hint), pushed a bit lower so the
                two actions above breathe. */}
            <div className="mt-7">
              <p className="px-2 pb-2 text-[11px] font-medium tracking-wide text-muted-foreground/40">
                {t("nav.recentChats")}
              </p>
              {convos.length === 0 ? (
                <p className="px-3 py-2.5 text-sm text-muted-foreground/45">{t("nav.noChats")}</p>
              ) : (
                <ul className="space-y-0.5" role="list">
                  {convos.map((c) => (
                    <li key={c.id}>
                      {editingId === c.id ? (
                        <input
                          autoFocus
                          defaultValue={c.title}
                          onFocus={(e) => e.currentTarget.select()}
                          onBlur={(e) => saveRename(c.id, e.currentTarget.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          aria-label={t("nav.recentChats")}
                          className="w-full rounded-xl border border-primary-500/40 bg-sidebar-hover px-3 py-2.5 text-sm font-medium text-foreground outline-none"
                        />
                      ) : (
                        <div className="group flex items-center gap-1">
                          <Link
                            href={`/noor?c=${c.id}`}
                            onClick={() => goTo(`/noor?c=${c.id}`)}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground/60 transition-all hover:bg-sidebar-hover hover:text-muted-foreground"
                          >
                            {c.petAgentId || c.petAgentGroup ? (
                              <PawPrint className="h-4 w-4 shrink-0" />
                            ) : (
                              <MessageSquare className="h-4 w-4 shrink-0" />
                            )}
                            <span className="flex-1 truncate">{c.title || t("nav.noor")}</span>
                          </Link>
                          <button
                            onClick={() => { tick(6); setEditingId(c.id); }}
                            className="rounded-lg p-2 text-muted-foreground/35 transition-colors hover:text-foreground"
                            aria-label={t("nav.rename", "Rename")}
                            title={t("nav.rename", "Rename")}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </nav>

          {/* Accent pill: straight to the billing/plans section */}
          <div className="px-3 pt-4">
            <Link
              href="/settings?cat=billing"
              onClick={() => goTo("/settings?cat=billing")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-500/25 transition-transform active:scale-[0.98]"
            >
              <Sparkles className="h-4 w-4" />
              {t("nav.getPremium")}
            </Link>
          </div>
          <div className="pb-[max(env(safe-area-inset-bottom,0px),1.5rem)] pt-1" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}