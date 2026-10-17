"use client";

// ============================================================
// MobileTopBar — the floating mobile buttons.
// All buttons live inside ONE fixed, viewport-sized .orleia-topbar
// layer. When the nav sheet opens, the layer takes the exact same
// translateX slide as .orleia-card (see globals.css), so the buttons
// travel WITH the main screen: they never sit on top of the sidebar,
// and the hamburger lands on the card's visible right-edge sliver.
// The layer is fixed (viewport-anchored, scroll-proof) and only gets
// a transform — re-basing its fixed children 1:1 since the box equals
// the viewport.
// Pure event dispatchers / navigation.
// Safe-area aware: buttons sit below the notch / Dynamic Island.
//
// Chrome today: hamburger on the left, and ONE pill on the right
// that is clickable on both sides — left half = Settings, right half
// = reminder inbox. The search pill moved into the nav sheet (a
// Search row next to New chat).
//
// Platforms: on Apple touch devices the buttons get the Liquid Glass
// material (html.ios-touch set by ClientLayout) and sit inside 50x50
// hit wrappers (Apple HIG >=44pt with buffer). Android and desktop
// keep the original matte .orleia-glass-btn, unwrapped.
// ============================================================

import { Menu, Bell, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/** Apple touch device? (ClientLayout also sets html.ios-touch.) */
function isAppleTouch(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return iOS && (window as unknown as { standalone?: boolean }).standalone !== false;
}

const TOP = "calc(0.75rem + env(safe-area-inset-top, 0px))";

/** 50x50 hit wrapper — iOS only. Centers the 40px glass circle. */
function HitArea({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <div className={`orleia-hit-50 ${className}`} style={{ top: TOP }}>
      {children}
    </div>
  );
}

export function MobileTopBar({
  onToggleSidebar,
  navOpen,
}: {
  onToggleSidebar: () => void;
  navOpen: boolean;
}) {
  const router = useRouter();
  const [reminderCount, setReminderCount] = useState(0);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setIos(isAppleTouch());
    const onCount = (e: Event) => setReminderCount((e as CustomEvent<number>).detail || 0);
    window.addEventListener("orleia:reminders-count", onCount);
    return () => window.removeEventListener("orleia:reminders-count", onCount);
  }, []);

  const hamburger = (
    <button
      onClick={() => { haptic.tap(); onToggleSidebar(); }}
      className="orleia-glass-btn"
      aria-label={navOpen ? "Close navigation menu" : "Open navigation menu"}
      aria-expanded={navOpen}
    >
      <Menu className="h-5 w-5" />
    </button>
  );

  const openSettings = () => { haptic.tap(); router.push("/settings"); };
  const openReminders = () => { haptic.tap(); window.dispatchEvent(new CustomEvent("orleia:toggle-reminders")); };

  const halfBtn = "relative flex h-full items-center justify-center px-4 text-foreground/75 transition-colors hover:text-foreground active:bg-black/5 dark:active:bg-white/10";

  return (
    <div className="orleia-topbar md:hidden">
      {/* Hamburger — rides the main card sliver while the nav sheet is
          open (z-70 > nav screen z-40). md:hidden: tablets + landscape
          phones (≥768px) get the desktop sidebar instead. */}
      {ios ? (
        <HitArea className="left-4 md:hidden">{hamburger}</HitArea>
      ) : (
        <button
          onClick={() => { haptic.tap(); onToggleSidebar(); }}
          className="orleia-glass-btn orleia-glass-btn-lg fixed top-[calc(0.75rem+env(safe-area-inset-top,0px))] left-4 z-[70] md:hidden"
          aria-label={navOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={navOpen}
        >
          <Menu className="h-6 w-6" />
        </button>
      )}

      {/* Search pill: REMOVED — search lives in the nav sheet now
          (Search row, right under New chat). */}

      {/* Settings + reminders — ONE pill, clickable on both halves:
          left half opens Settings, right half toggles the inbox.
          Everything the top bar carries now sits in two clusters
          (hamburger · pill), leaving the middle clear. */}
      <div
        className={cn(
          "fixed right-4 z-[70] flex items-stretch rounded-full md:hidden",
          ios
            ? "orleia-search-glass top-[calc(1rem+env(safe-area-inset-top,0px))] h-[42px]"
            : "top-[calc(0.75rem+env(safe-area-inset-top,0px))] h-12 border border-border bg-secondary"
        )}
      >
        <button onClick={openSettings} className={halfBtn} aria-label="Settings">
          <Settings className="h-5 w-5" />
        </button>
        <span className={cn("w-px self-stretch bg-border/70", ios && "my-2.5")} aria-hidden />
        <button onClick={openReminders} className={halfBtn} aria-label="Reminders">
          <Bell className="h-5 w-5" />
          {reminderCount > 0 && (
            <span className="absolute right-2.5 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
              {reminderCount > 9 ? "9+" : reminderCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}