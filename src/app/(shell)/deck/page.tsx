"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import { useMobile } from "@/hooks/useMobile";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Presentation,
  Search,
  Star,
  Trash2,
  Copy,
  Download,
  Upload,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Play,
  Sparkles,
  FileText,
  FileJson,
  Globe,
  Type as TypeIcon,
  List,
  Quote,
  Flag,
  Columns2,
  BarChart3,
  ListOrdered,
  LayoutTemplate,
  Loader2,
  Palette,
  Timer,
  StickyNote,
  Keyboard,
  Rows2,
  ImagePlus,
  Heading,
} from "lucide-react";
import { storage } from "@/lib/storage";
import { cn, generateId } from "@/lib/utils";
import { Deck, DeckSlide, DeckSlideLayout } from "@/types";
import { DECK_THEMES, DECK_ACCENTS, DECK_TRANSITIONS, slideAccent } from "@/lib/deck-themes";
import { SlideCanvas, SlideThumb } from "@/components/deck/SlideCanvas";
import {
  exportToPPTX,
  exportToMarkdown,
  exportToJSON,
  exportToHTML,
  importFromMarkdown,
} from "@/lib/deck-export";
import { DECK_TEMPLATES } from "@/lib/deck-templates";
import { generateDeckOutline } from "@/lib/deck-ai";
import { pickSlideImage } from "@/lib/deck-image";

// ===== Helpers =====

function newSlide(layout: DeckSlideLayout = "bullets"): DeckSlide {
  return { id: generateId(), layout, title: "", content: [""], notes: "", accent: undefined };
}

function newDeckData(title = "Untitled deck"): Omit<Deck, "id" | "createdAt" | "updatedAt" | "starred"> {
  return {
    title,
    description: "",
    slides: [
      { ...newSlide("title"), title },
      newSlide("bullets"),
      { ...newSlide("end"), title: "Thank you" },
    ],
    theme: "midnight",
    transition: "fade",
  };
}

const LAYOUT_OPTIONS: { key: DeckSlideLayout; label: string; icon: typeof Presentation }[] = [
  { key: "title", label: "Title", icon: TypeIcon },
  { key: "section", label: "Section", icon: Heading },
  { key: "bullets", label: "Bullets", icon: List },
  { key: "statement", label: "Statement", icon: Rows2 },
  { key: "stats", label: "Stats", icon: BarChart3 },
  { key: "timeline", label: "Timeline", icon: ListOrdered },
  { key: "two-col", label: "Two-col", icon: Columns2 },
  { key: "quote", label: "Quote", icon: Quote },
  { key: "end", label: "End", icon: Flag },
];

