"use client";

// ============================================================
// Undo toast — Apple-style forgiveness for destructive actions.
// showUndo(message, onUndo) displays a 5s toast with an Undo button;
// if the user taps it, onUndo restores the deleted item. Auto-expires.
// ============================================================

import { haptic } from "@/lib/haptics";

const UNDO_EVENT = "orleia:undo-toast";

export interface UndoToastPayload {
  message: string;
  onUndo?: () => void;
  /** Button label override (defaults to "Undo" in UndoToast). */
  label?: string;
}

export function showUndo(message: string, onUndo: () => UndoState | void): void {
  haptic.tick();
  window.dispatchEvent(new CustomEvent<UndoToastPayload>(UNDO_EVENT, {
    detail: { message, onUndo: onUndo as () => void },
  }));
}

/** Generic toast with a custom action button (same visual, no Undo semantics). */
export function showToast(message: string, actionLabel: string, onAction: () => void): void {
  haptic.tick();
  window.dispatchEvent(new CustomEvent<UndoToastPayload>(UNDO_EVENT, {
    detail: { message, onUndo: onAction, label: actionLabel },
  }));
}

/** Capture an item before deletion so it can be restored verbatim. */
export interface UndoState {
  restore: () => void;
  /** Optional side cleanup if the item was NOT restored. */
  discard?: () => void;
}

export const UNDO_TOAST_EVENT = UNDO_EVENT;
