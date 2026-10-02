// ============================================================
// Noor Anywhere — global Noor pipeline.
//
// Ask Noor from OUTSIDE the Noor page (global search, keyboard,
// future surfaces). The reply streams at module level, persists
// into conversation storage, executes actions (chatStream runs
// the ORLEIA_ACTION interceptor), and — if you are away from the
// Noor page or the tab is hidden — arrives as a system
// notification. Page-initiated sends keep their own live UI and
// only borrow notifyNoorReply() for the away case.
// ============================================================

import { chatStream, NoorCapError } from "@/lib/ai-stream";
import { MODEL_PROFILES, DEFAULT_MODEL } from "@/lib/ai-models";
import type { AIMessage, AIModel } from "@/types";
import { storage } from "@/lib/storage";

/** Set by the Noor page on mount/unmount so the runner knows who owns the UI. */
export const noorPresence = { mounted: false };

const BG_EVENT = "orleia:noor-bg";
export interface NoorBgEvent {
  type: "start" | "done";
  convId: string;
  preview?: string;
}

function emit(e: NoorBgEvent): void {
  try {
    window.dispatchEvent(new CustomEvent(BG_EVENT, { detail: e }));
  } catch {
    /* non-browser */
  }
}

export function subscribeNoorBg(fn: (e: NoorBgEvent) => void): () => void {
  const h = (ev: Event) => fn((ev as CustomEvent<NoorBgEvent>).detail);
  window.addEventListener(BG_EVENT, h);
  return () => window.removeEventListener(BG_EVENT, h);
}

function safeModel(stored?: string): AIModel {
  return stored && stored in MODEL_PROFILES ? (stored as AIModel) : DEFAULT_MODEL;
}

function stripMd(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, " ... ")
    .replace(/[*_#>`~[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Delivery for a landed background reply: ALWAYS fires the in-app toast
 * (no permissions needed); adds a system notification only when the tab
 * is hidden AND the user has granted notification permission.
 */
export function notifyNoorReply(content: string, convId?: string): void {
  try {
    window.dispatchEvent(
      new CustomEvent("orleia:noor-toast", {
        detail: { preview: stripMd(content).slice(0, 160) || "Here is your answer.", convId },
      })
    );
  } catch {
    /* non-browser */
  }
  try {
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted" &&
      document.hidden
    ) {
      new Notification("Noor", {
        body: stripMd(content).slice(0, 180) || "Here is your answer.",
        icon: "/orleia-logo.png",
        tag: "noor-reply",
      });
    }
  } catch {
    /* notifications unavailable */
  }
}

let askBusy = false;

/** Ask Noor from anywhere OUTSIDE the Noor page. */
export async function askNoorAnywhere(text: string): Promise<void> {
  const q = text.trim();
  if (!q) return;
  if (askBusy) {
    notifyNoorReply("Give me a second - still answering the previous question.");
    return;
  }
  askBusy = true;
  try {
    // Most recent conversation first: the reply lands where the user will
    // actually look when they open Noor.
    const convs = [...storage.getConversations()].sort((a, b) =>
      (b.updatedAt || "").localeCompare(a.updatedAt || "")
    );
    const conv = convs.length ? convs[0] : storage.createConversation();
    const convId = conv.id;
    const model = safeModel(storage.getData().selectedModel);

    storage.addMessage(convId, { role: "user", content: q, model });
    emit({ type: "start", convId });

    const history = (storage.getConversations().find((c) => c.id === convId)?.messages ?? []) as AIMessage[];

    let reply: string | null = null;
    try {
      reply = await chatStream(q, history, model, { onToken: () => {} });
    } catch (e) {
      if (e instanceof NoorCapError) {
        const cap = storage.addMessage(convId, {
          role: "assistant",
          content:
            "⭐ You've used all of today's free Noor messages. The cap resets at midnight — or upgrade in Settings → Billing for more.",
          model,
        });
        emit({ type: "done", convId, preview: cap?.content });
        notifyNoorReply("Daily limit reached — resets at midnight, or upgrade in Settings → Billing.", convId);
        return;
      }
      reply = null;
    }
    const content = reply || "I could not reach my models just now - try again in a moment.";
    storage.addMessage(convId, { role: "assistant", content, model });
    if (conv.title === "New Chat") {
      const c = storage.getData().aiConversations.find((x) => x.id === convId);
      if (c && c.title === "New Chat") {
        c.title = q.slice(0, 40);
        storage.saveData();
      }
    }
    emit({ type: "done", convId, preview: content });
    notifyNoorReply(content, convId);
  } finally {
    askBusy = false;
  }
}

let bootstrapped = false;

/** Idempotent; call once from the client layout. */
export function ensureNoorBackground(): void {
  if (bootstrapped || typeof window === "undefined") return;
  bootstrapped = true;
  window.addEventListener("orleia:noor-ask", (ev) => {
    const text = String((ev as CustomEvent<string>).detail || "");
    // The mounted, idle Noor page handles its own ask for a live stream.
    if (noorPresence.mounted) return;
    void askNoorAnywhere(text);
  });
}
