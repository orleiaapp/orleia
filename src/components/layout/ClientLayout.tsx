"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { haptic } from "@/lib/haptics";
import { ReminderCenter } from "./ReminderCenter";
import { Sidebar } from "./Sidebar";
import { MobileTopBar } from "./MobileTopBar";
import { MobileNavScreen } from "./MobileNavScreen";
import { SplashScreen, isFreshLoad, markSplashSeen } from "./SplashScreen";
import { TutorialFlow } from "./TutorialFlow";
import { PetReactions } from "./PetReactions";
import { IntroFlow } from "./IntroFlow";
import { motion, MotionConfig } from "framer-motion";
import { storage } from "@/lib/storage";
import { useShortcuts } from "@/lib/useShortcuts";
import { GlobalSearch } from "./GlobalSearch";
import { ensureNoorBackground } from "@/lib/noor-background";
import { NoorToast } from "./NoorToast";
import { UndoToast } from "./UndoToast";
import { PlanIntro } from "./PlanIntro";
import { ThemeBackdrop } from "./ThemeBackdrop";
import { RoutePrefetcher } from "./RoutePrefetcher";
import { cn } from "@/lib/utils";

function isLandingDomain() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  /* The landing is any non-app host: orleia.app, www, orleia.app (legacy),
     and the preview deployments. app.* always gets the workspace. */
  return (
    host.includes("orleia-suite") ||
    host.includes("orleia-landing") ||
    host === "orleia.app" ||
    host === "www.orleia.app" ||
    host === "orleia.app" ||
    host === "orleia.app"
  );
}

