// Orleia update checker — polls /version.json periodically and fires events
// when a newer version is detected. No kill, no restart — just a notification.

const CURRENT_VERSION = "2.6.0";
const CHECK_INTERVAL_MS = 5 * 60_000; // every 5 minutes
const VERSION_URL = "/version.json";

let interval: ReturnType<typeof setInterval> | null = null;
let latestVersion: string | null = null;

export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}

export function getLatestVersion(): string | null {
  return latestVersion;
}

export function isUpdateAvailable(): boolean {
  if (!latestVersion) return false;
  return latestVersion !== CURRENT_VERSION;
}

async function checkVersion(): Promise<void> {
  try {
    const res = await fetch(VERSION_URL, { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json();
    if (json.version && json.version !== CURRENT_VERSION) {
      latestVersion = json.version;
      // Fire a custom event so the UI can react
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("orleia:update-available", {
            detail: { version: json.version },
          })
        );
      }
    }
  } catch {
    // Network error — ignore, will retry next interval
  }
}

export function startUpdateChecker(): void {
  if (typeof window === "undefined") return;
  if (interval) return;
  // Check immediately on start
  checkVersion();
  interval = setInterval(checkVersion, CHECK_INTERVAL_MS);
}

export function stopUpdateChecker(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
