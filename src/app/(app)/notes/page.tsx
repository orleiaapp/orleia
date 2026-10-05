"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Search,
  Pin,
  Archive,
  Tag,
  Folder,
  FolderPlus,
  ChevronRight,
  MoreHorizontal,
  FileText,
  ArrowLeft,
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Hash,
  X,
  Check,
  Eye,
  Code2,
  ListTodo,
  Quote,
  CaseSensitive,
  Star,
  Download,
  Share2,
} from "lucide-react";
import { useLongPress } from "@/components/ui/long-press";
import { shareText, noteToText } from "@/lib/share";
import { showUndo } from "@/lib/undo-toast";
import { saveAs } from "file-saver";
import { markdownToHtml } from "@/lib/notes/markdown";
import { storage } from "@/lib/storage";
import { useI18n } from "@/lib/i18n";
import { cn, generateId } from "@/lib/utils";
import { Note, NoteFolder, NoteTag } from "@/types";

// ============================================================
// Helpers
// ============================================================

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function extractPreview(content: string, maxLen = 80): string {
  const text = content
    .replace(/<[^>]*>/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/\*([^*]*)\*/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^[-*]\s+\[[ xX]\]\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/==([^=]*)==/g, "$1")
    .replace(/\n+/g, " ")
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

// ============================================================
// Main Component
// ============================================================

export default function NotesPage() {
  const { t } = useI18n();
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [tags, setTags] = useState<NoteTag[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null); // null = all
  const [showNotePreview, setShowNotePreview] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);
  const [showMobileList, setShowMobileList] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; noteId: string } | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showTagPicker, setShowTagPicker] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [showNewTag, setShowNewTag] = useState(false);
  // Apple-Notes-style editor chrome: formatting row is hidden until the
  // Aa button is tapped; secondary actions live in the (…) menu.
  const [showFmtRow, setShowFmtRow] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Touch device detection (for the keyboard-following bottom toolbar)
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(typeof window !== "undefined" && "ontouchstart" in window);
  }, []);

  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Load data
  const refresh = useCallback(() => {
    setNotes(storage.getNotes());
    setFolders(storage.getData().noteFolders);
    setTags(storage.getData().noteTags);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Filtered notes
  const filteredNotes = useMemo(() => {
    let result = notes.filter((n) => !n.archived);
    if (activeFolder) {
      result = result.filter((n) => n.folderId === activeFolder);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q)
      );
    }
    // Pinned first, then by updatedAt
    return result.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [notes, activeFolder, searchQuery]);

  // Create note
  const createNote = useCallback(() => {
    const note = storage.createNote({
      title: "",
      content: "",
      contentHtml: "",
      folderId: activeFolder,
      projectId: null, tags: [],
      pinned: false,
      archived: false,
      favorite: false,
    });
    refresh();
    setSelectedNote(note);
    setShowMobileList(false);
    setTimeout(() => titleRef.current?.focus(), 100);
  }, [activeFolder, refresh]);

  // Update note content
  const updateNoteContent = useCallback(
    (id: string, updates: Partial<Note>) => {
      storage.updateNote(id, updates);
      refresh();
      // Update selected if it's the same note
      setSelectedNote((prev) =>
        prev && prev.id === id ? { ...prev, ...updates } : prev
      );
    },
    [refresh]
  );

  // Delete note — with undo (captures the note so restore is verbatim)
  const deleteNote = useCallback(
    (id: string) => {
      const snapshot = storage.getData();
      const noteSnapshot = snapshot.notes.find((n) => n.id === id);
      storage.deleteNote(id);
      if (selectedNote?.id === id) setSelectedNote(null);
      refresh();
      if (noteSnapshot) {
        showUndo(t("notes.deletedToast") || "Note deleted", () => {
          const d = storage.getData();
          d.notes.push(noteSnapshot);
          storage.saveData();
          refresh();
        });
      }
    },
    [selectedNote, refresh, t]
  );

  // Toggle pin
  const noteLongPress = useLongPress();
  useEffect(() => {
    if (noteLongPress.menu) {
      setContextMenu({ x: noteLongPress.menu.x, y: noteLongPress.menu.y, noteId: noteLongPress.menu.id });
      noteLongPress.closeMenu();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteLongPress.menu?.id, noteLongPress.menu?.x, noteLongPress.menu?.y]);
  const togglePin = useCallback(
    (id: string) => {
      const note = notes.find((n) => n.id === id);
      if (note) updateNoteContent(id, { pinned: !note.pinned });
    },
    [notes, updateNoteContent]
  );

  // Toggle favorite (star)
  const toggleFavorite = useCallback(
    (id: string) => {
      const note = notes.find((n) => n.id === id);
      if (note) updateNoteContent(id, { favorite: !note.favorite });
    },
    [notes, updateNoteContent]
  );

  /* ---- Markdown toolbar: wrap selection or insert prefix ---- */
  const applyMd = useCallback((prefix: string, wrap?: string) => {
    const ta = contentRef.current;
    if (!ta || !selectedNote) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = selectedNote.content;
    const sel = text.slice(start, end);
    let next: string;
    let cursor: number;
    if (wrap) {
      const body = sel || wrap;
      next = text.slice(0, start) + prefix + body + prefix + text.slice(end);
      cursor = start + prefix.length + body.length + prefix.length;
    } else {
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      next = text.slice(0, lineStart) + prefix + text.slice(lineStart);
      cursor = end + prefix.length;
    }
    updateNoteContent(selectedNote.id, { content: next, contentHtml: next });
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(cursor, cursor);
    });
  }, [selectedNote, updateNoteContent]);

  // Export note as Markdown
  const exportNoteMd = useCallback(() => {
    if (!selectedNote) return;
    const md = `# ${selectedNote.title}\n\n${selectedNote.content}`;
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    saveAs(blob, `${selectedNote.title || "note"}.md`);
  }, [selectedNote]);

  // Archive note
  const archiveNote = useCallback(
    (id: string) => {
      updateNoteContent(id, { archived: true });
      if (selectedNote?.id === id) setSelectedNote(null);
    },
    [selectedNote, updateNoteContent]
  );

  // Folder CRUD
  const createFolder = useCallback(() => {
    if (!newFolderName.trim()) return;
    const folder: NoteFolder = {
      id: generateId(),
      name: newFolderName.trim(),
      parentId: null,
      createdAt: new Date().toISOString(),
    };
    const data = storage.getData();
    data.noteFolders.push(folder);
    storage.saveData();
    setNewFolderName("");
    setShowNewFolder(false);
    refresh();
  }, [newFolderName, refresh]);

  const deleteFolder = useCallback(
    (id: string) => {
      // Move notes to unfiled
      const data = storage.getData();
      data.notes.forEach((n) => {
        if (n.folderId === id) n.folderId = null;
      });
      data.noteFolders = data.noteFolders.filter((f) => f.id !== id);
      storage.saveData();
      if (activeFolder === id) setActiveFolder(null);
      refresh();
    },
    [activeFolder, refresh]
  );

  const renameFolder = useCallback(() => {
    if (renamingFolder && renameValue.trim()) {
      const data = storage.getData();
      const folder = data.noteFolders.find((f) => f.id === renamingFolder);
      if (folder) folder.name = renameValue.trim();
      storage.saveData();
    }
    setRenamingFolder(null);
  }, [renamingFolder, renameValue]);

  // Tag management
  const addTagToNote = useCallback(
    (noteId: string, tagId: string) => {
      const note = notes.find((n) => n.id === noteId);
      if (note && !note.tags.includes(tagId)) {
        updateNoteContent(noteId, { tags: [...note.tags, tagId] });
      }
      setShowTagPicker(null);
    },
    [notes, updateNoteContent]
  );

  const removeTagFromNote = useCallback(
    (noteId: string, tagId: string) => {
      const note = notes.find((n) => n.id === noteId);
      if (note) {
        updateNoteContent(noteId, { tags: note.tags.filter((t) => t !== tagId) });
      }
    },
    [notes, updateNoteContent]
  );

  const createTag = useCallback(() => {
    if (!newTagName.trim()) return;
    const tag: NoteTag = {
      id: generateId(),
      name: newTagName.trim(),
      color: `hsl(${Math.random() * 360}, 60%, 50%)`,
    };
    const data = storage.getData();
    data.noteTags.push(tag);
    storage.saveData();
    setNewTagName("");
    setShowNewTag(false);
    refresh();
  }, [newTagName, refresh]);

  // Word count

  // Close context menu
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  // Close editor popovers (More menu, tag picker) on any outside click
  useEffect(() => {
    if (!moreOpen && !showTagPicker) return;
    const close = () => {
      setMoreOpen(false);
      setShowTagPicker(null);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [moreOpen, showTagPicker]);

  // Reset editor chrome when switching notes
  useEffect(() => {
    setMoreOpen(false);
    setShowFmtRow(false);
    setShowTagPicker(null);
  }, [selectedNote?.id]);

  // Publish the mobile keyboard overlap so the bottom toolbar rides above
  // it (Apple-Notes behaviour) — Desktop Safari already co-insets.
  useEffect(() => {
    if (!isTouch) {
      document.documentElement.style.removeProperty("--orleia-notes-kb");
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--orleia-notes-kb", `${Math.round(kb)}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.documentElement.style.removeProperty("--orleia-notes-kb");
    };
  }, [isTouch]);

  // ============================================================
  // Render
  // ============================================================

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      /* Full-screen takeover. On desktop (md+) it starts RIGHT of the
         app sidebar (see .orleia-notes-root in globals.css): the sidebar
         is the only exit on desktop — there is no floating top bar there,
         so covering it softlocked users inside notes. On mobile the card's
         z-50 already caps this below the floating top bar, so inset-0
         stays full-bleed. */
      className="orleia-notes-root fixed inset-0 z-[90] flex flex-col bg-background"
    >
      {/* No page-level chrome: the top bar row belongs to the app
          (hamburger / search / settings / bell), compose is the glass
          squircle on the title line, and all note actions live in the
          editor's bottom toolbar. */}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: Folders + Notes List */}
        <AnimatePresence>
          {showSidebar && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="hidden md:flex flex-col border-r border-border overflow-hidden shrink-0"
              style={{ width: 280 }}
            >
              {/* Search — always visible at the top of the list, like Apple Notes */}
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("notes.search")}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Folders */}
              <div className="border-b border-border">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    {t("notes.folders")}
                  </span>
                  <button
                    onClick={() => setShowNewFolder(true)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <FolderPlus className="h-3 w-3" />
                  </button>
                </div>

                {/* All Notes */}
                <button
                  onClick={() => setActiveFolder(null)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors",
                    activeFolder === null
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span className="flex-1 text-left">{t("notes.allNotes")}</span>
                  <span className="text-[11px] text-muted-foreground">{notes.length}</span>
                </button>

                {/* Folder items */}
                {folders.map((folder) => (
                  <div key={folder.id} className="group flex items-center">
                    {renamingFolder === folder.id ? (
                      <div className="flex w-full items-center gap-2 px-3 py-1.5">
                        <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={renameFolder}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") renameFolder();
                            if (e.key === "Escape") setRenamingFolder(null);
                          }}
                          className="flex-1 bg-transparent text-sm outline-none"
                        />
                      </div>
                    ) : (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveFolder(folder.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") setActiveFolder(folder.id);
                        }}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-sm transition-colors",
                          activeFolder === folder.id
                            ? "bg-muted font-medium text-foreground"
                            : "text-muted-foreground hover:bg-muted/50"
                        )}
                      >
                        <Folder className="h-3.5 w-3.5" />
                        <span className="flex-1 text-left truncate">{folder.name}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingFolder(folder.id);
                            setRenameValue(folder.name);
                          }}
                          className="hidden group-hover:block rounded p-0.5 hover:bg-accent"
                        >
                          <MoreHorizontal className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(t("notes.deleteFolderConfirm"))) deleteFolder(folder.id);
                          }}
                          className="hidden group-hover:block rounded p-0.5 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {/* New folder input */}
                {showNewFolder && (
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <input
                      autoFocus
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") createFolder();
                        if (e.key === "Escape") setShowNewFolder(false);
                      }}
                      placeholder={t("notes.newFolder")}
                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                )}
              </div>

              {/* Notes list */}
              <div className="flex-1 overflow-y-auto">
                {filteredNotes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <FileText className="mb-3 h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">{t("notes.noNotes")}</p>
                    <p className="text-xs text-muted-foreground/60">{t("notes.noNotesHint")}</p>
                  </div>
                ) : (
                  filteredNotes.map((note) => (
                    <button
                      key={note.id}
                      onClick={() => {
                        setSelectedNote(note);
                        setShowMobileList(false);
                      }}
                      {...(() => { const { onContextMenu: _omit, ...p } = noteLongPress.longPressProps(note.id); return p; })()}
                      className={cn(
                        "flex w-full flex-col gap-1 border-b border-border/50 px-3 py-3 text-left transition-colors hover:bg-muted/50",
                        selectedNote?.id === note.id && "bg-muted"
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {note.pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                        <span className="text-sm font-medium text-foreground truncate">
                          {note.title || t("notes.untitled")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {extractPreview(note.content)}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
                        <span>{formatDate(note.updatedAt)}</span>
                        {note.tags.length > 0 && (
                          <>
                            <span>·</span>
                            <span>{note.tags.length} tag{note.tags.length > 1 ? "s" : ""}</span>
                          </>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Editor Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedNote ? (
            <>
              {/* Apple-style large title: big heading, date line, tags —
                  then straight into the body. No toolbars in between.
                  Back lives in the bottom toolbar (out of the hamburger's
                  way), title sits below the top-bar row. */}
              <div className="px-5 pb-1 pt-[calc(env(safe-area-inset-top,0px)+5.5rem)] md:px-8 md:pt-16">
                <input
                  ref={titleRef}
                  value={selectedNote.title}
                  onChange={(e) =>
                    updateNoteContent(selectedNote.id, { title: e.target.value })
                  }
                  placeholder={t("notes.titlePlaceholder")}
                  className="w-full bg-transparent text-2xl font-bold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40 md:text-3xl"
                />
                <p className="mt-1.5 text-[11px] font-medium text-muted-foreground/60">
                  {selectedNote.pinned ? "📌 " : ""}{t("notes.lastEdited")} {formatDate(selectedNote.updatedAt)}
                </p>
                {selectedNote.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {selectedNote.tags.map((tagId) => {
                      const tag = tags.find((tg) => tg.id === tagId);
                      if (!tag) return null;
                      return (
                        <span
                          key={tagId}
                          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground"
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.name}
                          <button
                            onClick={() => removeTagFromNote(selectedNote.id, tagId)}
                            className="ml-0.5 rounded-full hover:bg-background/50"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Formatting row — hidden by default. Apple Notes keeps a
                  single Aa control; tapping it reveals the formatters
                  between title and body instead of crowding the top. */}
              <AnimatePresence initial={false}>
                {showFmtRow && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-wrap items-center gap-0.5 px-5 pb-2 pt-3 md:px-8" role="toolbar" aria-label="Formatting">
                {[
                  { icon: Bold, label: "Bold", run: () => applyMd("**", "bold") },
                  { icon: Italic, label: "Italic", run: () => applyMd("*", "italic") },
                  { icon: Heading1, label: "Heading 1", run: () => applyMd("# ") },
                  { icon: Heading2, label: "Heading 2", run: () => applyMd("## ") },
                  { icon: List, label: "Bullet list", run: () => applyMd("- ") },
                  { icon: ListOrdered, label: "Numbered list", run: () => applyMd("1. ") },
                  { icon: ListTodo, label: "Checklist", run: () => applyMd("- [ ] ") },
                  { icon: Quote, label: "Quote", run: () => applyMd("> ") },
                  { icon: Code2, label: "Code", run: () => applyMd("`", "code") },
                ].map((b) => (
                  <button
                    key={b.label}
                    onClick={b.run}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title={b.label}
                    aria-label={b.label}
                  >
                    <b.icon className="h-4 w-4" />
                  </button>
                ))}
                <div className="flex-1" />
                <button
                  onClick={() => setShowNotePreview((v) => !v)}
                  className={cn("rounded-lg p-1.5 transition-colors", showNotePreview ? "bg-primary-500/10 text-primary-500" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
                  title="Preview"
                  aria-pressed={showNotePreview}
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={exportNoteMd}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Export as Markdown"
                >
                  <Download className="h-4 w-4" />
                </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Content */}
              <div className={cn("flex-1 overflow-y-auto px-5 pb-28 pt-1 md:px-8", showNotePreview && "grid grid-cols-1 gap-6 md:grid-cols-2")}>
                <textarea
                  ref={contentRef}
                  value={selectedNote.content}
                  onChange={(e) =>
                    updateNoteContent(selectedNote.id, {
                      content: e.target.value,
                      contentHtml: e.target.value,
                    })
                  }
                  placeholder={t("notes.contentPlaceholder")}
                  className="notes-editor min-h-[400px] w-full resize-none bg-transparent text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/40"
                />
                {showNotePreview && (
                  <div className="min-h-[400px] border-l border-border pl-6">
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: markdownToHtml(selectedNote.content) }}
                    />
                  </div>
                )}
              </div>

              {/* Apple-style bottom toolbar: scroll content underneath it
                  (sits on a safe-area-aware gradient, no hard border). */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30">
                <div className="h-6 bg-gradient-to-t from-background via-background/80 to-transparent" />
                <div
                  className="pointer-events-auto flex items-center gap-1 bg-background/90 px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl"
                  style={{ marginBottom: "calc(-1 * var(--orleia-notes-kb, 0px))" }}
                >
                  {/* Back to the list — lives HERE so the top-left stays
                      free for the app's hamburger (no overlap). */}
                  <button
                    onClick={() => setShowMobileList(true)}
                    className="rounded-lg p-2 text-muted-foreground/80 transition-colors hover:bg-muted hover:text-foreground md:hidden"
                    aria-label={t("notes.allNotes")}
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setShowFmtRow((v) => !v)}
                    className={cn(
                      "rounded-lg p-2 transition-colors",
                      showFmtRow ? "text-primary" : "text-muted-foreground/80 hover:bg-muted hover:text-foreground"
                    )}
                    title="Formatting"
                    aria-pressed={showFmtRow}
                  >
                    <CaseSensitive className="h-5 w-5" />
                  </button>
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowTagPicker(showTagPicker === selectedNote.id ? null : selectedNote.id);
                      }}
                      className={cn(
                        "rounded-lg p-2 transition-colors",
                        showTagPicker === selectedNote.id ? "text-primary" : "text-muted-foreground/80 hover:bg-muted hover:text-foreground"
                      )}
                      title={t("notes.tags")}
                    >
                      <Tag className="h-5 w-5" />
                    </button>
                    <AnimatePresence>
                      {showTagPicker === selectedNote.id && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}                        className="absolute bottom-full left-0 z-50 mb-2 w-48 overflow-hidden rounded-2xl border border-border bg-popover p-1 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                          <div className="max-h-40 overflow-y-auto p-1">
                            {tags.map((tag) => (
                              <button
                                key={tag.id}
                                onClick={() => {
                                  if (selectedNote.tags.includes(tag.id)) {
                                    removeTagFromNote(selectedNote.id, tag.id);
                                  } else {
                                    addTagToNote(selectedNote.id, tag.id);
                                  }
                                }}
                                className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                              >
                                <div
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: tag.color }}
                                />
                                <span className="flex-1 text-left">{tag.name}</span>
                                {selectedNote.tags.includes(tag.id) && (
                                  <Check className="h-3 w-3 text-primary" />
                                )}
                              </button>
                            ))}
                          </div>
                          <div className="border-t border-border p-1">
                            {showNewTag ? (
                              <div className="flex items-center gap-1 px-2 py-1">
                                <input
                                  autoFocus
                                  value={newTagName}
                                  onChange={(e) => setNewTagName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") createTag();
                                    if (e.key === "Escape") setShowNewTag(false);
                                  }}
                                  placeholder={t("notes.newTag")}
                                  className="flex-1 bg-transparent text-sm outline-none"
                                />
                              </div>
                            ) : (
                              <button
                                onClick={() => setShowNewTag(true)}
                                className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
                              >
                                <Plus className="h-3 w-3" />
                                {t("notes.newTag")}
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="flex-1" />
                  <button
                    onClick={() => {
                      if (confirm(t("notes.deleteNoteConfirm"))) deleteNote(selectedNote.id);
                    }}
                    className="rounded-lg p-2 text-muted-foreground/80 transition-colors hover:bg-destructive/10 hover:text-destructive"
                    title={t("notes.deleteNote", "Delete")}
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                  <button
                    onClick={(e) => {
                      // stopPropagation: the document-level outside-click
                      // closer must not see this tap (a bubbling click
                      // closed the menu the same instant it opened).
                      e.stopPropagation();
                      setMoreOpen((v) => !v);
                    }}
                    className={cn(
                      "rounded-lg p-2 transition-colors",
                      moreOpen ? "text-primary" : "text-muted-foreground/80 hover:bg-muted hover:text-foreground"
                    )}
                    title={t("common.more", "More")}
                    aria-expanded={moreOpen}
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </button>
                  <AnimatePresence>
                    {moreOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        className="absolute bottom-full right-3 z-50 mb-2 w-52 overflow-hidden rounded-2xl border border-border bg-popover p-1 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => {
                            togglePin(selectedNote.id);
                            setMoreOpen(false);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
                        >
                          <Pin className={cn("h-4 w-4", selectedNote.pinned && "fill-current text-primary")} />
                          {selectedNote.pinned ? t("notes.unpin") : t("notes.pin")}
                        </button>
                        <button
                          onClick={() => {
                            toggleFavorite(selectedNote.id);
                            setMoreOpen(false);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
                        >
                          <Star className={cn("h-4 w-4", selectedNote.favorite && "fill-current text-amber-400")} />
                          {selectedNote.favorite ? t("notes.unfavorite", "Unfavorite") : t("notes.favorite", "Favorite")}
                        </button>
                        {folders.length > 0 && (
                          <>
                            <div className="border-t border-border" />
                            <button
                              onClick={() => updateNoteContent(selectedNote.id, { folderId: null })}
                              className={cn(
                                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted",
                                !selectedNote.folderId && "bg-muted"
                              )}
                            >
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              {t("notes.allNotes")}
                            </button>
                            {folders.map((f) => (
                              <button
                                key={f.id}
                                onClick={() => updateNoteContent(selectedNote.id, { folderId: f.id })}
                                className={cn(
                                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted",
                                  selectedNote.folderId === f.id && "bg-muted"
                                )}
                              >
                                <Folder className="h-4 w-4 text-muted-foreground" />
                                <span className="truncate">{f.name}</span>
                              </button>
                            ))}
                          </>
                        )}
                        <div className="border-t border-border" />
                        <button
                          onClick={() => {
                            updateNoteContent(selectedNote.id, { archived: !selectedNote.archived });
                            setMoreOpen(false);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
                        >
                          <Archive className={cn("h-4 w-4 text-muted-foreground", selectedNote.archived && "text-amber-500")} />
                          {selectedNote.archived ? t("notes.unarchive") : t("notes.archive")}
                        </button>
                        <button
                          onClick={() => {
                            shareText(selectedNote.title || t("notes.untitled"), noteToText(selectedNote.title || t("notes.untitled"), selectedNote.contentHtml || ""));
                            setMoreOpen(false);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
                        >
                          <Share2 className="h-4 w-4 text-muted-foreground" />
                          {t("common.share")}
                        </button>
                        <button
                          onClick={() => {
                            exportNoteMd();
                            setMoreOpen(false);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
                        >
                          <Download className="h-4 w-4 text-muted-foreground" />
                          Markdown
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <FileText className="h-7 w-7 text-muted-foreground/50" />
              </div>
              <h3 className="mb-1 text-lg font-medium text-foreground">
                {t("notes.emptyTitle")}
              </h3>
              <p className="mb-4 text-sm text-muted-foreground">
                {t("notes.emptyHint")}
              </p>
              <button
                onClick={createNote}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                {t("notes.newNote")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile notes list (overlay) */}
      <AnimatePresence>
        {showMobileList && (
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[90] flex flex-col bg-background md:hidden"
          >
            {/* Compose: Liquid Glass SQUIRCLE sitting on the same line as
                the "All Notes" large title (right-aligned). */}
            <button
              onClick={createNote}
              className="orleia-glass-btn !h-12 !w-12 !rounded-[18px] fixed right-4 z-[70]"
              style={{ top: "calc(0.75rem + env(safe-area-inset-top, 0px) + 4.5rem)" }}
              aria-label={t("notes.newNote")}
            >
              <Plus className="h-5 w-5" />
            </button>
            <div className="px-5 pb-1 pt-[calc(env(safe-area-inset-top,0px)+5.5rem)]">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                {t("notes.allNotes")}
              </h2>
            </div>

            {/* Mobile search */}
            <div className="flex items-center gap-2 px-5 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("notes.search")}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            {/* Mobile folders */}
            <div className="flex gap-1 overflow-x-auto px-5 pb-2 pt-1">
              <button
                onClick={() => setActiveFolder(null)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  activeFolder === null
                    ? "border border-foreground/40 text-foreground"
                    : "border border-transparent bg-muted/60 text-muted-foreground hover:text-foreground"
                )}
              >
                {t("notes.allNotes")}
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFolder(f.id)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    activeFolder === f.id
                      ? "border border-foreground/40 text-foreground"
                      : "border border-transparent bg-muted/60 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.name}
                </button>
              ))}
            </div>

            {/* Mobile notes list */}
            <div className="flex-1 overflow-y-auto">
              {filteredNotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <FileText className="mb-3 h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">{t("notes.noNotes")}</p>
                </div>
              ) : (
                filteredNotes.map((note) => (
                  <button
                    key={note.id}
                    onClick={() => {
                      setSelectedNote(note);
                      setShowMobileList(false);
                    }}
                    className="flex w-full flex-col gap-1 border-b border-border/50 px-4 py-3 text-left transition-colors active:bg-muted"
                  >
                    <div className="flex items-center gap-1.5">
                      {note.pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                      <span className="text-sm font-medium text-foreground truncate">
                        {note.title || t("notes.untitled")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {extractPreview(note.content)}
                    </p>
                    <span className="text-[11px] text-muted-foreground/60">
                      {formatDate(note.updatedAt)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            className="fixed z-[200] w-44 overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
          >
            <button
              onClick={() => { togglePin(contextMenu.noteId); setContextMenu(null); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <Pin className="h-3.5 w-3.5" /> {t("notes.pin")}
            </button>
            <button
              onClick={() => { archiveNote(contextMenu.noteId); setContextMenu(null); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <Archive className="h-3.5 w-3.5" /> {t("notes.archive")}
            </button>
            <button
              onClick={async () => {
                const n = notes.find((x) => x.id === contextMenu.noteId);
                setContextMenu(null);
                if (n) await shareText(n.title || t("notes.untitled"), noteToText(n.title || t("notes.untitled"), n.contentHtml || ""));
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <Share2 className="h-3.5 w-3.5" /> {t("common.share")}
            </button>
            <div className="border-t border-border" />
            <button
              onClick={() => { deleteNote(contextMenu.noteId); setContextMenu(null); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive transition-colors hover:bg-muted"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("notes.deleteNote")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
