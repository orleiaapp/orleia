"use client";

// ============================================================
// UndoToast — renders the app-wide undo toast. Mounted once in
// ClientLayout; driven by showUndo() events from undo-toast.ts.
// 5s window, spring entrance, Undo button restores the item.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UndoToastPayload, UNDO_TOAST_EVENT } from "@/lib/undo-toast";
import { useI18n } from "@/lib/i18n";

export function UndoToast() {
  const { t } = useI18n();
  const [toast, setToast] = useState<UndoToastPayload | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<UndoToastPayload | null>(null);

  useEffect(() => {
    const on = (e: Event) => {
      const detail = (e as CustomEvent<UndoToastPayload>).detail;
      current.current = detail;
      setToast(detail);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        current.current?.onUndo; // no-op: expiry simply drops the state
        current.current = null;
        setToast(null);
      }, 5000);
    };
    window.addEventListener(UNDO_TOAST_EVENT, on);
    return () => {
      window.removeEventListener(UNDO_TOAST_EVENT, on);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const undo = () => {
    if (timer.current) clearTimeout(timer.current);
    const c = current.current;
    current.current = null;
    setToast(null);
    // The captured restore closure runs on the next tick so storage
    // mutations don't collide with the originating event handler.
    if (c?.onUndo) setTimeout(() => c.onUndo?.(), 0);
  };

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-[150] mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-2xl md:right-6 md:left-auto md:bottom-6 md:mx-0"
          role="status"
        >
          <p className="flex-1 truncate text-sm text-foreground">{toast.message}</p>
          <button
            onClick={undo}
            className="shrink-0 rounded-full bg-primary-500/15 px-3 py-1 text-sm font-semibold text-primary-500 transition-all hover:bg-primary-500/25 active:scale-95"
          >
            {toast.label || t("common.undo")}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