export default function DeckPage() {
  const { t } = useI18n();
  const isMobile = useMobile();
  const [data, setData] = useState(storage.getData());
  const refresh = useCallback(() => setData({ ...storage.getData() }), []);
  useEffect(() => storage.subscribe(refresh), [refresh]);

  const decks = data.decks || [];
  const [view, setView] = useState<"library" | "editor" | "present">("library");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [starredOnly, setStarredOnly] = useState(false);
  const [sortKey, setSortKey] = useState<"recent" | "starred">("recent");

  const deck = useMemo(() => decks.find((d) => d.id === activeId) || null, [decks, activeId]);

  // Generator state
  const [genOpen, setGenOpen] = useState(false);
  const [genPrompt, setGenPrompt] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState("");
  const [genModel, setGenModel] = useState<string>(data.selectedModel || "novella-medium");

  // Import state
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importTitle, setImportTitle] = useState("");

  // Templates state
  const [tplOpen, setTplOpen] = useState(false);
  const [tplTitle, setTplTitle] = useState("");

  const filtered = useMemo(() => {
    let list = [...decks];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((d) => d.title.toLowerCase().includes(q) || d.description.toLowerCase().includes(q));
    }
    if (starredOnly) list = list.filter((d) => d.starred);
    if (sortKey === "starred")
      list.sort((a, b) => Number(b.starred) - Number(a.starred) || b.updatedAt.localeCompare(a.updatedAt));
    else list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return list;
  }, [decks, search, starredOnly, sortKey]);

  const createDeck = (title?: string) => {
    const d = storage.createDeck(newDeckData(title || "Untitled deck"));
    refresh();
    setActiveId(d.id);
    setView("editor");
  };

  const createFromOutline = (
    outline: { title: string; description: string; slides: Array<Partial<DeckSlide> & { layout: DeckSlideLayout; title: string }> }
  ) => {
    const slides: DeckSlide[] = outline.slides.map((s) => ({
      ...newSlide(s.layout),
      ...s,
      id: generateId(),
      accent: undefined,
    }));
    const d = storage.createDeck({
      title: outline.title,
      description: outline.description,
      slides,
      theme: "midnight",
      transition: "fade",
    });
    refresh();
    setActiveId(d.id);
    setView("editor");
  };

  const runGenerator = async () => {
    if (!genPrompt.trim() || genLoading) return;
    setGenLoading(true);
    setGenError("");
    try {
      const outline = await generateDeckOutline(genPrompt.trim(), genModel);
      setGenOpen(false);
      setGenPrompt("");
      createFromOutline(outline as never);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setGenLoading(false);
    }
  };

  const doImport = () => {
    if (!importText.trim()) return;
    const slides = parseInlineOutline(importText);
    const d = storage.createDeck({
      ...newDeckData(importTitle.trim() || "Imported deck"),
      slides: [newSlide("title"), ...slides, newSlide("end")],
    });
    refresh();
    setImportOpen(false);
    setImportText("");
    setImportTitle("");
    setActiveId(d.id);
    setView("editor");
  };

  const createFromTemplate = (templateId: string) => {
    const tpl = DECK_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    const built = tpl.build(tplTitle.trim() || tpl.name);
    const d = storage.createDeck({ ...built, theme: tpl.theme, transition: "fade" });
    refresh();
    setTplOpen(false);
    setTplTitle("");
    setActiveId(d.id);
    setView("editor");
  };

  if (view === "present" && deck) {
    return <PresentView deck={deck} onExit={() => setView("editor")} />;
  }

  if (view === "editor" && deck) {
    return (
      <DeckEditor
        key={deck.id}
        deck={deck}
        onBack={() => setView("library")}
        onPresent={() => setView("present")}
      />
    );
  }

  // ===== Mobile guard — matches Grid's placement exactly: same centered
  // block, and deck's main gets the standard top padding (not a
  // FULL_WIDTH_ROUTE) plus Grid's extra 24px container padding.
  if (isMobile) {
    return (
      <div className="relative flex flex-col items-center justify-center py-24 px-6 pt-[calc(96px+env(safe-area-inset-top,0px))] text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Presentation className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{t("deck.deck")}</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">{t("deck.mobileUnavailable")}</p>
      </div>
    );
  }

  // ===== Library =====
  return (
    <div className="h-[calc(100vh-0px)] overflow-y-auto bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground/50 mb-1">{t("deck.orleia_office")}</p>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <span className="p-2.5 rounded-2xl bg-muted/50">
                <Presentation className="h-6 w-6" />
              </span>{t("deck.deck")}</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Build, present, and export presentations. Local-first, like everything else.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border/50 text-sm hover:bg-muted/30 transition-all"
            >
              <Upload className="h-4 w-4" />{t("deck.import")}</button>
            <button
              onClick={() => setTplOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border/50 text-sm hover:bg-muted/30 transition-all"
            >
              <LayoutTemplate className="h-4 w-4" />{t("deck.templates")}</button>
            <button
              onClick={() => setGenOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-foreground/20 bg-transparent text-sm font-medium text-foreground/70 hover:border-foreground/40 hover:text-foreground transition-all"
            >
              <Sparkles className="h-4 w-4" />{t("deck.generate_with_noor")}</button>
            <button
              onClick={() => createDeck()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-foreground/20 bg-transparent text-sm font-medium text-foreground/70 hover:border-foreground/40 hover:text-foreground transition-all"
            >
              <Plus className="h-4 w-4" />{t("deck.new_deck")}</button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("deck.search_decks")}
              className="w-full bg-muted/30 border border-border/50 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-border"
            />
          </div>
          <button
            onClick={() => setStarredOnly((v) => !v)}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-sm transition-all",
              starredOnly
                ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                : "border-border/50 hover:bg-muted/30"
            )}
          >
            <Star className={cn("h-4 w-4", starredOnly && "fill-current")} />{t("deck.starred")}</button>
          <button
            onClick={() => setSortKey((k) => (k === "recent" ? "starred" : "recent"))}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-border/50 text-sm hover:bg-muted/30 transition-all"
          >
            Sort: {sortKey === "recent" ? "Recent" : "Starred"} <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Deck grid */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
              <Presentation className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="font-semibold mb-1">{decks.length === 0 ? "No decks yet" : "Nothing matches"}</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {decks.length === 0
                ? "Start from a template, generate with Noor, or build from scratch."
                : "Try a different search or filter."}
            </p>
            {decks.length === 0 && (
              <div className="flex flex-wrap gap-3 justify-center">
                <button
                  onClick={() => setTplOpen(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border/50 text-sm hover:bg-muted/30 transition-all"
                >
                  <LayoutTemplate className="h-4 w-4" />{t("deck.browse_templates")}</button>
                <button
                  onClick={() => setGenOpen(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border/50 text-sm hover:bg-muted/30 transition-all"
                >
                  <Sparkles className="h-4 w-4" />{t("deck.generate_with_noor")}</button>
                <button
                  onClick={() => createDeck()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-foreground/20 bg-transparent text-sm font-medium text-foreground/70 hover:border-foreground/40 hover:text-foreground transition-all"
                >
                  <Plus className="h-4 w-4" />{t("deck.new_deck")}</button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((d) => {
              const theme = DECK_THEMES[d.theme] || DECK_THEMES.midnight;
              const first = d.slides[0];
              return (
                <motion.div
                  key={d.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="group relative border border-border/50 rounded-2xl overflow-hidden hover:border-border transition-all cursor-pointer"
                  onClick={() => {
                    setActiveId(d.id);
                    setView("editor");
                  }}
                >
                  <div className="aspect-video relative" style={{ background: theme.bg }}>
                    {first && (
                      <div className="absolute inset-0 p-[8%] flex flex-col justify-center" style={{ color: theme.text }}>
                        {first.kicker && (
                          <div className="uppercase tracking-[0.15em] text-[9px] font-medium mb-2" style={{ color: slideAccent(first, theme) }}>
                            {first.kicker}
                          </div>
                        )}
                        <div className="font-bold tracking-tight truncate text-sm" style={{ fontFamily: theme.titleFont }}>
                          {first.title || "Untitled"}
                        </div>
                        {first.content[0] && <div className="text-xs opacity-50 truncate mt-1">{first.content[0]}</div>}
                      </div>
                    )}
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/30 backdrop-blur-sm text-white/80">
                      {d.slides.length} slides
                    </div>
                    <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          storage.createDeck({
                            title: `${d.title} (copy)`,
                            description: d.description,
                            slides: d.slides.map((s) => ({ ...s, id: generateId() })),
                            theme: d.theme,
                            transition: d.transition,
                          });
                          refresh();
                        }}
                        className="p-1.5 rounded-lg bg-black/40 backdrop-blur-sm text-white/90 hover:bg-black/60 transition-all"
                        title={t("deck.duplicate")}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${d.title}"?`)) {
                            storage.deleteDeck(d.id);
                            refresh();
                          }
                        }}
                        className="p-1.5 rounded-lg bg-black/40 backdrop-blur-sm text-white/90 hover:bg-red-500/80 transition-all"
                        title={t("deck.delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="p-4 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate text-sm">{d.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {theme.name} · {new Date(d.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        storage.toggleDeckStar(d.id);
                        refresh();
                      }}
                      className={cn(
                        "p-1.5 rounded-lg transition-all shrink-0",
                        d.starred ? "text-yellow-500" : "text-muted-foreground/30 hover:text-muted-foreground"
                      )}
                    >
                      <Star className={cn("h-4 w-4", d.starred && "fill-current")} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Noor generator modal */}
      <AnimatePresence>
        {genOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => !genLoading && setGenOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              className="w-full max-w-lg bg-background border border-border rounded-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary-500" />{t("deck.generate_with_noor")}</h3>
                <button onClick={() => !genLoading && setGenOpen(false)} className="p-1.5 rounded-lg hover:bg-muted/50">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <textarea
                value={genPrompt}
                onChange={(e) => setGenPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runGenerator();
                }}
                placeholder='e.g. "Series A pitch for my coffee subscription startup, we have 1200 users and 38% retention"'
                className="w-full bg-muted/30 border border-border/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-border resize-none"
                rows={3}
                autoFocus
                disabled={genLoading}
              />
              <p className="text-[11px] text-muted-foreground mt-2">
                Tip: include your real numbers. Noor builds assertion-style headlines around them instead of generic filler.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs text-muted-foreground">Effort:</span>
                {(["novella-low", "novella-medium", "novella-high"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setGenModel(m)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                      genModel === m ? "border border-foreground/40 text-foreground" : "border border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m === "novella-low" ? "Low" : m === "novella-medium" ? "Medium" : "High"}
                  </button>
                ))}
              </div>
              {genError && <p className="text-sm text-red-500 mt-3">{genError}</p>}
              <button
                onClick={runGenerator}
                disabled={!genPrompt.trim() || genLoading}
                className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-foreground/20 bg-transparent text-sm font-medium text-foreground/70 hover:border-foreground/40 hover:text-foreground disabled:opacity-40 transition-all"
              >
                {genLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />{t("deck.noor_is_building_your_deck")}</>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />{t("deck.generate_deck")}</>
                )}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Templates modal */}
      <AnimatePresence>
        {tplOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setTplOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              className="w-full max-w-2xl bg-background border border-border rounded-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <LayoutTemplate className="h-4 w-4" />{t("deck.start_from_a_template")}</h3>
                <button onClick={() => setTplOpen(false)} className="p-1.5 rounded-lg hover:bg-muted/50">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                value={tplTitle}
                onChange={(e) => setTplTitle(e.target.value)}
                placeholder={t("deck.deck_title_e_g_seed_round_orleia")}
                className="w-full bg-muted/30 border border-border/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-border mb-4"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DECK_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => createFromTemplate(t.id)}
                    className="text-left border border-border/50 rounded-xl p-4 hover:border-border hover:bg-muted/20 transition-all"
                  >
                    <div className="font-medium text-sm">{t.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{t.tagline}</div>
                    <div className="mt-3 h-2 w-12 rounded-full" style={{ background: (DECK_THEMES[t.theme] || DECK_THEMES.midnight).accent }} />
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import modal */}
      <AnimatePresence>
        {importOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setImportOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              className="w-full max-w-lg bg-background border border-border rounded-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Upload className="h-4 w-4" />{t("deck.import_outline")}</h3>
                <button onClick={() => setImportOpen(false)} className="p-1.5 rounded-lg hover:bg-muted/50">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                value={importTitle}
                onChange={(e) => setImportTitle(e.target.value)}
                placeholder={t("deck.deck_title")}
                className="w-full bg-muted/30 border border-border/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-border mb-3"
              />
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={"One slide per line, or a markdown outline:\n\n## Slide title\n- point one\n- point two"}
                className="w-full bg-muted/30 border border-border/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-border resize-none font-mono"
                rows={8}
                autoFocus
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={async () => {
                    const outline = await importFromMarkdown();
                    if (outline && outline.length) {
                      setImportText(
                        outline
                          .map(
                            (s) =>
                              `## ${s.title}\n${(s.content || []).map((c) => `- ${c}`).join("\n")}${
                                s.stats ? "\n" + s.stats.map((st) => `- **${st.value}** ${st.label}`).join("\n") : ""
                              }`
                          )
                          .join("\n\n")
                      );
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border/50 text-sm hover:bg-muted/30 transition-all"
                >
                  <FileText className="h-4 w-4" /> .md file
                </button>
                <button
                  onClick={doImport}
                  disabled={!importText.trim()}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-foreground/20 bg-transparent text-sm font-medium text-foreground/70 hover:border-foreground/40 hover:text-foreground disabled:opacity-40 transition-all"
                >{t("deck.import")}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ===== Editor =====

/**
 * Fits a 16:9 slide into whatever vertical space the canvas area has,
 * so the edited slide is always fully visible — no guessing at hidden
 * content. Recomputes on resize.
 */
function FitSlideBox({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const availW = el.clientWidth;
      const availH = el.clientHeight;
      if (!availW || !availH) return;
      let w = availW;
      let h = (availW * 9) / 16;
      if (h > availH) {
        h = availH;
        w = (availH * 16) / 9;
      }
      setBox({ w: Math.floor(w), h: Math.floor(h) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center">
      <div
        className="overflow-hidden rounded-2xl border border-border/50 shadow-2xl [container-type:size]"
        style={box.w ? { width: box.w, height: box.h } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

function DeckEditor({ deck, onBack, onPresent }: { deck: Deck; onBack: () => void; onPresent: () => void }) {
  const { t } = useI18n();
  const [currentIdx, setCurrentIdx] = useState(0);
  const dragIdx = useRef<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const slide = deck.slides[Math.min(currentIdx, deck.slides.length - 1)] || deck.slides[0];
  const theme = DECK_THEMES[deck.theme] || DECK_THEMES.midnight;

  const update = (updates: Partial<Deck>) => {
    storage.updateDeck(deck.id, updates);
  };

  const updateSlide = (slideId: string, updates: Partial<DeckSlide>) => {
    update({ slides: deck.slides.map((s) => (s.id === slideId ? { ...s, ...updates } : s)) });
  };

  const addSlide = (layout: DeckSlideLayout = "bullets", afterIdx?: number) => {
    const next = [...deck.slides];
    const at = afterIdx !== undefined ? afterIdx + 1 : next.length;
    next.splice(at, 0, newSlide(layout));
    update({ slides: next });
    setCurrentIdx(at);
  };

  const duplicateSlide = (idx: number) => {
    const next = [...deck.slides];
    const copy: DeckSlide = {
      ...next[idx],
      id: generateId(),
      content: [...next[idx].content],
      contentRight: next[idx].contentRight ? [...next[idx].contentRight!] : undefined,
      stats: next[idx].stats ? next[idx].stats!.map((st) => ({ ...st })) : undefined,
    };
    next.splice(idx + 1, 0, copy);
    update({ slides: next });
    setCurrentIdx(idx + 1);
  };

  const deleteSlide = (idx: number) => {
    if (deck.slides.length <= 1) return;
    const next = deck.slides.filter((_, i) => i !== idx);
    update({ slides: next });
    setCurrentIdx((c) => Math.max(0, Math.min(c, next.length - 1)));
  };

  const reorder = (from: number, to: number) => {
    if (from === to) return;
    const next = [...deck.slides];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    update({ slides: next });
    setCurrentIdx(to);
  };

  const doExport = async (kind: "pptx" | "html" | "md" | "json") => {
    setExporting(kind);
    setExportOpen(false);
    try {
      if (kind === "pptx") await exportToPPTX(deck);
      else if (kind === "html") exportToHTML(deck);
      else if (kind === "md") exportToMarkdown(deck);
      else exportToJSON(deck);
    } finally {
      setExporting(null);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") setCurrentIdx((c) => Math.min(c + 1, deck.slides.length - 1));
      else if (e.key === "ArrowLeft" || e.key === "PageUp") setCurrentIdx((c) => Math.max(c - 1, 0));
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        onPresent();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [deck.slides.length, onPresent]);

  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportOpen]);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 shrink-0">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-muted/40 transition-all" title={t("deck.back_to_library")}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input
          value={deck.title}
          onChange={(e) => update({ title: e.target.value })}
          className="bg-transparent outline-none font-semibold text-sm min-w-0 flex-1 max-w-xs focus:bg-muted/30 rounded-lg px-2 py-1"
        />
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground hidden md:block">{deck.slides.length} slides · saved locally</span>
        <div className="relative" ref={exportRef}>
          <button
            onClick={() => setExportOpen((v) => !v)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border/50 text-sm hover:bg-muted/30 transition-all"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">{exporting ? "Exporting..." : "Export"}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
          <AnimatePresence>
            {exportOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute right-0 top-full mt-2 w-56 bg-background border border-border rounded-xl shadow-lg overflow-hidden z-30"
              >
                {[
                  { key: "pptx" as const, label: "PowerPoint (.pptx)", icon: Presentation },
                  { key: "html" as const, label: "Web slideshow (.html)", icon: Globe },
                  { key: "md" as const, label: "Markdown outline (.md)", icon: FileText },
                  { key: "json" as const, label: "Deck data (.json)", icon: FileJson },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => doExport(item.key)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40 transition-all text-left"
                  >
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                    {item.label}
                  </button>
                ))}
                <div className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border/50">
                  Tip: use browser Print for PDF
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button
          onClick={onPresent}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-foreground/20 bg-transparent text-sm font-medium text-foreground/70 hover:border-foreground/40 hover:text-foreground transition-all"
        >
          <Play className="h-4 w-4" />{t("deck.present")}</button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Slide sorter */}
        <div className="w-44 md:w-52 border-r border-border/50 overflow-y-auto p-3 space-y-2 shrink-0 hidden sm:block">
          {deck.slides.map((s, i) => (
            <div
              key={s.id}
              draggable
              onDragStart={() => (dragIdx.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIdx.current !== null) reorder(dragIdx.current, i);
                dragIdx.current = null;
              }}
              onClick={() => setCurrentIdx(i)}
              className={cn(
                "group relative rounded-xl border cursor-pointer transition-all",
                i === currentIdx ? "border-primary-500/60 ring-1 ring-primary-500/30" : "border-border/40 hover:border-border"
              )}
            >
              <div className="absolute top-1 right-1 z-10 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateSlide(i);
                  }}
                  className="p-1 text-white/80 bg-black/40 rounded backdrop-blur-sm hover:bg-black/60"
                  title={t("deck.duplicate")}
                >
                  <Copy className="h-3 w-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSlide(i);
                  }}
                  className="p-1 text-white/80 bg-black/40 rounded backdrop-blur-sm hover:bg-red-500/80"
                  title={t("deck.delete")}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="pointer-events-none">
                <SlideThumb slide={s} deck={deck} />
              </div>
              <div className="px-2 py-1 text-[10px] text-muted-foreground flex items-center justify-between">
                <span>{i + 1}</span>
                <span className="capitalize opacity-60">{s.layout}</span>
              </div>
            </div>
          ))}
          <div className="pt-2 border-t border-border/40">
            <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider px-1 pb-2">{t("deck.add_slide")}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {LAYOUT_OPTIONS.map((l) => (
                <button
                  key={l.key}
                  onClick={() => addSlide(l.key, currentIdx)}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-lg border border-border/40 text-[10px] text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-all"
                >
                  <l.icon className="h-3.5 w-3.5" />
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex items-center justify-center p-4 sm:p-6 min-h-0">
            <FitSlideBox>
              <SlideCanvas slide={slide} deck={deck} editing onChange={(updates) => updateSlide(slide.id, updates)} />
            </FitSlideBox>
          </div>
          {/* Kicker + notes — one compact row so the canvas keeps the space */}
          <div className="border-t border-border/50 px-4 sm:px-6 py-2 shrink-0 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider shrink-0">{t("deck.kicker")}</span>
            <input
              value={slide.kicker || ""}
              onChange={(e) => updateSlide(slide.id, { kicker: e.target.value })}
              placeholder={t("deck.small_label_above_the_title_e_g_01_probl")}
              className="w-44 bg-muted/30 border border-border/50 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-border"
            />
            <StickyNote className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
            <input
              value={slide.notes}
              onChange={(e) => updateSlide(slide.id, { notes: e.target.value })}
              placeholder={t("deck.speaker_notes_visible_in_present_mode_wi")}
              className="flex-1 min-w-[180px] bg-muted/30 border border-border/50 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-border"
            />
          </div>
        </div>

        {/* Right panel */}
        <div className="w-56 border-l border-border/50 overflow-y-auto p-4 space-y-6 shrink-0 hidden lg:block">
          <div>
            <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Palette className="h-3 w-3" />{t("deck.theme")}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.values(DECK_THEMES).map((t) => (
                <button
                  key={t.key}
                  onClick={() => update({ theme: t.key })}
                  className={cn(
                    "rounded-lg border p-2 text-left transition-all",
                    deck.theme === t.key ? "border-primary-500/60 ring-1 ring-primary-500/30" : "border-border/40 hover:border-border"
                  )}
                >
                  <div className="h-8 rounded-md mb-1.5" style={{ background: t.bg }} />
                  <div className="text-[10px] font-medium">{t.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">{t("deck.slide_accent")}</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => updateSlide(slide.id, { accent: undefined })}
                className={cn(
                  "w-7 h-7 rounded-lg border flex items-center justify-center text-[9px] font-medium transition-all",
                  !slide.accent ? "border-primary-500/60 ring-1 ring-primary-500/30" : "border-border/40"
                )}
                title={t("deck.theme_default")}
              >
                A
              </button>
              {DECK_ACCENTS.map((c) => (
                <button
                  key={c}
                  onClick={() => updateSlide(slide.id, { accent: c })}
                  className={cn(
                    "w-7 h-7 rounded-lg border transition-all",
                    slide.accent === c ? "border-foreground ring-1 ring-foreground/40" : "border-border/40 hover:scale-105"
                  )}
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ImagePlus className="h-3 w-3" />{t("deck.slide_image")}</div>
            {slide.imageUrl ? (
              <div className="relative rounded-lg overflow-hidden border border-border/40">
                <img src={slide.imageUrl} alt="" className="w-full h-20 object-cover" />
                <div className="absolute inset-0 flex items-end justify-between p-1.5 bg-black/30">
                  <button
                    onClick={async () => {
                      const url = await pickSlideImage();
                      if (url) updateSlide(slide.id, { imageUrl: url });
                    }}
                    className="px-2 py-1 rounded-md bg-black/50 backdrop-blur-sm text-white text-[10px] hover:bg-black/70 transition-all"
                  >{t("deck.replace")}</button>
                  <button
                    onClick={() => updateSlide(slide.id, { imageUrl: undefined })}
                    className="px-2 py-1 rounded-md bg-black/50 backdrop-blur-sm text-white text-[10px] hover:bg-red-500/80 transition-all"
                  >{t("deck.remove")}</button>
                </div>
              </div>
            ) : (
              <button
                onClick={async () => {
                  const url = await pickSlideImage();
                  if (url) updateSlide(slide.id, { imageUrl: url });
                }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-border/50 text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-all"
              >
                <ImagePlus className="h-4 w-4" />{t("deck.upload_image")}</button>
            )}
            <p className="text-[10px] text-muted-foreground/50 mt-1.5">{slide.layout === 'title' || slide.layout === 'end' || slide.layout === 'section' ? 'Shows as dimmed background.' : 'Shows as right-side panel.'}</p>
          </div>

          <div>
            <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">{t("deck.transition")}</div>
            <div className="flex gap-1.5">
              {DECK_TRANSITIONS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => update({ transition: t.key })}
                  className={cn(
                    "flex-1 px-2 py-1.5 rounded-lg text-xs transition-all",
                    deck.transition === t.key ? "border border-foreground/40 text-foreground" : "border border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">{t("deck.description")}</div>
            <textarea
              value={deck.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder={t("deck.what_is_this_deck_about")}
              className="w-full bg-muted/30 border border-border/50 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-border resize-none"
              rows={3}
            />
          </div>

          <div className="text-[10px] text-muted-foreground/60 space-y-1">
            <div className="flex items-center gap-1.5 font-medium uppercase tracking-wider mb-1">
              <Keyboard className="h-3 w-3" />{t("deck.shortcuts")}</div>
            <div className="flex justify-between"><span>{t("deck.navigate")}</span><span className="font-mono">← →</span></div>
            <div className="flex justify-between"><span>{t("deck.present")}</span><span className="font-mono">{t("deck.ctrl_p")}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Present mode =====

function PresentView({ deck, onExit }: { deck: Deck; onExit: () => void }) {
  const { t } = useI18n();
  const [idx, setIdx] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const theme = DECK_THEMES[deck.theme] || DECK_THEMES.midnight;
  const slide = deck.slides[Math.min(idx, deck.slides.length - 1)];
  const accent = slideAccent(slide, theme);

  useEffect(() => {
    timer.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const go = useCallback(
    (dir: 1 | -1) => {
      setIdx((c) => Math.max(0, Math.min(c + dir, deck.slides.length - 1)));
    },
    [deck.slides.length]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "n" || e.key === "N") setShowNotes((v) => !v);
      else if (e.key === "g" || e.key === "G") setShowGrid((v) => !v);
      else if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      } else if (e.key === "Escape") {
        if (document.fullscreenElement) document.exitFullscreen();
        else onExit();
      } else if (e.key === "Home") setIdx(0);
      else if (e.key === "End") setIdx(deck.slides.length - 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [go, onExit, deck.slides.length]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  const transitionAnim =
    deck.transition === "slide"
      ? { initial: { x: 60, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: -60, opacity: 0 } }
      : deck.transition === "zoom"
      ? { initial: { scale: 1.05, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.96, opacity: 0 } }
      : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

  if (showGrid) {
    return (
      <div className="h-screen bg-background text-foreground overflow-y-auto p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">{deck.title} — all slides</h2>
          <button onClick={() => setShowGrid(false)} className="px-4 py-2 rounded-xl border border-foreground/20 bg-transparent text-sm font-medium text-foreground/70 hover:border-foreground/40 hover:text-foreground">{t("deck.back_to_presenting")}</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {deck.slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => {
                setIdx(i);
                setShowGrid(false);
              }}
              className={cn(
                "rounded-xl overflow-hidden border-2 transition-all relative",
                i === idx ? "border-primary-500" : "border-transparent hover:border-border"
              )}
            >
              <SlideThumb slide={s} deck={deck} />
              <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/50 text-white text-[10px]">{i + 1}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[90]" style={{ background: "#0b0b14" }}>
      <div className="absolute inset-0 [container-type:size]" onClick={(e) => go(e.clientX > window.innerWidth / 2 ? 1 : -1)}>
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={transitionAnim.initial}
            animate={transitionAnim.animate}
            exit={transitionAnim.exit}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="absolute inset-0"
          >
            <SlideCanvas slide={slide} deck={deck} />
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showNotes && slide.notes && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-16 left-6 right-6 max-w-2xl mx-auto bg-black/70 backdrop-blur-md border border-white/10 rounded-2xl p-4 text-sm text-white/85"
          >
            <div className="text-[10px] uppercase tracking-wider opacity-50 mb-1">{t("deck.speaker_notes")}</div>
            {slide.notes}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-4 left-6 flex items-center gap-3 text-white/40 text-xs font-mono">
        <span className="flex items-center gap-1.5">
          <Timer className="h-3.5 w-3.5" /> {mm}:{ss}
        </span>
        <span className="opacity-40 hidden sm:inline">N notes · G grid · F fullscreen · Esc exit</span>
      </div>
      <div className="absolute bottom-4 right-6 flex items-center gap-2 text-white/60 text-sm font-mono">
        <button onClick={() => go(-1)} className="p-2 rounded-lg hover:bg-white/10 transition-all">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs">
          {idx + 1} / {deck.slides.length}
        </span>
        <button onClick={() => go(1)} className="p-2 rounded-lg hover:bg-white/10 transition-all">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button onClick={onExit} className="p-2 rounded-lg hover:bg-white/10 transition-all ml-2" title={t("deck.exit")}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div
        className="absolute bottom-0 left-0 h-[3px] transition-all duration-300"
        style={{ width: `${((idx + 1) / deck.slides.length) * 100}%`, background: accent }}
      />
    </div>
  );
}

// Parse quick-import outline
function parseInlineOutline(text: string): DeckSlide[] {
  if (/^##\s+/m.test(text)) {
    return text
      .split(/^##\s+/m)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const [titleLine, ...rest] = p.split("\n");
        const content: string[] = [];
        const stats: Array<{ value: string; label: string }> = [];
        for (const l of rest) {
          const line = l.trim();
          const statMatch = line.match(/^- \*\*(.+?)\*\*\s*(.*)$/);
          if (statMatch) stats.push({ value: statMatch[1], label: statMatch[2] });
          else {
            const clean = line.replace(/^[-*]\s*/, "").trim();
            if (clean) content.push(clean);
          }
        }
        return {
          ...newSlide("bullets"),
          title: titleLine.trim(),
          content: content.length ? content : [""],
          stats: stats.length ? stats : undefined,
        };
      });
  }
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => ({ ...newSlide("bullets"), title: l.replace(/^[-*#]\s*/, ""), content: [""] }));
}
