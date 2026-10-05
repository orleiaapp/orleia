"use client";

// ============================================================
// Sidebar — desktop rail only.
// Mobile navigation is a separate full-screen page: MobileNavScreen.
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  FileText,
  ListTodo,
  CheckCircle2,
  Settings,
  ChevronLeft,
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
import { ReminderBell } from "./ReminderCenter";
import { storage } from "@/lib/storage";

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const { t } = useI18n();

  // Publish the rail width for full-screen takeovers (the notes page
  // insets by it on md+ so THIS sidebar stays visible + clickable —
  // it's the only way out of those pages on desktop, which has no
  // floating top bar). Falls back to 260px in :root before mount.
  useEffect(() => {
    document.documentElement.style.setProperty("--orleia-sidebar-w", collapsed ? "72px" : "260px");
  }, [collapsed]);

  const navItems = [
    { href: "/", label: t("nav.dashboard"), icon: Home },
    { href: "/habits", label: t("nav.habits"), icon: CheckCircle2 },
    { href: "/journal", label: t("nav.journal"), icon: Flower2 },
    { href: "/tasks", label: t("nav.tasks"), icon: ListTodo },
    { href: "/noor", label: t("nav.noor"), icon: NoorMark },
    { href: "/pets", label: t("nav.pets"), icon: PawPrint },
  ];

  const data = storage.getData();
  const recentProjects = data.projects
    .filter((p) => p.status !== "archived")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 3);

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

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 pt-8 pb-4">
        <ul className="space-y-1" role="list">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.href} role="listitem">
                <Link
                  href={item.href}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    collapsed && "justify-center px-2",
                    isActive
                      ? "bg-primary-500/10 text-primary-500"
                      : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-sidebar-hover"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <item.icon className={cn(
                    "h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110",
                    item.href === "/noor" && cn(
                      "invert dark:invert-0",
                      // The mark is a white PNG — match the lucide icons'
                      // muted tone when inactive, full strength when active.
                      isActive ? "opacity-100" : "opacity-60 group-hover:opacity-90"
                    )
                  )} />
                  {!collapsed && <span className="flex-1">{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="my-8" />

        {/* Projects */}
        {!collapsed && (
          <div className="px-1">
            <Link href="/projects" className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground/60 hover:text-muted-foreground hover:bg-sidebar-hover transition-all">
              <FolderOpen className="h-5 w-5 shrink-0" />
              <span>{t("nav.projects")}</span>
            </Link>
            {recentProjects.length > 0 && (
              <ul className="ml-5 mt-0.5 space-y-0.5">
                {recentProjects.map((project) => (
                  <li key={project.id}>
                    <Link href={`/projects/${project.id}`} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground/60 hover:text-muted-foreground hover:bg-sidebar-hover transition-all">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
                      <span className="truncate">{project.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </nav>

      {/* Office tools */}
      <div className="px-2 pb-2">
        <button onClick={() => setToolsOpen((v) => !v)} aria-expanded={toolsOpen} className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground/50 transition-all duration-200 hover:text-muted-foreground", collapsed && "justify-center px-2")}>
          <Briefcase className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="flex-1 text-left">{t("nav.office")}</span>}
        </button>
        <AnimatePresence initial={false}>
          {toolsOpen && (
            <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: "easeInOut" }} className="space-y-0.5 overflow-hidden" role="list">
              {[{ href: "/notes", label: t("nav.notes"), icon: FileText }, { href: "/deck", label: t("nav.deck"), icon: Presentation }, { href: "/calendar", label: t("nav.calendar"), icon: CalendarDays }].map((item) => {
                const isActive = pathname === item.href;
                return (<li key={item.href}><Link href={item.href} className={cn("group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium", collapsed && "justify-center px-2", isActive ? "bg-primary-500/10 text-primary-500" : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-sidebar-hover")}><item.icon className="h-5 w-5 shrink-0" />{!collapsed && <span className="flex-1">{item.label}</span>}</Link></li>);
              })}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom */}
      <div className="border-t border-border p-3 space-y-1 overflow-hidden">
        <ReminderBell collapsed={collapsed} />
        <Link href="/settings" className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] transition-all duration-200", collapsed && "justify-center px-2", pathname === "/settings" ? "bg-primary-500/10 text-primary-500" : "text-muted-foreground/60 hover:text-foreground hover:bg-sidebar-hover")}><Settings className="h-3.5 w-3.5 shrink-0" />{!collapsed && <span>{t("nav.settings")}</span>}</Link>
        <button onClick={() => { const next = !collapsed; setCollapsed(next); window.dispatchEvent(new CustomEvent("orleia:sidebar-collapsed", { detail: next })); }} className="hidden md:flex w-full items-center justify-center rounded-xl px-3 py-1.5 text-muted-foreground/40 hover:text-foreground transition-colors duration-200" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}><ChevronLeft className={cn("h-3.5 w-3.5 transition-transform duration-200", collapsed && "rotate-180")} /></button>
      </div>
    </aside>
  );
}
