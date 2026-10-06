"use client";

// ============================================================
// RoutePrefetcher — makes tab switches instant from the FIRST tap.
//
// Renders a hidden stack of <Link prefetch={true}> for every main
// route. Full prefetch = RSC payload AND the route's JS chunks,
// all at once, started as soon as the browser goes idle (no long
// sequential loop). Chunks are immutable-cached by the CDN, so
// this is a one-time cost per session that pays off on every
// tab switch afterwards.
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";

const ROUTES = [
  "/",
  "/habits",
  "/journal",
  "/tasks",
  "/noor",
  "/notes",
  "/deck",
  "/calendar",
  "/settings",
];

const idle = (cb: () => void): void => {
  if (typeof window === "undefined") return;
  if ("requestIdleCallback" in window) {
    (window as Window & { requestIdleCallback: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback(cb, { timeout: 1500 });
  } else {
    setTimeout(cb, 1200);
  }
};

export function RoutePrefetcher() {
  const [go, setGo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    idle(() => {
      if (!cancelled) setGo(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!go) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[-1] h-px w-px opacity-0"
    >
      {ROUTES.map((r) => (
        <Link
          key={r}
          href={r}
          prefetch={true}
          tabIndex={-1}
          className="absolute left-0 top-0 block h-px w-px"
        >
          {r}
        </Link>
      ))}
    </div>
  );
}
