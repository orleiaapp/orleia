"use client";

// ============================================================
// MobileTopBar — the floating mobile buttons.
// All buttons live inside ONE fixed, viewport-sized .orleia-topbar
// layer. When the nav sheet opens, the layer takes the exact same
// translateX slide as .orleia-card (see globals.css), so the buttons
// travel WITH the main screen: they never sit on top of the sidebar,
// and the hamburger lands on the card's visible right-edge sliver.
// The layer is fixed (viewport-anchored, scroll-proof) and only gets a
// transform — re-basing its fixed children 1:1 since the box equals
// the viewport.
// Pure event dispatchers / navigation.
// Safe-area aware: buttons sit below the notch / Dynamic Island.
//
// Platforms: on Apple touch devices the three icon buttons get the
// Liquid Glass material (html.ios-touch set by ClientLayout) and sit
// inside 50x50 hit wrappers (Apple HIG >=44pt with buffer). Android
// and desktop keep the original matte .orleia-glass-btn, unwrapped.
// The wrapper flex-centers the 40px circle, so visual positions are
// pixel-identical on both platforms.
// ============================================================

import { Menu, Bell, Settings, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { haptic } from "@/lib/haptics";
import { useI18n } from "@/lib/i18n";
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
  const { t } = useI18n();
  const [reminderCount, setReminderCount] = useState(0);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setIos(isAppleTouch());
    const onCount = (e: Event) => setReminderCount((e as CustomEvent<number>).detail || 0);
    window.addEventListener("orleia:reminders-count", onCount);
    return () => window.removeEventListener("orleia:reminders-count", onCount);
  }, []);

  /* The three icon buttons share styling/positions; only the wrapper
     differs per platform. Glass vs matte is pure CSS (html.ios-touch). */
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
  const settings = (
    <button
      onClick={() => { haptic.tap(); router.push("/settings"); }}
      className="orleia-glass-btn"
      aria-label="Settings"
    >
      <Settings className="h-5 w-5" />
    </button>
  );
  const reminders = (
    <button
      onClick={() => { haptic.tap(); window.dispatchEvent(new CustomEvent("orleia:toggle-reminders")); }}
      className="orleia-glass-btn"
      aria-label="Reminders"
    >
      <Bell className="h-5 w-5" />
      {reminderCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
          {reminderCount > 9 ? "9+" : reminderCount}
        </span>
      )}
    </button>
  );

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

      {/* Search — long pill spanning the middle between hamburger and settings.
          iOS: Liquid Glass (grey #999 @17%, rim shadows; mic intentionally
          omitted), 42px at 1rem top to optically center against its 40px
          circles. Android/desktop: 48px pill on the SAME top as the 48px
          buttons — the whole row shares one height level. */}
      <button
        onClick={() => { haptic.tap(); window.dispatchEvent(new CustomEvent("orleia:open-search")); }}
        className={cn(
          "fixed z-[70] flex items-center gap-2 rounded-full px-4 text-left transition-colors md:hidden",
          ios
            ? "orleia-search-glass top-[calc(1rem+env(safe-area-inset-top,0px))] h-[42px] left-[76px] right-[9.5rem]"
            : "border border-border bg-secondary hover:bg-secondary top-[calc(0.75rem+env(safe-area-inset-top,0px))] h-12 left-[76px] right-[10rem]"
        )}
        aria-label={t("search.title")}
      >
        <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
        <span className="truncate text-sm text-muted-foreground">{t("search.title")}</span>
      </button>

      {/* Settings — pinned above BOTH screens, same spot as on the main screen */}
      {ios ? (
        <HitArea className="right-20 md:hidden">{settings}</HitArea>
      ) : (
        <button
          onClick={() => { haptic.tap(); router.push("/settings"); }}
          className="orleia-glass-btn orleia-glass-btn-lg fixed top-[calc(0.75rem+env(safe-area-inset-top,0px))] right-[5.5rem] z-[70] md:hidden"
          aria-label="Settings"
        >
          <Settings className="h-6 w-6" />
        </button>
      )}

      {/* Reminders bell — pinned above BOTH screens, same spot as on the main screen */}
      {ios ? (
        <HitArea className="right-4 md:hidden">{reminders}</HitArea>
      ) : (
        <button
          onClick={() => { haptic.tap(); window.dispatchEvent(new CustomEvent("orleia:toggle-reminders")); }}
          className="orleia-glass-btn orleia-glass-btn-lg fixed top-[calc(0.75rem+env(safe-area-inset-top,0px))] right-4 z-[70] md:hidden"
          aria-label="Reminders"
        >
          <Bell className="h-6 w-6" />
          {reminderCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
              {reminderCount > 9 ? "9+" : reminderCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
