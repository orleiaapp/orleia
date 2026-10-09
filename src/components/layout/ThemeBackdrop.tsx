"use client";

import { useEffect, useState } from "react";
import type { Theme } from "@/types";
import { storage } from "@/lib/storage";
import { Constellation } from "./Constellation";

/**
 * Global backdrop for the "constellation" theme: the same drifting starfield
 * from onboarding, painted behind the whole app. It fills the top ~64% of the
 * viewport and masks out to black before the content, so the sky reads as
 * depth (not wallpaper) and never fights text contrast. Renders nothing for
 * any other theme. Listens to the `data-theme-mode` attribute so a live theme
 * switch (onboarding, settings, ThemeToggle) shows/hides it without a reload.
 */
export function ThemeBackdrop() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const read = () => {
      const mode = document.documentElement.getAttribute("data-theme-mode");
      // Fall back to storage when the attribute isn't set yet (first paint).
      const t = mode ?? storage.getData()?.theme?.theme ?? "system";
      setActive(t === "constellation");
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme-mode"],
    });
    return () => observer.disconnect();
  }, []);

  if (!active) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[64%]"
      style={{
        maskImage: "linear-gradient(to bottom, black 55%, transparent)",
        WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent)",
      }}
    >
      <Constellation />
    </div>
  );
}
