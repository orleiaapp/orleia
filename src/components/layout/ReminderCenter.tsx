"use client";

// ============================================================
// In-app Reminder Center
// A bell + panel + toast surface for the same situation-model
// reminders that browser notifications use - but it works on
// EVERY device (including iOS Safari, where the Notification
// API doesn't exist). Fully local, zero servers.
//
// Push split (notifications while the app is CLOSED):
//   - visible: server push schedule is kept EMPTY (in-app owns it)
//   - hidden / closed: a forward-looking schedule is uploaded via
//     sendBeacon, and the cron pushes those through the service worker
// ============================================================

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Check, X, Flame, Clock, MessageSquare, BellOff, Wind, CalendarDays } from "lucide-react";
import { storage } from "@/lib/storage";
import { getGraph, ensureWired } from "@/lib/graph/engine";
import {
  pendingReminders,
  dismissReminder,
  dismissAllReminders,
  getReminderSettings,
  type ReminderItem,
  checkAndNotify,
} from "@/lib/reminders";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  buildFutureSchedule,
  clearPushSchedule,
  registerPushOnServer,
  isPushSupported,
  ensureServiceWorker,
  beaconSchedule,
  uploadSchedule,
} from "@/lib/push-reminders";

const KIND_ICON: Record<ReminderItem["kind"], typeof Flame> = {
  event: CalendarDays,
  habit: Flame,
  task: Clock,
  mention: MessageSquare,
  wellness: Wind,
};

const KEY_OF = (i: ReminderItem) => `${i.kind}:${i.id}`;

