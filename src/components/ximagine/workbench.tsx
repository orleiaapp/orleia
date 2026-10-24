"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, FileText, Menu, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { assemblePreview } from "@/lib/ximagine-ai";
import { loadAppData, saveAppData, type XApp, type XFile } from "@/lib/ximagine";

// The workbench is where a built app lives: a sandboxed live preview
// (opaque origin — generated code cannot see the page around it) and
// the raw files, fully editable. Edits are saved locally and apply on
// the next preview render. Nothing here has network access.

// ---------------- Long-press edit window helpers ----------------

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

type InspectState = {
  mode: "html" | "text" | "missing";
  tag: string;
  id: string;
  label: string;
  value: string;
  oldText?: string;
  file?: string;
};

/** Decide how (and whether) a long-pressed element can be edited in source. */
function classifyInspect(files: XFile[], tag: string, id: string, cls: string, html: string, text: string): InspectState {
  const firstClass = cls.trim().split(/\s+/)[0] || "";
  const label = `${tag}${id ? `#${id}` : firstClass ? `.${firstClass}` : ""}`;
  // 1) Element has an id → whole-element HTML edit (balanced-tag replace).
  if (id) {
    const f = files.find((x) => x.content.includes(`id="${id}"`));
    if (f) return { mode: "html", tag, id, label, value: html, file: f.path };
  }
  // 2) Its text appears exactly once across the app → plain text edit.
  const t = text.trim();
  if (t.length >= 2) {
    let hits = 0;
    let hitFile = "";
    for (const f of files) {
      const n = f.content.split(t).length - 1;
      if (n > 0) {
        hits += n;
        hitFile = f.path;
      }
    }
    if (hits === 1) return { mode: "text", tag, id: "", label, value: t, oldText: t, file: hitFile };
  }
  // 3) Not directly editable → point at the most likely file instead.
  let guess = files[0]?.path || "index.html";
  if (id) {
    const f = files.find((x) => x.content.includes(id));
    if (f) guess = f.path;
  } else if (firstClass) {
    const f = files.find((x) => x.content.includes(firstClass));
    if (f) guess = f.path;
  }
  return { mode: "missing", tag, id, label, value: html, file: guess };
}

/** Replace the source region of `<tag … id="…">…</tag>` with next,
 *  counting nesting so inner same-tag children don't truncate it. */
