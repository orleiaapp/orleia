import type { Theme } from "@/types";

/**
 * Whether a given theme mode paints the UI dark. "constellation" is a dark
 * theme (near-black sky with the starfield on top), so it resolves true.
 */
export function isDarkTheme(theme: Theme): boolean {
  if (theme === "dark" || theme === "constellation") return true;
  if (theme === "system" && typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return false;
}
