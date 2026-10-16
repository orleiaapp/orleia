"use client";

// ============================================================
// BottomNav — the primary navigation row, pinned to the bottom of
// the app card on every breakpoint: Dashboard, Habits,
// Mindfulness, Tasks, Noor. These five moved OUT of the sidebar
// (which now keeps only secondary surfaces: recent chats, Deck,
// reminders, settings). Sits inside .orleia-card, so it travels
// with the card when the mobile nav sheet slides it sideways.
// ============================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CheckCircle2, Flower2, ListTodo } from "lucide-react";
import { NoorMark } from "@/components/NoorMark";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const ITEMS = [
  { href: "/", labelKey: "nav.dashboard", icon: Home },
  { href: "/habits", labelKey: "nav.habits", icon: CheckCircle2 },
  { href: "/journal", labelKey: "nav.journal", icon: Flower2 },
  { href: "/tasks", labelKey: "nav.tasks", icon: ListTodo },
  { href: "/noor", labelKey: "nav.noor", icon: NoorMark },
];

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:left-[var(--orleia-sidebar-w)]"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2" role="list">
        {ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium transition-colors",
                  isActive
                    ? "text-primary-500"
                    : "text-muted-foreground/60 hover:text-foreground"
                )}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    // The Noor mark is a white PNG — tone-match lucide icons.
                    item.href === "/noor" &&
                      cn("invert dark:invert-0", isActive ? "opacity-100" : "opacity-60")
                  )}
                />
                <span className="max-w-full truncate">{t(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
