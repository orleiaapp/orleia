const CACHE_NAME = "orleia-v63";
const PRECACHE = ["/orleia-logo.png", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Allow the page to force-activate a waiting worker immediately
// (used by the client update flow in push-reminders.ts).
self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);
  const reqPath = url.pathname;

  // The worker itself must ALWAYS come from the network — caching it
  // would freeze updates (the exact stale-bundle bug this fixes).
  if (reqPath === "/sw.js" || reqPath === "/version.json") {
    e.respondWith(fetch(e.request));
    return;
  }

  // API requests — ALWAYS network, never cached (billing/usage must be live)
  if (reqPath.startsWith("/api/")) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Next.js RSC flight requests — pass through untouched, never cached by
  // the SW. The client router caches payloads in memory (per staleTimes);
  // serving SW-cached flights would risk stale payloads across deploys.
  if (
    e.request.headers.get("RSC") === "1" ||
    e.request.headers.get("Next-Router-Prefetch") === "1"
  ) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Development serves UNHASHED chunks that change on every edit — caching
  // them is how a stale bundle survives a reload. Network-only on localhost.
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    e.respondWith(fetch(e.request));
    return;
  }

  // Navigation requests (HTML pages) — ALWAYS go to network, never cache
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request));
    return;
  }

  // Immutable content-hashed build assets — cache-first is safe AND fast,
  // because a new deploy produces new hashed filenames (old ones die with
  // the old cache on activate).
  if (reqPath.startsWith("/_next/static/")) {
    e.respondWith(
      caches.match(e.request).then((r) =>
        r || fetch(e.request).then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return res;
        })
      )
    );
    return;
  }

  // Everything else (logo, manifest, misc) — NETWORK-FIRST with cache
  // fallback. This is the critical change: the old cache-first strategy
  // pinned stale copies of these forever and blocked deploys from
  // reaching the device.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

/* ── Push Notifications ──────────────────────────────────────── */
// ----------------------------------------------------------
// Push: never double-notify. If a window of this app is visible
// right now, the in-app Reminder Center owns the notification —
// swallow the system push. Only surface it when the app is
// closed, backgrounded, or no window exists (phone screen off).
// ----------------------------------------------------------
self.addEventListener("push", (e) => {
  if (!e.data) return;
  e.waitUntil((async () => {
    let payload;
    try {
      payload = e.data.json();
    } catch {
      payload = { title: "Orleia", body: e.data.text() };
    }
    try {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const visible = clients.some((c) => c.visibilityState === "visible");
      if (visible) return; // app is open on a screen — in-app surface handles it
    } catch {
      // if we cannot inspect clients, err on the side of notifying
    }
    const options = {
      body: payload.body || "",
      icon: "/orleia-logo.png",
      badge: "/orleia-logo.png",
      tag: payload.tag || "orleia-reminder",
      data: { href: payload.href || "/" },
      vibrate: [100, 50, 100],
      silent: false,
    };
    await self.registration.showNotification(payload.title || "Orleia", options);
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const href = e.notification.data?.href || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          client.navigate(href);
          return;
        }
      }
      return self.clients.openWindow(href);
    })
  );
});

self.addEventListener("sync", (e) => {
  if (e.tag === "orleia-sync") {
    e.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((c) => c.postMessage({ type: "sync-triggered" }));
      })
    );
  }
});
