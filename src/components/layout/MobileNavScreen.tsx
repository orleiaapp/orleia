"use client";

// ============================================================
// MobileNavScreen — the second screen.
// Full-screen navigation page OUTSIDE the app shell. Dragging left
// follows the finger 1:1 (release-to-complete, like iOS). Haptic
// ticks fire on open, on close, and on a successful flick-dismiss.
// The floating hamburger stays in place and closes this screen.
// ============================================================

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  FileText,
  ListTodo,
  CheckCircle2,
  Briefcase,
  Presentation,
  Flower2,
  PawPrint,
  FolderOpen,
  CalendarDays,
} from "lucide-react";

import { NoorMark } from "@/components/NoorMark";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { storage } from "@/lib/storage";
import { haptic } from "@/lib/haptics";

const tick = (pattern: number | number[]) => {
  haptic.tick();
  void pattern; /* kept for signature compat */
};

export function MobileNavScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [toolsOpen, setToolsOpen] = useState(false);

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
    tick(10);
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.removeAttribute("data-nav-open");
    };
  }, [open]);

  const data = storage.getData();
  const recentProjects = data.projects
    .filter((p) => p.status !== "archived")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 3);

  const navItems = [
    { href: "/", label: t("nav.dashboard"), icon: Home },
    { href: "/habits", label: t("nav.habits"), icon: CheckCircle2 },
    { href: "/journal", label: t("nav.journal"), icon: Flower2 },
    { href: "/tasks", label: t("nav.tasks"), icon: ListTodo },
    { href: "/noor", label: t("nav.noor"), icon: NoorMark },
    { href: "/pets", label: t("nav.pets"), icon: PawPrint },
  ];

  const officeItems = [
    { href: "/notes", label: t("nav.notes"), icon: FileText },
    { href: "/deck", label: t("nav.deck"), icon: Presentation },
    { href: "/calendar", label: t("nav.calendar"), icon: CalendarDays },
  ];

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
          {/* Orleia text logo — big, top left (clears the pinned floating
              hamburger, which stays top-left on this screen too). */}
          <div className="px-5 pt-[calc(env(safe-area-inset-top,0px)+4.25rem)] pb-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/orleia-wordmark.png" alt="Orleia" className="h-9 w-auto dark:invert" />
          </div>
          <nav className="flex flex-1 flex-col overflow-y-auto px-3 pt-[calc(env(safe-area-inset-top,0px)+1rem)]">
            <ul className="space-y-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => goTo(item.href)}
                      className={cn(
                        "group flex items-center gap-4 rounded-2xl px-4 py-3.5 text-[15px] font-medium transition-all",
                        isActive ? "bg-primary-500/10 text-primary-500" : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-sidebar-hover"
                      )}
                    >
                      <item.icon className={cn(
                        "h-[18px] w-[18px] shrink-0",
                        item.href === "/noor" && cn(
                          "invert dark:invert-0",
                          // Match lucide icons' muted tone when inactive.
                          isActive ? "opacity-100" : "opacity-60 group-hover:opacity-90"
                        )
                      )} />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="my-8" />

            {/* Projects */}
            <div className="px-1">
              <Link
                href="/projects"
                onClick={() => goTo("/projects")}
                className="group flex items-center gap-4 rounded-2xl px-4 py-3.5 text-[15px] font-medium text-muted-foreground/60 hover:text-muted-foreground hover:bg-sidebar-hover transition-all"
              >
                <FolderOpen className="h-[18px] w-[18px] shrink-0" />
                <span>{t("nav.projects")}</span>
              </Link>
              {recentProjects.length > 0 && (
                <ul className="ml-5 mt-0.5 space-y-0.5">
                  {recentProjects.map((project) => (
                    <li key={project.id}>
                      <Link
                        href={`/projects/${project.id}`}
                        onClick={() => goTo(`/projects/${project.id}`)}
                        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium text-muted-foreground/60 hover:text-muted-foreground hover:bg-sidebar-hover transition-all"
                      >
                        <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
                        <span className="truncate">{project.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </nav>

          {/* Office tools */}
          <div className="px-2 pb-[max(env(safe-area-inset-bottom,0px),1.5rem)]">
            <button
              onClick={() => setToolsOpen((v) => !v)}
              aria-expanded={toolsOpen}
              className="flex w-full items-center gap-4 rounded-lg px-4 py-3 text-[14px] font-medium text-muted-foreground/50 transition-all hover:text-muted-foreground"
            >
              <Briefcase className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1 text-left">{t("nav.office")}</span>
            </button>
            <AnimatePresence initial={false}>
              {toolsOpen && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-0.5 overflow-hidden"
                >
                  {officeItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => goTo(item.href)}
                          className={cn(
                            "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium",
                            isActive ? "bg-primary-500/10 text-primary-500" : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-sidebar-hover"
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