// /deck intentionally NOT here: its mobile gate must sit at the same
// height as the other Office pages (main gets the standard 4rem+safe-area
// top padding).
const FULL_WIDTH_ROUTES = ["/noor", "/calendar"];

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [storageReady, setStorageReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  // Shows on fresh page loads; holds until storage init completes (min 1s) —
  // a cover for hydration + init, never a delay after them.
  const [showSplash, setShowSplash] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  // The 13+ declaration now lives INSIDE the intro flow (welcome → age →
  // name → look), so nothing gates before the welcome screen. Kept as a
  // resolved-true default for existing users who already confirmed.
  const [ageGateDone, setAgeGateDone] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [planIntroDone, setPlanIntroDone] = useState(true);
  // Device-matched corner radius for the sliding main card (matches the
  // physical screen curvature of the phone; UA-CH platform first, UA
  // string as fallback, 28px default).
  const [deviceRadius, setDeviceRadius] = useState(28);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const plat = (nav.userAgentData?.platform || navigator.userAgent || "").toLowerCase();
    const ua = navigator.userAgent.toLowerCase();
    let r = 28; // generic / desktop
    if (plat.includes("iphone") || ua.includes("iphone")) r = 42; // iPhone notch era
    else if (plat.includes("ipad") || ua.includes("ipad")) r = 18;
    else if (plat.includes("android")) {
      if (ua.includes("sm-")) r = 38; // Samsung Galaxy
      else if (ua.includes("pixel")) r = 40; // Google Pixel
      else if (ua.includes("huawei") || ua.includes("honor")) r = 34;
      else if (ua.includes("oneplus")) r = 40;
      else if (ua.includes("xiaomi")) r = 38;
      else r = 36; // generic Android
    }
    setDeviceRadius(r);
    document.documentElement.style.setProperty("--orleia-card-radius", `${r}px`);
  }, []);
  // Re-apply the SAVED accent colour on every app start — without this
  // the data-accent attribute only existed while the picker was used and
  // the choice was lost after closing Orleia.
  useEffect(() => {
    try {
      const saved = storage.getData()?.theme?.accentColor;
      if (saved) document.documentElement.setAttribute("data-accent", saved);
    } catch { /* storage not ready yet */ }
  }, [storageReady]);
  const landing = isLandingDomain();
  const isFullWidth = FULL_WIDTH_ROUTES.some(r => pathname.startsWith(r));
  // Sidebar collapse state (from Sidebar's custom event) so the main
  // content recenters smoothly instead of hugging the collapsed rail.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    const onCollapse = (e: Event) => setSidebarCollapsed(Boolean((e as CustomEvent).detail));
    window.addEventListener("orleia:sidebar-collapsed", onCollapse);
    return () => window.removeEventListener("orleia:sidebar-collapsed", onCollapse);
  }, []);
  // Mirror of mobileNavOpen for the touch handlers (no stale closure).
  const mobileNavOpenRef = useRef(false);
  useEffect(() => { mobileNavOpenRef.current = mobileNavOpen; }, [mobileNavOpen]);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  // Sidebar swipe (iOS-style): swipe RIGHT anywhere opens the nav sheet
  // (it slides in from underneath the app); swipe LEFT closes it. Never
  // fires mid text-selection. NOTE: this intentionally is NOT a back
  // navigation gesture — router.back on right-swipe was removed.
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 2) {
      const opening = dx > 0 && !mobileNavOpenRef.current;
      const closing = dx < 0 && mobileNavOpenRef.current;
      if (!opening && !closing) return;
      if (String(window.getSelection?.() ?? "").length > 0) return;
      haptic.tick();
      window.dispatchEvent(new CustomEvent("orleia:toggle-sidebar", { detail: opening }));
    }
  }, []);
  const [searchOpen, setSearchOpen] = useState(false);

  // Platform classes for CSS: iOS gets Liquid Glass buttons + chrome
  // no-select; non-landing hosts get body.orleia-app (kills the iOS
  // rubber-band chaining behind fixed bars).
  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios) document.documentElement.classList.add("ios-touch");
    if (!isLandingDomain()) document.body.classList.add("orleia-app");
  }, []);

  // Global keyboard shortcuts (Ctrl+K search, new note/task/habit, sidebar, settings)
  useShortcuts();

  useEffect(() => {
    ensureNoorBackground();
    const open = () => setSearchOpen(true);
    window.addEventListener("orleia:open-search", open);
    return () => window.removeEventListener("orleia:open-search", open);
  }, []);

  useEffect(() => {
    if (isLandingDomain()) return;
    setShowSplash(isFreshLoad());
    // Hand the pre-hydration BootSplash over: either the React splash above
    // takes the same spot seamlessly, or the app paints right away.
    window.dispatchEvent(new Event("orleia:splash-ready"));
    try {
      setPlanIntroDone(window.localStorage.getItem("orleia.planIntroSeen.v1") === "1");
    } catch {
      setPlanIntroDone(true);
    }
    storage.init()
      .then(() => { setStorageReady(true); setNeedsOnboarding(!storage.isOnboardingCompleted()); })
      .catch(() => { setStorageReady(true); setNeedsOnboarding(true); });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<boolean | undefined>;
      if (typeof ev.detail === "boolean") setMobileNavOpen(ev.detail);
      else setMobileNavOpen(o => !o);
    };
    window.addEventListener("orleia:toggle-sidebar", handler);
    return () => window.removeEventListener("orleia:toggle-sidebar", handler);
  }, []);

  const toggleMobileNav = useCallback(() => {
    setMobileNavOpen(o => !o);
  }, []);

  // All edge-swipe gestures were removed (swipe-back + swipe-open-sidebar
  // both conflicted with natural scrolling/system gestures).

  // NOTE: The iOS-style right-edge swipe-back (router.back()) was removed —
  // NOTE: All edge-swipe gestures were removed — the right-edge swipe-back
  // (router.back) and the left-edge swipe-to-open-sidebar both conflicted
  // with natural scrolling/system gestures. Sidebar opens via the hamburger.

  const handleSplashComplete = useCallback(() => {
    markSplashSeen();
    setSplashDone(true);
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setNeedsOnboarding(false);
    // "Pick your look" flow ends with the tutorial (if the flag was set).
    if (localStorage.getItem("orleia-tutorial-pending") === "true") {
      localStorage.removeItem("orleia-tutorial-pending");
      setShowTutorial(true);
      return;
    }
  }, []);

  // The app shell is interactive — cookie banner may now slide in (bottom).
  // Fired after ALL first-run modals (onboarding, tutorial, pet, plans) are
  // gone, so the welcome flow never competes with consent for attention.
  useEffect(() => {
    if (!storageReady || !ageGateDone || needsOnboarding || showTutorial || !planIntroDone) return;
    const t = setTimeout(() => window.dispatchEvent(new Event("orleia:app-ready")), 400);
    return () => clearTimeout(t);
  }, [storageReady, ageGateDone, needsOnboarding, showTutorial, planIntroDone]);

  /* Status-bar tint follows the APP theme (not just the OS): when the
     user toggles light/dark inside Orleia, the mobile OS bar follows. */
  useEffect(() => {
    const update = () => {
      const isDark =
        document.documentElement.classList.contains("dark") ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches &&
          !document.documentElement.classList.contains("light"));
      const color = isDark ? "#0a0a0a" : "#fafafa";
      document
        .querySelectorAll('meta[name="theme-color"]')
        .forEach((m) => m.setAttribute("content", color));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", update);
    return () => {
      observer.disconnect();
      mq.removeEventListener?.("change", update);
    };
  }, []);

  /* MotionConfig makes every Framer Motion animation across the app respect
     the reduced-motion accessibility toggle (they're JS-driven and bypass CSS). */
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const update = () =>
      setReducedMotion(
        document.documentElement.getAttribute("data-reduced-motion") === "true"
      );
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-reduced-motion"],
    });
    return () => observer.disconnect();
  }, []);

  if (landing) return <>{children}</>;

  return (
    <MotionConfig reducedMotion={reducedMotion ? "always" : "never"}>
<>
      {/* 'constellation' theme: starfield behind the whole app (z-0, below
          the card's z-50). Invisible for every other theme. */}
      <ThemeBackdrop />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <NoorToast />
      <UndoToast />
      <PetReactions />
      <RoutePrefetcher />
      {showSplash && !splashDone && (
        <SplashScreen onComplete={handleSplashComplete} ready={storageReady} />
      )}

      {/* The 13+ gate renders inside IntroFlow (after the welcome), so a
          fresh visitor sees ONLY the multilingual welcome first. */}

      {/* One-time full-screen plan intro — AFTER the full first-run flow
          (onboarding → tutorial → pet). The user must reach the aha moment
          before seeing plans; nothing is gated, one tap dismisses. */}
      {storageReady && ageGateDone && !needsOnboarding && !showTutorial && !planIntroDone && (
        <PlanIntroKeyed />
      )}

      {storageReady && needsOnboarding && (
        <IntroFlow onComplete={handleOnboardingComplete} />
      )}

      {storageReady && showTutorial && (
        <TutorialFlow onComplete={() => setShowTutorial(false)} />
      )}

      {/* The shell mounts as soon as storage is ready — while the splash is
          still covering it. The splash is a cover (reveals the already-
          rendered app), not a delay (nothing renders until it's done). */}
      {storageReady && !needsOnboarding && (
        <>
          {/* Second screen: nav sheet UNDER the main card. The card
              (top bar + shell) slides right to reveal it. */}
          <MobileNavScreen open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

          {/* Floating top-bar chrome lives OUTSIDE the card and takes
              the card's nav-open slide (see .orleia-topbar in
              globals.css): fixed to the viewport (scroll-proof) yet
              traveling WITH the main screen, so the buttons never hover
              over the nav sheet. z-70 keeps them above the card (z-50)
              and the nav sheet (z-40). */}
          <MobileTopBar onToggleSidebar={toggleMobileNav} navOpen={mobileNavOpen} />

          {/* Reminder drawer + toast also OUTSIDE the card: inside it,
              the card's z-50 stacking context capped the drawer below the
              root-level z-70 buttons, so the inbox could never overlap
              the top icons. Outside at z-80 the drawer paints over them. */}
          <ReminderCenter />

          {/* The main CARD: the shell slides right to reveal the nav
              sheet underneath (page content inside re-bases with it). */}
          <div className="orleia-card">
            <div className={`orleia-app-shell flex min-h-screen ${isFullWidth ? "max-md:h-dvh max-md:min-h-0 max-md:overflow-hidden" : ""}`}>
            <Sidebar />
            <main id="main-content" className={`flex-1 ${isFullWidth ? "" : "pt-[calc(4rem+env(safe-area-inset-top,0px))] md:pt-0"} md:transition-[padding] md:duration-300 md:ease-in-out ${sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[260px]"}`} tabIndex={-1}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}>
              {/* Keyed remount with enter-only fade. Deliberately NO
                  AnimatePresence: with App Router children it is the source
                  of both stacked-page and black-screen hangs. React unmounts
                  the old page synchronously on key change — one page, always. */}
              <motion.div
                key={pathname}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={isFullWidth ? "" : "mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8"}
              >
                {children}
              </motion.div>
            </main>
            </div>
          </div>
        </>
      )}
    </>
    </MotionConfig>
  );
}
/** Remount-safe wrapper: PlanIntro's own X/Escape closes it and flips the
    localStorage flag; when that happens we re-read it so the app renders. */
function PlanIntroKeyed() {
  const [, force] = useState(0);
  useEffect(() => {
    const onStorage = () => force((n) => n + 1);
    // PlanIntro writes the flag before unmounting; re-check on any change.
    const iv = setInterval(() => {
      try {
        if (window.localStorage.getItem('orleia.planIntroSeen.v1') === '1') force((n) => n + 1);
      } catch { /* ignore */ }
    }, 500);
    return () => clearInterval(iv);
  }, []);
  try {
    if (window.localStorage.getItem('orleia.planIntroSeen.v1') === '1') return null;
  } catch { return null; }
  return <PlanIntro />;
}