/** Light tick for bell presses (no-op where vibration is unsupported). */
const hapticTick = () => {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(8);
    }
  } catch {
    /* ignore */
  }
};

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function ReminderCenter() {
  const router = useRouter();
  const { t } = useI18n();
  const [items, setItems] = useState<ReminderItem[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<ReminderItem | null>(null);
  const [toastMore, setToastMore] = useState(0);
  const seenRef = useRef<Set<string>>(new Set());
  const bootRef = useRef(true);
  const toastTimer = useRef<number | null>(null);

  const showToast = (item: ReminderItem, more: number) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(item);
    setToastMore(more);
    toastTimer.current = window.setTimeout(() => setToast(null), 7000);
  };

  const refresh = () => {
    try {
      ensureWired();
      const list = pendingReminders(storage.getData(), getGraph());
      setItems(list);
      window.dispatchEvent(new CustomEvent("orleia:reminders-count", { detail: list.length }));
      checkAndNotify();
      const keys = new Set(list.map(KEY_OF));
      if (bootRef.current) {
        // First pass after entering the app: welcome them with a toast if
        // something is waiting, but don't treat existing items as "new".
        bootRef.current = false;
        seenRef.current = keys;
        if (list.length > 0) showToast(list[0], list.length - 1);
      } else {
        const fresh = list.find((i) => !seenRef.current.has(KEY_OF(i)));
        if (fresh) showToast(fresh, list.length - 1);
      }
      seenRef.current = keys;
    } catch {
      // storage not ready yet - next pass will handle it
    }
  };

  // ---- Push while the app is CLOSED -----------------------------
  // ALWAYS-ON schedule sync: the forward-looking schedule is uploaded
  // on open, on every data change (debounced), on a timer, and on hide.
  // The old design armed the schedule ONLY on pagehide — mobile browsers
  // usually skip that event when an app is swiped away, so the server
  // never learned the schedule and background push silently died.
  const pushAllowed = () => {
    try {
      const settings = getReminderSettings();
      return (
        settings.enabled &&
        settings.desktopNotifications !== false &&
        isPushSupported() &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      );
    } catch {
      return false;
    }
  };

  /** Full (async) sync — open, data changes, timer. */
  const syncSchedule = () => {
    if (!pushAllowed()) {
      clearPushSchedule().catch(() => {});
      return;
    }
    uploadSchedule(buildFutureSchedule(storage.getData()));
  };

  const pushOnHide = () => {
    try {
      const settings = getReminderSettings();
      if (
        !settings.enabled ||
        settings.desktopNotifications === false ||
        !isPushSupported() ||
        typeof Notification === "undefined" ||
        Notification.permission !== "granted"
      ) {
        beaconScheduleFromCache([]); // opt-out: keep the server empty
        return;
      }
      beaconScheduleFromCache(buildFutureSchedule(storage.getData()));
    } catch {
      // best-effort: nothing we can do during teardown
    }
  };

  /** Beacon needs the endpoint synchronously — read it from localStorage. */
  const beaconScheduleFromCache = (items: ReturnType<typeof buildFutureSchedule>) => {
    try {
      const endpoint = localStorage.getItem("orleia-push-endpoint");
      if (!endpoint) return;
      beaconSchedule(endpoint, items);
    } catch {
      // ignore
    }
  };

  // Register the service worker + subscription on open, then upload the
  // schedule immediately — the server can notify even if the tab never
  // gets a proper hide/close event.
  useEffect(() => {
    const t = window.setTimeout(() => {
      ensureServiceWorker()
        .then(() => registerPushOnServer())
        .then(() => syncSchedule())
        .catch(() => {});
    }, 4000);
    return () => window.clearTimeout(t);
  }, []);

  // Ask for notification permission ONCE, on a real user gesture —
  // browsers block unprompted permission requests, so without this the
  // app can never deliver notifications on a fresh device.
  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;
    const flag = "orleia-push-asked";
    try {
      if (localStorage.getItem(flag)) return;
    } catch {
      return;
    }
    const ask = () => {
      try {
        localStorage.setItem(flag, "1");
      } catch {
        /* ignore */
      }
      try {
        void Notification.requestPermission();
      } catch {
        /* ignore */
      }
      window.removeEventListener("pointerdown", ask);
      window.removeEventListener("keydown", ask);
    };
    window.addEventListener("pointerdown", ask);
    window.addEventListener("keydown", ask);
    return () => {
      window.removeEventListener("pointerdown", ask);
      window.removeEventListener("keydown", ask);
    };
  }, []);

  // Hidden -> re-arm via beacon (fastest path). Visible -> nothing to do:
  // the service worker swallows system pushes while a window is visible,
  // so leaving the schedule armed can never double-notify.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") pushOnHide();
    };
    const onHide = () => pushOnHide();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bootstrap + keep in sync with data changes, a periodic re-check,
  // and tab visibility.
  useEffect(() => {
    const unsub = storage.subscribe(refresh);
    const t0 = window.setTimeout(refresh, 4000);
    const iv = window.setInterval(refresh, 5 * 60 * 1000);
    // Re-upload the schedule periodically (window shift) and after every
    // data change (debounced) — new/edited reminders reach the server
    // without depending on the user hiding the tab.
    const syncIv = window.setInterval(syncSchedule, 15 * 60 * 1000);
    let syncTimer: number | undefined;
    const onData = () => {
      if (syncTimer) window.clearTimeout(syncTimer);
      syncTimer = window.setTimeout(syncSchedule, 2000);
    };
    const unsubData = storage.subscribe(onData);
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("orleia:toggle-reminders", onToggle);
    return () => {
      unsub();
      unsubData();
      window.clearTimeout(t0);
      window.clearInterval(iv);
      window.clearInterval(syncIv);
      if (syncTimer) window.clearTimeout(syncTimer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("orleia:toggle-reminders", onToggle);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pathname = usePathname();

  const navigate = (item: ReminderItem) => {
    dismissReminder(item);
    refresh();
    setOpen(false);
    setToast(null);
    router.push(item.href);
  };

  const settingsOff = !getReminderSettings().enabled;

  return (
    <>
      {/* Panel - right drawer. Pure CSS slide: framer's touch-device
          animation kill-switch would otherwise snap it open/closed on
          phones/tablets. Respects data-reduced-motion via the global CSS.
          z-80 (not 70): the drawer renders OUTSIDE .orleia-card (its
          z-50 stacking context used to cap it under the floating top-bar
          buttons) and must paint OVER those z-70 icons. */}
      <aside
        aria-hidden={!open}
        role="dialog"
        aria-label={t("reminders.title")}
        className={cn(
          "fixed inset-y-0 right-0 z-[80] flex w-80 max-w-[calc(100vw-1rem)] flex-col border-l border-border bg-card shadow-2xl",
          "transition-[transform,visibility] duration-300 ease-out will-change-transform",
          open
            ? "translate-x-0 visible"
            : "pointer-events-none translate-x-full invisible"
        )}
      >
            <div className="flex items-center gap-3 border-b-0 md:border-b md:border-border px-4 py-4">
              <Bell className="h-5 w-5 text-primary-500" />
              <h2 className="flex-1 font-semibold">{t("reminders.title")}</h2>
              {items.length > 0 && (
                <button
                  onClick={() => {
                    dismissAllReminders();
                    refresh();
                  }}
                  className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {t("reminders.markAll")}
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-2.5 -m-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t("reminders.dismiss")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {settingsOff ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-6">
                  <BellOff className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium">{t("reminders.off")}</p>
                  <p className="text-xs text-muted-foreground">{t("reminders.offHint")}</p>
                  <button
                    onClick={() => {
                      setOpen(false);
                      router.push("/settings");
                    }}
                    className="btn-secondary mt-1 text-xs"
                  >
                    {t("reminders.toSettings")}
                  </button>
                </div>
              ) : items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-6">
                  <Check className="h-8 w-8 text-emerald-400/70" />
                  <p className="text-sm text-muted-foreground">{t("reminders.empty")}</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {items.map((item) => {
                    const Icon = KIND_ICON[item.kind];
                    return (
                      <li key={KEY_OF(item)}>
                        <div className="group relative flex items-start gap-3 rounded-2xl border border-border/70 bg-secondary/30 p-3 transition-colors hover:border-muted-foreground/30">
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
                          <button
                            onClick={() => navigate(item)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className="block truncate text-sm font-medium">{item.title}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground leading-snug">
                              {item.body}
                            </span>
                          </button>
                          <button
                            onClick={() => {
                              dismissReminder(item);
                              refresh();
                            }}
                            className="shrink-0 rounded-lg p-1 text-muted-foreground/50 opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
                            aria-label={t("reminders.dismiss")}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
      </aside>

      {/* Toast (hidden on Noor - it would float over the composer). Pure CSS
          slide-up like the drawer, so it animates on touch devices too. */}
      <div
        onClick={() => toast && navigate(toast)}
        className={cn(
          "fixed bottom-28 right-4 z-[75] flex max-w-[calc(100vw-2rem)] cursor-pointer items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-xl md:bottom-6 md:right-6 md:max-w-sm",
          "transition-[transform,opacity] duration-300 ease-out",
          toast && pathname !== "/noor"
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0"
        )}
      >
            <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{toast?.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground leading-snug">
                {toast?.body}
                {toast && toastMore > 0 ? ` Â· +${toastMore} ${t("reminders.more")}` : ""}
              </span>
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setToast(null);
              }}
              className="shrink-0 rounded-lg p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
              aria-label={t("reminders.dismiss")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
      </div>
    </>
  );
}

/** Sidebar bell - presentational; badge count comes from ReminderCenter. */
export function ReminderBell({ collapsed }: { collapsed: boolean }) {
  const { t } = useI18n();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const onCount = (e: Event) => setCount((e as CustomEvent<number>).detail || 0);
    window.addEventListener("orleia:reminders-count", onCount);
    return () => window.removeEventListener("orleia:reminders-count", onCount);
  }, []);

  return (
    <button
      onClick={() => { hapticTick(); window.dispatchEvent(new CustomEvent("orleia:toggle-reminders")); }}
      className={cn(
        "relative hidden md:flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground/60 transition-all duration-200 hover:text-foreground hover:bg-sidebar-hover",
        collapsed && "justify-center px-2"
      )}
      aria-label={t("reminders.bell")}
    >
      <Bell className="h-3.5 w-3.5 shrink-0" />
      {!collapsed && <span className="flex-1 text-left">{t("reminders.bell")}</span>}
      {count > 0 && (
        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}
