"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, Pencil, RefreshCw, Trash2, X, FileCode2 } from "lucide-react";
import { assemblePreview } from "@/lib/ximagine-ai";
import { loadAppData, saveAppData, type XApp, type XFile } from "@/lib/ximagine";
import { ThemePicker } from "./chat";

// The workbench is where a built app lives: a sandboxed live preview
// (opaque origin — generated code cannot see the page around it) and
// the raw files, fully editable. Edits are saved locally and apply on
// the next preview render. Nothing here has network access.

export function XimagineWorkbench({
  app,
  onRename,
  onThemeChange,
  onFilesChange,
  onDelete,
  onClose,
}: {
  app: XApp;
  onRename: (name: string) => void;
  onThemeChange: (t: XApp["theme"]) => void;
  onFilesChange: (files: XFile[]) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [srcDoc, setSrcDoc] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(app.name);
  const [selectedPath, setSelectedPath] = useState(app.files[0]?.path || "index.html");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<Record<string, unknown> | null>(null);

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
      const d = e.data as { __xm?: number; app?: string; data?: unknown } | null;
      if (!d || d.__xm !== 1 || typeof d.app !== "string" || d.app !== app.id) return;
      if (e.source !== iframeRef.current?.contentWindow) return;
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

  return (
    <section className="flex h-full w-full min-w-0 flex-col border-l border-white/10 bg-[#07070a] lg:w-[46%]">
      <header className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
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
          <ThemePicker value={app.theme} onChange={onThemeChange} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="flex rounded-full border border-white/10 bg-white/[0.03] p-0.5" role="tablist" aria-label="View">
            {(
              [
                { id: "preview" as const, label: "Preview", icon: Eye },
                { id: "code" as const, label: "Code", icon: FileCode2 },
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
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/35">
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
                  className={`block w-full truncate rounded-lg px-2.5 py-1.5 text-left font-mono text-[12px] transition-colors ${
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
                    className="h-full w-full resize-none bg-transparent p-4 font-mono text-[12.5px] leading-[1.6] text-foreground/90 outline-none"
                    aria-label={`Edit ${selected.path}`}
                  />
                  <p className="border-t border-white/10 px-4 py-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/35">
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
    </section>
  );
}
