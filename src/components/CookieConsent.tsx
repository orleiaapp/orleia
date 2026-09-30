"use client";

// ============================================================
// Cookie consent banner + granular preferences.
//
// Orleia uses no tracking cookies of its own — the only thing behind
// consent is Vercel Analytics (one aggregate, cookieless-adjacent
// counter). Legitimate interest is NOT enough under GDPR/ePrivacy
// for optional analytics: consent must be opt-in, which means the
// rejection option must be just as easy as acceptance.
//
// Three choices, all equal citizens:
//   - Accept  -> analytics allowed
//   - Reject  -> analytics never loads
//   - Customize -> per-category toggles, saved individually
// Nothing loads until analytics is explicitly allowed.
// Reopen preferences any time via the footer's "Cookie settings"
// (dispatches orleia:open-cookie-settings).
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "orleia.cookie-consent"; // "accepted" | "rejected" | "custom"

export function getCookieConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "accepted") return true;
    if (v === "custom") return window.localStorage.getItem(KEY + ".analytics") === "true";
    return false;
  } catch {
    return false;
  }
}

type Customizations = { analytics: boolean };

function readCustom(): Customizations {
  try {
    return { analytics: window.localStorage.getItem(KEY + ".analytics") === "true" };
  } catch {
    return { analytics: false };
  }
}

function writeChoice(choice: "accepted" | "rejected" | "custom", custom?: Customizations) {
  try {
    window.localStorage.setItem(KEY, choice);
    if (choice === "custom" && custom) {
      window.localStorage.setItem(KEY + ".analytics", String(custom.analytics));
    }
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("orleia:cookie-consent"));
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [custom, setCustom] = useState<Customizations>({ analytics: false });

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(KEY)) {
        // Small bottom banner after onboarding, not a first-screen takeover:
        // wait for the app to be interactive (or onboarding to finish) so
        // the welcome/age gate get the user's full attention first.
        const arm = () => setTimeout(() => setVisible(true), 800);
        let armed = false;
        const tryArm = () => {
          if (armed) return;
          if (document.querySelector("main")) { armed = true; arm(); }
        };
        tryArm();
        const iv = setInterval(tryArm, 1000);
        const onReady = () => { clearInterval(iv); if (!armed) { armed = true; arm(); } };
        window.addEventListener("orleia:app-ready", onReady, { once: true });
        setTimeout(() => { clearInterval(iv); onReady(); }, 20000);
        return () => { clearInterval(iv); window.removeEventListener("orleia:app-ready", onReady); };
      }
    } catch {
      /* storage blocked - stay hidden rather than nag every load */
    }
    // Footer "Cookie settings" reopens the banner in customize mode.
    const onOpen = () => {
      setCustom(readCustom());
      setCustomizing(true);
      setVisible(true);
    };
    window.addEventListener("orleia:open-cookie-settings", onOpen);
    return () => window.removeEventListener("orleia:open-cookie-settings", onOpen);
  }, []);

  const decide = (choice: "accepted" | "rejected") => {
    writeChoice(choice);
    setVisible(false);
  };

  const saveCustom = (c: Customizations) => {
    writeChoice("custom", c);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed bottom-3 left-3 right-3 md:left-auto md:right-6 md:max-w-sm z-[95] rounded-2xl border border-border bg-card/95 backdrop-blur p-4 shadow-xl"
    >
      {!customizing ? (
        <>
          <p className="text-xs font-semibold">We value your privacy</p>
          <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
            Your workspace stays on your device. No tracking or ads — the one
            optional item is an anonymous analytics counter. See our{" "}
            <Link href="/cookies" className="underline underline-offset-2 hover:text-foreground">
              Cookie Policy
            </Link>
            .
          </p>
          {/* Equal prominence: same size, same style, side by side. */}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => decide("rejected")}
              className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary transition-colors"
            >
              Reject
            </button>
            <button
              onClick={() => decide("accepted")}
              className="flex-1 rounded-lg border border-border bg-foreground text-background px-3 py-1.5 text-xs font-medium hover:opacity-90 transition-opacity"
            >
              Accept
            </button>
          </div>
          <button
            onClick={() => { setCustom(readCustom()); setCustomizing(true); }}
            className="mt-3 w-full text-center text-xs text-muted-foreground/70 underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Customize
          </button>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold mb-1.5">Cookie preferences</p>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            Strictly necessary storage (your workspace, saved on your device) is
            always on — Orleia cannot function without it. Everything else is
            optional and off by default.
          </p>

          {/* Strictly necessary — always on, disabled toggle */}
          <label className="flex items-start gap-3 rounded-xl border border-border p-3 mb-2 opacity-70">
            <input type="checkbox" checked disabled aria-label="Strictly necessary storage (always on)" className="mt-0.5 h-4 w-4 accent-current" />
            <span className="text-xs leading-relaxed">
              <span className="font-semibold block">Strictly necessary</span>
              Stores your workspace and preferences on your device. Always on.
            </span>
          </label>

          {/* Analytics — user controlled */}
          <label className="flex items-start gap-3 rounded-xl border border-border p-3 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={custom.analytics}
              onChange={(e) => setCustom((c) => ({ ...c, analytics: e.target.checked }))}
              aria-label="Anonymous analytics"
              className="mt-0.5 h-4 w-4 accent-current"
            />
            <span className="text-xs leading-relaxed">
              <span className="font-semibold block">Anonymous analytics</span>
              An aggregate, cookieless counter of page visits. No identifiers,
              no cross-site tracking. Off by default.
            </span>
          </label>

          <div className="flex gap-2.5">
            <button
              onClick={() => saveCustom({ ...custom, analytics: false })}
              className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-secondary transition-colors"
            >
              Save choices
            </button>
            <button
              onClick={() => saveCustom({ analytics: true })}
              className="flex-1 rounded-xl border border-border bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Allow all
            </button>
          </div>
          <button
            onClick={() => setCustomizing(false)}
            className="mt-3 w-full text-center text-xs text-muted-foreground/70 underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Back
          </button>
        </>
      )}
    </div>
  );
}
