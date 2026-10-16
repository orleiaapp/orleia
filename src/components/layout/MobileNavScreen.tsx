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
// The five primary destinations live in the bottom row (BottomNav)
// now — this sheet keeps the secondary surfaces: recent Noor/agent
// chats, Deck and Settings. The old "Office" group is gone.
// ============================================================

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, Presentation, MessageSquare, PawPrint } from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { storage } from "@/lib/storage";
import type { AIConversation } from "@/types";

const tick = (pattern: number | number[]) => {
  haptic.tick();
  void pattern; /* kept for signature compat */
};

function recentConversations(): AIConversation[] {
  try {
    return [...storage.getConversations()]
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .slice(0, 5);
  } catch {
    return [];
  }
}

export function MobileNavScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [convos, setConvos] = useState<AIConversation[]>([]);

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
    tick(10);
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.removeAttribute("data-nav-open");
    };
  }, [open]);

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
            {/* Recent Noor + agent chats */}
            {convos.length > 0 && (
              <>
                <p className="px-2 pb-2 text-[11px] font-medium tracking-wide text-muted-foreground/40">
                  {t("nav.recentChats")}
                </p>
                <ul className="space-y-0.5" role="list">
                  {convos.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/noor?c=${c.id}`}
                        onClick={() => goTo(`/noor?c=${c.id}`)}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground/60 transition-all hover:bg-sidebar-hover hover:text-muted-foreground"
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
              onClick={() => goTo("/deck")}
              className={cn(
                "flex items-center gap-4 rounded-2xl px-4 py-3.5 text-[15px] font-medium transition-all",
                pathname === "/deck"
                  ? "bg-primary-500/10 text-primary-500"
                  : "text-muted-foreground/60 hover:bg-sidebar-hover hover:text-muted-foreground"
              )}
            >
              <Presentation className="h-[18px] w-[18px] shrink-0" />
              <span>{t("nav.deck")}</span>
            </Link>

            <Link
              href="/settings"
              onClick={() => goTo("/settings")}
              className={cn(
                "flex items-center gap-4 rounded-2xl px-4 py-3.5 text-[15px] font-medium transition-all",
                pathname === "/settings"
                  ? "bg-primary-500/10 text-primary-500"
                  : "text-muted-foreground/60 hover:bg-sidebar-hover hover:text-muted-foreground"
              )}
            >
              <Settings className="h-[18px] w-[18px] shrink-0" />
              <span>{t("nav.settings")}</span>
            </Link>
          </nav>
          <div className="pb-[max(env(safe-area-inset-bottom,0px),1.5rem)]" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