function replaceElement(src: string, tag: string, id: string, next: string): string | null {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<${tag}(?=[\\s>/])[^>]*\\bid="${esc}"[^>]*>`);
  const m = re.exec(src);
  if (!m) return null;
  const start = m.index;
  if (VOID_TAGS.has(tag) || m[0].endsWith("/>")) {
    return src.slice(0, start) + next + src.slice(start + m[0].length);
  }
  const openRe = new RegExp(`<${tag}(?=[\\s>/])`, "g");
  const closeRe = new RegExp(`</${tag}\\s*>`, "g");
  let depth = 1;
  let pos = start + m[0].length;
  while (depth > 0) {
    openRe.lastIndex = pos;
    closeRe.lastIndex = pos;
    const o = openRe.exec(src);
    const c = closeRe.exec(src);
    if (!c) return null;
    if (o && o.index < c.index) {
      depth++;
      pos = o.index + o[0].length;
    } else {
      depth--;
      pos = c.index + c[0].length;
    }
  }
  return src.slice(0, start) + next + src.slice(pos);
}

export function XimagineWorkbench({
  app,
  onRename,
  onFilesChange,
  onDelete,
  onClose,
  onMenu,
}: {
  app: XApp;
  onRename: (name: string) => void;
  onFilesChange: (files: XFile[]) => void;
  onDelete: () => void;
  onClose: () => void;
  onMenu?: () => void;
}) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [srcDoc, setSrcDoc] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(app.name);
  const [selectedPath, setSelectedPath] = useState(app.files[0]?.path || "index.html");
  const [inspect, setInspect] = useState<InspectState | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<Record<string, unknown> | null>(null);
  const filesRef = useRef<XFile[]>(app.files);
  filesRef.current = app.files;

  // Rebuild the preview document when entering Preview or when the app
  // changes underneath (new build / theme change). Editing on the Code
  // tab never reloads a running preview mid-thought.
  useEffect(() => {
    if (tab !== "preview") return;
    setSrcDoc(assemblePreview(app.files, app.id, loadAppData(app.id)));
  }, [tab, app.files, app.id, app.updatedAt, reloadKey]);

  // Persistence bridge from the sandboxed frame. Only accepts messages
  // that provably come from our own iframe and match this app id.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as {
        __xm?: number;
        app?: string;
        data?: unknown;
        tag?: string;
        id?: string;
        cls?: string;
        html?: string;
        text?: string;
      } | null;
      if (!d || typeof d.app !== "string" || d.app !== app.id) return;
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (d.__xm === 2 && typeof d.html === "string") {
        setInspect(classifyInspect(filesRef.current, d.tag || "div", d.id || "", d.cls || "", d.html, d.text || ""));
        return;
      }
      if (d.__xm !== 1) return;
      if (!d.data || typeof d.data !== "object" || Array.isArray(d.data)) return;
      dataRef.current = d.data as Record<string, unknown>;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (dataRef.current) saveAppData(app.id, dataRef.current);
      }, 250);
    };
    window.addEventListener("message", onMsg);
    return () => {
      window.removeEventListener("message", onMsg);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [app.id]);

  const selected = useMemo(
    () => app.files.find((f) => f.path === selectedPath) || app.files[0],
    [app.files, selectedPath]
  );

  const editFile = useCallback(
    (path: string, content: string) => {
      onFilesChange(app.files.map((f) => (f.path === path ? { ...f, content } : f)));
    },
    [app.files, onFilesChange]
  );

  const exportApp = () => {
    // Standalone single file: the bridge shim is omitted, so a downloaded
    // app uses the browser's real localStorage when opened directly.
    const html = assemblePreview(app.files, app.id, {}, { bridge: false });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${app.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "ximagine-app"}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const commitRename = () => {
    const name = nameDraft.trim().slice(0, 80);
    setRenaming(false);
    if (name && name !== app.name) onRename(name);
    else setNameDraft(app.name);
  };

  const closeInspect = () => {
    iframeRef.current?.contentWindow?.postMessage({ __xmCmd: "clear" }, "*");
    setInspect(null);
  };

  const applyInspect = (path: string, content: string) => {
    onFilesChange(app.files.map((f) => (f.path === path ? { ...f, content } : f)));
    setReloadKey((k) => k + 1);
    setInspect(null);
  };

  const saveInspect = () => {
    if (!inspect) return;
    const file = inspect.file ? app.files.find((f) => f.path === inspect.file) : undefined;
    if (file && inspect.mode === "html" && inspect.id) {
      const next = replaceElement(file.content, inspect.tag, inspect.id, inspect.value);
      if (next) return applyInspect(file.path, next);
    }
    if (
      file &&
      inspect.mode === "text" &&
      inspect.oldText &&
      file.content.split(inspect.oldText).length - 1 === 1
    ) {
      return applyInspect(file.path, file.content.replace(inspect.oldText, inspect.value));
    }
    // Source drifted since the press (or the match was ambiguous): fall back.
    setInspect({ ...inspect, mode: "missing" });
  };

  const openInFiles = () => {
    if (inspect?.file) setSelectedPath(inspect.file);
    setTab("code");
    setInspect(null);
  };

  return (
    <section className="flex h-full w-full min-w-0 flex-col bg-[#07070a] lg:flex-1">
      <header className="flex items-center gap-2 px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {renaming ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setNameDraft(app.name);
                  setRenaming(false);
                }
              }}
              className="w-44 rounded-lg border border-white/15 bg-white/[0.05] px-2 py-1 text-[13px] outline-none"
              aria-label="App name"
            />
          ) : (
            <button
              onDoubleClick={() => setRenaming(true)}
              onClick={() => setRenaming(true)}
              className="group flex min-w-0 items-center gap-1.5 text-left"
              title="Rename"
            >
              <span className="truncate text-[13px] font-medium">{app.name}</span>
              <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground/70" />
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onMenu && (
            <button
              onClick={onMenu}
              aria-label="Open menu"
              className="mr-1 rounded-full border border-white/10 bg-white/[0.05] p-1.5 text-muted-foreground/70 lg:hidden"
            >
              <Menu className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="flex rounded-full border border-white/10 bg-white/[0.03] p-0.5" role="tablist" aria-label="View">
            {(
              [
                { id: "preview" as const, label: "Preview", icon: Eye },
                { id: "code" as const, label: "Files", icon: FileText },
              ]
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                  tab === id ? "bg-white text-black" : "text-muted-foreground/70 hover:text-foreground"
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={exportApp}
            aria-label="Export app as a single HTML file"
            title="Export as .html"
            className="rounded-full border border-white/10 bg-white/[0.03] p-1.5 text-muted-foreground/70 transition-colors hover:bg-white/[0.08]"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Delete “${app.name}” and its saved data? This cannot be undone.`)) onDelete();
            }}
            aria-label="Delete app"
            title="Delete app"
            className="rounded-full border border-white/10 bg-white/[0.03] p-1.5 text-muted-foreground/70 transition-colors hover:border-red-400/40 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            aria-label="Close workbench"
            className="rounded-full border border-white/10 bg-white/[0.03] p-1.5 text-muted-foreground/70 transition-colors hover:bg-white/[0.08]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {tab === "preview" ? (
          <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1 bg-white p-2">
              <iframe
                key={`${app.id}-${reloadKey}`}
                ref={iframeRef}
                title={`${app.name} preview`}
                sandbox="allow-scripts allow-forms allow-modals"
                srcDoc={srcDoc}
                className="h-full w-full rounded-xl border border-black/10 bg-white"
              />
            </div>
            <div className="flex items-center justify-between border-t border-white/10 px-4 py-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/35">
                Sandboxed · no network · runs on this device
              </p>
              <button
                onClick={() => setReloadKey((k) => k + 1)}
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground/70 transition-colors hover:bg-white/[0.08]"
              >
                <RefreshCw className="h-3 w-3" /> Reload
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-full">
            <nav className="w-40 shrink-0 overflow-y-auto border-r border-white/10 p-2" aria-label="App files">
              {app.files.map((f) => (
                <button
                  key={f.path}
                  onClick={() => setSelectedPath(f.path)}
                  className={`block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                    selected?.path === f.path ? "bg-white/[0.09] text-foreground" : "text-muted-foreground/60 hover:bg-white/[0.04]"
                  }`}
                >
                  {f.path}
                </button>
              ))}
            </nav>
            <div className="flex min-w-0 flex-1 flex-col">
              {selected ? (
                <>
                  <textarea
                    value={selected.content}
                    onChange={(e) => editFile(selected.path, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Tab") {
                        e.preventDefault();
                        const ta = e.currentTarget;
                        const { selectionStart: s, selectionEnd: en } = ta;
                        const next = `${selected.content.slice(0, s)}  ${selected.content.slice(en)}`;
                        editFile(selected.path, next);
                        requestAnimationFrame(() => {
                          ta.selectionStart = ta.selectionEnd = s + 2;
                        });
                      }
                    }}
                    spellCheck={false}
                    className="h-full w-full resize-none bg-transparent p-4 text-[12.5px] leading-[1.6] text-foreground/90 outline-none"
                    aria-label={`Edit ${selected.path}`}
                  />
                  <p className="border-t border-white/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/35">
                    {selected.path} · {selected.content.split("\n").length} lines · saved locally
                  </p>
                </>
              ) : (
                <p className="p-6 text-center text-sm text-muted-foreground/50">No files yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
      {inspect && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Edit ${inspect.label}`}
        >
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0c0c10] p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[13px] font-medium">{inspect.label}</p>
              <button
                onClick={closeInspect}
                aria-label="Close editor"
                className="rounded-full p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {inspect.mode === "missing" ? (
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground/60">
                This one shows up in more than one place, so it can't be edited here directly — open the files to change it.
              </p>
            ) : (
              <textarea
                autoFocus
                value={inspect.value}
                onChange={(e) => setInspect({ ...inspect, value: e.target.value })}
                spellCheck={false}
                aria-label={inspect.mode === "html" ? `Edit ${inspect.label}` : `Edit text of ${inspect.label}`}
                className="mt-3 h-40 w-full resize-y rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[12.5px] leading-relaxed text-foreground outline-none focus:border-white/25"
              />
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={closeInspect}
                className="rounded-full border border-white/15 bg-white/[0.03] px-4 py-1.5 text-[12px] text-muted-foreground/70 transition-colors hover:bg-white/[0.08]"
              >
                {inspect.mode === "missing" ? "Close" : "Cancel"}
              </button>
              {inspect.mode === "missing" ? (
                <button
                  onClick={openInFiles}
                  className="rounded-full bg-white px-4 py-1.5 text-[12px] font-medium text-black transition-opacity hover:opacity-90"
                >
                  Open in Files
                </button>
              ) : (
                <button
                  onClick={saveInspect}
                  className="rounded-full bg-white px-4 py-1.5 text-[12px] font-medium text-black transition-opacity hover:opacity-90"
                >
                  Save
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
