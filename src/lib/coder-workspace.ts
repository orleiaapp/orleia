// ============================================================
// Coder workspace — real file/folder writes on the user's PC.
// Uses the File System Access API (Chromium: Chrome, Edge, Electron):
// the user grants ONE workspace folder; Coder's write_file / mkdir
// actions then write through a persisted handle. No server, no upload —
// bytes go straight from the browser to the disk the user picked.
// All APIs degrade gracefully where unsupported (Safari/Firefox: the
// action cards fall back to copy-to-clipboard).
// ============================================================

/** Proposed changes the model emits (contract documented in /api/coder). */
export type CoderAction =
  | { op: "write_file"; path: string; content: string }
  | { op: "mkdir"; path: string }
  | { op: "shell"; command: string };

const DB_NAME = "orleia-coder";
const STORE = "workspace";
const HANDLE_KEY = "dir";

type PermDir = FileSystemDirectoryHandle & {
  queryPermission?: (desc?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (desc?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
};

function supportsFS(): boolean {
  return typeof window !== "undefined" && typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbSet(value: unknown): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* handle won't persist — user re-picks */
  }
}

/** The granted workspace folder, if any (may lack permission this session). */
export async function getWorkspace(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsFS()) return null;
  return idbGet<FileSystemDirectoryHandle>();
}

/** Prompt for a workspace folder (must run inside a user gesture). */
export async function pickWorkspace(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsFS()) return null;
  try {
    const handle = await (window as unknown as {
      showDirectoryPicker: (opts?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker({ mode: "readwrite" });
    await idbSet(handle);
    return handle;
  } catch {
    return null; // user cancelled
  }
}

/** Ensure readwrite permission (re-requests per session — needs a gesture). */
export async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as PermDir;
  try {
    if (h.queryPermission) {
      if ((await h.queryPermission({ mode: "readwrite" })) === "granted") return true;
      if (h.requestPermission) return (await h.requestPermission({ mode: "readwrite" })) === "granted";
    }
    return true; // browsers without the permission API just work
  } catch {
    return false;
  }
}

/** Split a model-proposed path into safe segments (no .., no absolute). */
export function pathSegments(path: string): string[] | null {
  const parts = path.replace(/\\/g, "/").split("/").filter((p) => p && p !== ".");
  if (parts.length === 0 || parts.some((p) => p === "..")) return null;
  return parts;
}

/** Walk/create directories under root for all segments except the last. */
async function walkDirs(root: FileSystemDirectoryHandle, segments: string[]): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg, { create: true });
  }
  return dir;
}

/** Write content to `path` under the workspace folder (creating folders). */
export async function writeWorkspaceFile(
  root: FileSystemDirectoryHandle,
  path: string,
  content: string
): Promise<void> {
  const segments = pathSegments(path);
  if (!segments) throw new Error(`unsafe path: ${path}`);
  const name = segments[segments.length - 1];
  const dir = await walkDirs(root, segments.slice(0, -1));
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(content);
  await writable.close();
}

/** Create a directory (chain) under the workspace folder. */
export async function makeWorkspaceDir(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  const segments = pathSegments(path);
  if (!segments) throw new Error(`unsafe path: ${path}`);
  await walkDirs(root, segments);
}
