"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { ResearchCard } from "@/components/noor/ResearchCard";
import {
  buildPlannerPrompt as _unusedPlanner,
  extractJSON as _unusedExtract,
  coercePlan as _unusedCoercePlan,
  type ResearchPlan,
  type ResearchPage,
  type ResearchSource,
  type ResearchDeliverable,
  type ResearchFormat,
} from "@/lib/research";
import { deliverableToMarkdown, downloadResearchMarkdown } from "@/lib/research-client";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Mic,
  Square,
  Loader2,
  CheckCircle2,
  Plus,
  MessageSquare,
  ChevronDown,
  Sparkles,
  X as XIcon,
  Trash2,
  PanelRight,
  Info,
  Copy,
  Share2,
  RefreshCw,
  Copy as CopyIcon,
  Zap,
  Check,
  Pencil,
  Pin,
  Search,
  Download,
  FileText,
  BookOpen,
  CheckSquare,
  Flame,
  Globe,
  Telescope,
  Camera,
  ImagePlus,
  Paperclip,
  Laptop,
} from "lucide-react";
import { LOCAL_MODELS, probeOllama, isModelInstalled, ollamaSetupHint, type OllamaStatus, type LocalModelDef } from "@/lib/local-ai";
import { EFFORT_LEVELS, effortModelId, type EffortLevel } from "@/lib/ai-models";
import { EffortSlider } from "@/components/ui/effort-slider";
import { storage } from "@/lib/storage";
import { buildSituationModel } from "@/lib/graph/situation";
import { getGraph } from "@/lib/graph/engine";
import { chat } from "@/lib/ai";
import { sanitizeStoredReply, executeAction, type ProposedAction } from "@/lib/ai-actions";
import { chatStream, NoorCapError } from "@/lib/ai-stream";
import { getSkills, skillForCommand, type NoorSkill } from "@/lib/noor-skills";
import { noorPresence, subscribeNoorBg, notifyNoorReply } from "@/lib/noor-background";
import { isBlockedUpload, blockedUploadReason } from "@/lib/upload-guard";
import { isLiveQuery } from "@/lib/web-search";
import { cn, generateId } from "@/lib/utils";
import { useMobile } from "@/hooks/useMobile";
import { getDeviceId } from "@/lib/device-id";
import { AIMessage, AIModel, AI_MODELS, MODEL_ALIASES, BriefAction, AISource, PetAgent } from "@/types";
import { Markdown } from "@/components/chat/Markdown";
import { useI18n } from "@/lib/i18n";
import { useVoiceDictation } from "@/lib/useVoiceDictation";
import { haptic } from "@/lib/haptics";
import { createPortal } from "react-dom";
import { shareText } from "@/lib/share";
import ImageLoader from "@/components/ui/image-loading";
import { MiniCamera, type CapturedPhoto } from "@/components/noor/MiniCamera";
import { PawPrint } from "lucide-react";
import { roster as petRoster, petPersonaPrefix, ensurePetConversation, roleHasJob, runRoleNow, resolveMention, agentTurns } from "@/lib/pet-agent";
import { stripPetFlavor } from "@/lib/action-clean";
import { runResearchPipeline, wantsResearch } from "@/lib/research-run";
import { jobByRole } from "@/lib/pet-jobs";
import { petById, petSvg } from "@/lib/pets";
import {
  assignScoutJob,
  pendingScoutJob,
  activeScoutJobs,
  kickScoutRunner,
  ensureScoutRunner,
} from "@/lib/scout-jobs";

// Novella 5.0: one model, six effort presets. Labels map effort ids
// (novella-low ... novella-ultra); legacy ids fall through the aliases.
const MODEL_META: Record<string, string> = {
  "novella-hyperfast": "Novella 5.0 · Hyperfast",
  "novella-low": "Novella 5.0 · Low",
  "novella-medium": "Novella 5.0 · Medium",
  "novella-high": "Novella 5.0 · High",
  "novella-max": "Novella 5.0 · Max",
  "novella-ultra": "Novella 5.0 · Ultra",
};

// Resolve any stored model id (including legacy ids from old conversations).
// Local AI ids ("local-*") pass through unchanged — they are valid models.
function resolveModelId(id: string): string {
  if (id.startsWith("local-")) return id;
  return MODEL_ALIASES[id] || (MODEL_META[id] ? id : "novella-medium");
}

function msgLabel(id?: string): string {
  const resolved = resolveModelId(id || "novella-medium");
  if (resolved.startsWith("local-")) {
    const def = LOCAL_MODELS.find((m) => m.id === resolved);
    return def ? def.name : "Local";
  }
  return MODEL_META[resolved] || "Novella 5.0";
}

const PROPOSAL_LABELS: Record<string, string> = {
  create_habit: "Create habit",
  create_task: "Create task",
  create_note: "Create note",
  create_journal: "Write journal entry",
  create_event: "Add calendar event",
  log_habit: "Log habit",
  complete_task: "Complete task",
  update_habit: "Update habit",
  update_task: "Update task",
  delete_habit: "Delete habit",
  delete_task: "Delete task",
  delete_note: "Delete note",
};

function proposalTitle(p: { action: string; params: Record<string, unknown> }): string {
  const label = PROPOSAL_LABELS[p.action] || p.action.replace(/_/g, " ");
  const raw = p.params?.title ?? p.params?.name ?? p.params?.content ?? p.params?.date;
  const detail = typeof raw === "string" && raw.trim() ? " \u201c" + raw.trim().slice(0, 40) + "\u201d" : "";
  return label + detail;
}

/** One-tap confirmation for an action Noor proposed. Nothing runs until tapped. */
function ProposalChip({
  msg,
  onConfirm,
  onDismiss,
}: {
  msg: AIMessage;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const p = msg.proposal;
  if (!p) return null;
  if (msg.proposalResolved) {
    return (
      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className={msg.proposalResolved === "confirmed" ? "text-emerald-500" : ""}>
          {msg.proposalResolved === "confirmed" ? "\u2713" : "\u2715"}
        </span>
        {msg.proposalResolved === "confirmed" ? "Done" : "Dismissed"} · {proposalTitle(p)}
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-2xl border border-border bg-card/80 p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60">Noor wants to</p>
      <p className="mt-1 text-sm font-medium">{proposalTitle(p)}</p>
      <div className="mt-2.5 flex gap-2">
        <button
          onClick={onConfirm}
          className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background transition-all hover:opacity-90 active:scale-95"
        >
          Confirm
        </button>
        <button
          onClick={onDismiss}
          className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

interface Attachment {
  id: string;
  kind: "image" | "file";
  name: string;
  size: number;
  dataUrl: string;
  text?: string;
  description?: string;
}

// "make an image of X" / "image: X" -> image generation
function isImageRequest(q: string): boolean {
  const t = q.trim().toLowerCase();
  // Explicit "image: <prompt>" - require a real subject after the colon.
  if (/^(image|img|draw|generate)\s*[:：]\s*/.test(t)) {
    return t.replace(/^(image|img|draw|generate)\s*[:：]\s*/, "").trim().length >= 4;
  }
  if (/(how do i|how to|what is|what's|explain|tutorial|best|compare)\b/.test(t)) return false;
  const m = t.match(
    /(^|\s)(generate|create|make|draw|render|imagine|produce)\s+(me\s+|us\s+)?(an?\s+|a\s+)?(image|picture|photo|logo|art|illustration|poster|meme|drawing|icon|artwork|graphic)\b/
  );
  if (!m) return false;
  // Require an actual subject: "make an image of a fox" triggers, but a bare
  // correction like "no, generate an image" does not - it falls back to chat.
  const rest = t.slice((m.index || 0) + m[0].length).trim();
  return rest.length >= 3 && /\s[a-z]{2,}/.test(rest);
}

function cleanImagePrompt(q: string): string {
  return q
    .replace(/^(no|nah|nope|nvm|nevermind)[,!\s]+/i, "")
    .replace(/^(image|img|draw|generate)\s*[:：]\s*/i, "")
    .replace(/[.。!?]+$/g, "")
    .trim() || q.trim();
}

function sourceIcon(kind: AISource["kind"]) {
  switch (kind) {
    case "document":
      return <FileText className="h-3 w-3 text-primary-500" />;
    case "journal":
      return <BookOpen className="h-3 w-3 text-violet-500" />;
    case "task":
      return <CheckSquare className="h-3 w-3 text-emerald-500" />;
    case "habit":
      return <Flame className="h-3 w-3 text-zinc-400" />;
    case "web":
      return <Globe className="h-3 w-3 text-sky-500" />;
  }
}

const SAFE_MODEL: AIModel = "novella-medium";

/** Any stored/legacy id → its Novella effort level (for the slider). */
function effortOf(id: string): EffortLevel {
  if (id.startsWith("novella-")) {
    const lv = id.slice("novella-".length) as EffortLevel;
    if (EFFORT_LEVELS.includes(lv)) return lv;
  }
  const legacy: Record<string, EffortLevel> = { "fast-1": "hyperfast", "novella-hyper": "hyperfast" };
  return legacy[id] || "medium";
}

// Text files shorter than this are sent to the model verbatim; longer ones
// are digested into an overview first (see /api/overview) so Noor understands
// the whole file without blowing the context window.
const FILE_INLINE_CHARS = 12_000;

const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

// ============================================================
// Streaming speech helpers
// ============================================================

export default function AssistantPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [data, setData] = useState(storage.getData());

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  // Chat-with-pet: when set, replies speak as the hired pet (persona) —
  // same pipeline, same daily cap, same confirm-chip actions.
  const [petAgentId, setPetAgentId] = useState<string | null>(null);
  // Pending text queued as a Scout job once the empty thread exists
  // (typed from the empty state's "assign a job" input).
  const [pendingScoutTopic, setPendingScoutTopic] = useState("");
  // Scout dispatch: pending job for THIS pet's thread ("🔭 working…” chip).
  const [activeScout, setActiveScout] = useState(false);
  // Server-truth "N messages left" warning: fired once per day at 5 remaining.
  const usageWarnedDate = useRef<string | null>(null);
  useEffect(() => {
    const onUsage = (e: Event) => {
      const { used, limit } = (e as CustomEvent<{ used: number; limit: number | null }>).detail;
      if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) return;
      const left = limit - used;
      const today = new Date().toISOString().slice(0, 10);
      if (left === 5 && usageWarnedDate.current !== today) {
        usageWarnedDate.current = today;
        const warn: AIMessage = {
          id: generateId(),
          role: "assistant",
          kind: "usage-warning",
          content: "⚠️ Heads up — only 5 Noor messages left today. The cap resets at midnight, or upgrade in Settings → Billing for more.",
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, warn]);
      }
    };
    window.addEventListener("orleia:noor-usage", onUsage);
    return () => window.removeEventListener("orleia:noor-usage", onUsage);
  }, []);
  const [input, setInput] = useState("");
  const [allSkills, setAllSkills] = useState<NoorSkill[]>([]);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);
  // @mention autocomplete: hired agents + a "Noor" entry that hands the
  // thread back to the operator. mentionToken = text after the last "@".
  const [mentionToken, setMentionToken] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const mentionPickedRef = useRef(false);
  useEffect(() => { setAllSkills(getSkills()); }, []);
  const skillSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const slashMatches = slashOpen
    ? allSkills.filter((s) => {
        const q = input.slice(1).split(/\s/)[0].toLowerCase();
        return !q || s.name.toLowerCase().includes(q) || ("/" + skillSlug(s.name)).includes("/" + q);
      })
    : [];
  const insertSkillSlug = (s: NoorSkill) => {
    const v = "/" + skillSlug(s.name) + " ";
    setInput(v);
    setSlashOpen(false);
    setSlashIdx(0);
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(v.length, v.length);
      }
    });
  };
  const mentionMatches: { name: string; kind: "agent" | "noor"; agent?: PetAgent }[] =
    mentionToken === null
      ? []
      : (() => {
          const q = mentionToken.toLowerCase();
          const opts: { name: string; kind: "agent" | "noor"; agent?: PetAgent }[] = [
            ...petRoster().map((a) => ({ name: a.name, kind: "agent" as const, agent: a })),
            { name: "Noor", kind: "noor" as const },
          ];
          return opts.filter((o) => o.name.toLowerCase().startsWith(q)).slice(0, 6);
        })();
  const mentionPetSvg = (a: PetAgent) => {
    const pet = petById(a.petId);
    return pet ? petSvg(pet, "h-full w-full") : null;
  };
  const insertMention = (name: string) => {
    const el = inputRef.current;
    const v = input;
    const caret = el?.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at === -1) return;
    const next = v.slice(0, at) + "@" + name + " " + v.slice(caret);
    setInput(next);
    mentionPickedRef.current = true;
    setMentionToken(null);
    setMentionIdx(0);
    requestAnimationFrame(() => {
      if (el) {
        const pos = at + name.length + 2;
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  };
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<AIModel>(getSafeModel(data.selectedModel));
  const [showModelPicker, setShowModelPicker] = useState(false);
  // Local AI (Ollama): sub-list expansion + live install probe.
  const [localOpen, setLocalOpen] = useState(false);
  const [ollama, setOllama] = useState<OllamaStatus | null>(null);
  const [showChats, setShowChats] = useState(false);
  const [localInfo, setLocalInfo] = useState<LocalModelDef | null>(null);
  const localInfoRef = useRef<HTMLDivElement>(null);
  const isMobile = useMobile();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesBoxRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Generation guard: an in-flight reply must never land in a conversation
  // that was deleted while Noor was thinking (race fix).
  const abortRef = useRef<AbortController | null>(null);
  const convDeleted = (id: string | null) =>
    !id || !storage.getData().aiConversations.some((c) => c.id === id);
  const [composerMultiline, setComposerMultiline] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  // Live-streamed reply text - renders token-by-token while loading.
  const [streamText, setStreamText] = useState("");
  const [researchMode, setResearchMode] = useState(false);
  const [researchState, setResearchState] = useState<{
    active: boolean;
    stage: string;
    stageDetail: string;
  }>({ active: false, stage: "", stageDetail: "" });
  const [researchOpen, setResearchOpen] = useState<Record<string, boolean>>({});
  const [searching, setSearching] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [branchingId, setBranchingId] = useState<string | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  // Mini camera (ChatGPT-style small window): open state + captured photos
  // flow into the normal attachment pipeline.
  const [cameraOpen, setCameraOpen] = useState(false);
  const handleCameraCapture = (photo: CapturedPhoto) => {
    setAttachments((prev) => [...prev, { ...photo, kind: "image" as const }]);
  };
  // Full-screen preview of a composer attachment (tap the thumbnail).
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  // Mobile keyboard: keep the layout in place instead of letting the browser
  // pan or scroll the whole page. When the keyboard opens, size the chat to
  // the visual viewport (iOS: layout viewport never shrinks; Android gets
  // interactiveWidget=resizes-content natively) and re-pin messages to bottom.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onVv = () => {
      const root = rootRef.current;
      if (!root) return;
      const kbOpen = vv.height < window.innerHeight - 120;
      if (kbOpen) root.style.height = `${Math.round(vv.height)}px`;
      else if (root.style.height) root.style.height = "";
      const box = messagesBoxRef.current;
      if (box) {
        const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
        if (atBottom) box.scrollTop = box.scrollHeight;
      }
    };
    vv.addEventListener("resize", onVv);
    vv.addEventListener("scroll", onVv);
    return () => {
      vv.removeEventListener("resize", onVv);
      vv.removeEventListener("scroll", onVv);
    };
  }, []);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [generatingImage, setGeneratingImage] = useState(false);

  // Web search: when the toggle is on, fetch live results before answering.
  const fetchWebSources = async (q: string): Promise<AISource[]> => {
    setSearching(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: q.slice(0, 300) }),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        results?: { title: string; url: string; snippet: string }[];
      };
      return (data.results || []).map((r) => ({
        kind: "web" as const,
        id: r.url,
        title: r.title,
        snippet: r.snippet,
        href: r.url,
      }));
    } catch {
      return [];
    } finally {
      setSearching(false);
    }
  };

  // Describe an attached image via the vision model so Noor can "see" it.
  const describeImage = async (dataUrl: string): Promise<string> => {
    try {
      const res = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: dataUrl }),
      });
      if (!res.ok) return "";
      const data = (await res.json()) as { description?: string };
      return (data.description || "").trim();
    } catch {
      return "";
    }
  };

  // Summarize a large text file server-side (chunked map-reduce) so Noor
  // understands the WHOLE file, not just its first few thousand characters.
  const buildFileOverview = async (name: string, text: string): Promise<string> => {
    try {
      const res = await fetch("/api/overview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, title: name }),
      });
      if (!res.ok) return "";
      const data = (await res.json()) as { overview?: string };
      return (data.overview || "").trim();
    } catch {
      return "";
    }
  };

  const handleAttachImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const next: Attachment[] = [];
    for (const f of files.slice(0, 4)) {
      if (f.size > 5 * 1024 * 1024) continue;
      const dataUrl = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ""));
        r.readAsDataURL(f);
      });
      next.push({ id: generateId(), kind: "image", name: f.name, size: f.size, dataUrl });
    }
    if (next.length) setAttachments((prev) => [...prev, ...next]);
  };

  const handleAttachFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const next: Attachment[] = [];
    // Big files are supported now - Noor digests them chunk-by-chunk
    // (see /api/overview). We only read the first ~500KB of text into
    // memory; that's more than enough to overview anything realistic.
    const MAX_FILE_BYTES = 25 * 1024 * 1024;
    const MAX_FILE_CHARS = 500_000;
    for (const f of files.slice(0, 2)) {
      if (isBlockedUpload(f)) {
        alert(blockedUploadReason(f));
        continue;
      }
      if (f.size > MAX_FILE_BYTES) continue;
      const isText =
        f.type.startsWith("text/") ||
        /\.(txt|md|json|csv|ts|tsx|js|jsx|py|html|css|log|ini|yml|yaml|xml)$/i.test(f.name);
      let text: string | undefined;
      if (isText) {
        text = await f.slice(0, MAX_FILE_CHARS).text().catch(() => "");
        if (!text) text = undefined;
        else if (f.size > MAX_FILE_CHARS) {
          text += `\n...(file is ${formatBytes(f.size)}; showing the first ${MAX_FILE_CHARS.toLocaleString()} characters)`;
        }
      }
      next.push({ id: generateId(), kind: "file", name: f.name, size: f.size, dataUrl: "", text });
    }
    if (next.length) setAttachments((prev) => [...prev, ...next]);
  };

  // When the composer wraps to multiple lines, drop the pill radius so the text
  // is never clipped by the fully-rounded corners (pill -> rounded rectangle).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const check = () => {
      const cs = getComputedStyle(el);
      const lineH = parseFloat(cs.lineHeight) || 20;
      const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      setComposerMultiline(el.offsetHeight > lineH + pad + 4);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const LANG_MAP: Record<string, string> = {
    en: "en-US",
    es: "es-ES",
    fr: "fr-FR",
    de: "de-DE",
    pt: "pt-PT",
    ar: "ar-SA",
  };
  /* Voice follows the OS language (same resolution as useI18n). */
  const osLang = ((typeof navigator !== "undefined" && (navigator.languages?.[0] || navigator.language)) || "en").toLowerCase().split("-")[0];
  const speechLang = LANG_MAP[osLang] || "en-US";
  const handleVoiceFinal = (text: string) => {
    if (!text.trim()) return;
    setInput((prev) => {
      const base = prev.trim();
      return base ? base.replace(/\\s+$/, "") + " " + text : text;
    });
    if (inputRef.current) {
      inputRef.current.focus();
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 160) + "px";
      });
    }
  };
  const {
    supported: voiceSupported,
    listening: voiceListening,
    processing: voiceProcessing,
    error: voiceError,
    interim: voiceInterim,
    start: startVoice,
    stop: stopVoice,
  } = useVoiceDictation({ lang: speechLang, onFinal: handleVoiceFinal });

  
;

  
;

  
;

  
;

  
;

  function getSafeModel(m: unknown): AIModel {
    if (typeof m === "string") {
      if (m.startsWith("local-")) return m; // Local AI model — valid
      if (AI_MODELS.some((x) => x.id === m)) return m as AIModel;
      const aliased = MODEL_ALIASES[m];
      if (aliased) return aliased;
    }
    return SAFE_MODEL;
  }


  const refresh = () => setData({ ...storage.getData() });
  useEffect(() => storage.subscribe(() => setData({ ...storage.getData() })), []);

  useEffect(() => {
    // Scroll only the chat's own scroll container, never the page window.
    const box = messagesBoxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Interacting with the model-info popup must NOT close the picker
      // dropdown underneath it — the popup lives outside the picker refs.
      if (localInfoRef.current && localInfoRef.current.contains(e.target as Node)) return;
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
      if (plusRef.current && !plusRef.current.contains(e.target as Node)) {
        setPlusOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);



  // Deep link: /noor?c=<conversationId> opens that thread (toast/notification taps).
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    if (c) loadConversation(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep link: /noor?pet=<agentId> opens (or creates) the pet's chat thread
  // (Pets page "Chat" button + future pet notification taps).
  useEffect(() => {
    const pet = new URLSearchParams(window.location.search).get("pet");
    if (!pet) return;
    const agent = petRoster().find((a) => a.id === pet);
    if (!agent) return;
    openPetChat(agent.id);
    // Empty thread + a pending-topic query → treat as a Scout job dispatch
    // (/noor?pet=X&topic=…): one tap from the pets page runs a real job.
    const topic = new URLSearchParams(window.location.search).get("topic");
    if (topic && agent.role === "scout") {
      const res = assignScoutJob(agent.id, topic, ensurePetConversation(agent));
      if (res.ok) {
        setPendingScoutTopic("");
        setActiveScout(true);
        kickScoutRunner();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startNewChat = () => {
    setPetAgentId(null);
    setPendingScoutTopic("");
    setActiveScout(false);
    const conv = storage.createConversation();
    setConversationId(conv.id);
    setMessages([]);
    refresh();
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Empty-state "assign a job" flow: thread is created on submit.
  const submitScoutTopic = (agentId: string) => {
    const agent = petRoster().find((a) => a.id === agentId);
    if (!agent) return;
    const topic = pendingScoutTopic.trim();
    if (!topic) return;
    setPendingScoutTopic("");
    const convId = ensurePetConversation(agent);
    const res = assignScoutJob(agent.id, topic, convId);
    if (!res.ok) return;
    setConversationId(convId);
    const conv = storage.getData().aiConversations.find((c) => c.id === convId);
    setMessages(
      (conv?.messages || []).map((m) =>
        m.role === "assistant" ? { ...m, content: sanitizeStoredReply(m.content) } : m
      )
    );
    refresh();
    setActiveScout(true);
    kickScoutRunner();
  };

  // Chat with a hired pet: one persistent per-agent thread ("Chat with
  // {name}"), created on first open. Noor conversations are untouched.
  const openPetChat = (agentId: string) => {
    const agent = petRoster().find((a) => a.id === agentId);
    if (!agent) return;
    const convId = ensurePetConversation(agent);
    setPetAgentId(agentId);
    setConversationId(convId);
    const conv = storage.getData().aiConversations.find((c) => c.id === convId);
    setMessages(
      (conv?.messages || []).map((m) =>
        m.role === "assistant" ? { ...m, content: sanitizeStoredReply(m.content) } : m
      )
    );
    refresh();
    setTimeout(() => inputRef.current?.focus(), 50);
    setActiveScout(Boolean(pendingScoutJob(agentId) || activeScoutJobs().some((j) => j.agentId === agentId && j.status === "running")));
  };

  const loadConversation = (id: string) => {
    const conv = data.aiConversations.find((c) => c.id === id);
    if (conv) {
      // Belt and braces: never render a stored raw action block, even if a
      // conversation predates the filters or was written by another path.
      const cleaned = conv.messages.map((m) =>
        m.role === "assistant" ? { ...m, content: sanitizeStoredReply(m.content) } : m
      );
      setConversationId(id);
      setMessages(cleaned);
      setPetAgentId(conv.petAgentId || null);
      if (cleaned.some((m, i) => m.content !== conv.messages[i].content)) {
        storage.replaceConversationMessages(id, cleaned);
      }
    }
  };

  const deleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const appData = storage.getData();
    appData.aiConversations = appData.aiConversations.filter((c) => c.id !== id);
    storage.saveData();
    if (conversationId === id) {
      // Abort the in-flight generation and reset the composer view so the
      // user lands on the clean empty state immediately - the reply (and its
      // stream) is discarded, not delivered into a deleted chat.
      abortRef.current?.abort();
      abortRef.current = null;
      setLoading(false);
      setStreamText("");
      setConversationId(null);
      setMessages([]);
      setPetAgentId(null);
    }
    refresh();
  };

  // ---------- Phase 1: conversation tools ----------

  const togglePin = (id: string) => {
    const conv = storage.getData().aiConversations.find((c) => c.id === id);
    if (!conv) return;
    storage.updateConversation(id, { pinned: !conv.pinned });
    refresh();
  };

  const copyMessage = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1800);
  };

  const exportChat = () => {
    if (messages.length === 0) return;
    const title = storage
      .getData()
      .aiConversations.find((c) => c.id === conversationId)?.title || "Noor chat";
    const lines = messages.map((m) => {
      const who = m.role === "user" ? "You" : `Noor (${msgLabel(m.model)})`;
      const body = m.content.trim();
      return `## ${who}\n\n${body}`;
    });
    const md = `# ${title}\n\n${lines.join("\n\n---\n\n")}\n`;
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "noor-chat"}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Edit a past user message -> truncate the conversation there, then resend.
  const saveEdit = async (msgId: string) => {
    const text = editText.trim();
    if (!text || loading) return;
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx === -1) return;
    const userMsg: AIMessage = {
      ...messages[idx],
      content: text,
    };
    const branch = messages.slice(0, idx).concat(userMsg);
    setEditingId(null);
    setEditText("");
    setBranchingId(msgId);
    if (conversationId) storage.replaceConversationMessages(conversationId, branch);
    setMessages(branch);
    await runReply(text, branch, true);
    setBranchingId(null);
  };

  // Regenerate an assistant reply: truncate after its triggering user message
  // and resend that prompt.
  const regenerate = async (assistantId: string) => {
    if (loading) return;
    const idx = messages.findIndex((m) => m.id === assistantId);
    if (idx === -1) return;
    let userIdx = idx - 1;
    while (userIdx >= 0 && messages[userIdx].role !== "user") userIdx--;
    if (userIdx < 0) return;
    const userMsg = messages[userIdx];
    const branch = messages.slice(0, userIdx + 1);
    setBranchingId(assistantId);
    if (conversationId) storage.replaceConversationMessages(conversationId, branch);
    setMessages(branch);
    await runReply(userMsg.content, branch, false);
    setBranchingId(null);
  };

  // Core reply runner shared by sendMessage / saveEdit / regenerate.
  const runReply = async (
    queryText: string,
    msgs: AIMessage[],
    branchMode: boolean
  ): Promise<void> => {
    setLoading(true);
    setStreamText("");
    const model = selectedModel;
    let sources: AISource[] = [];
    if (isLiveQuery(queryText)) sources = await fetchWebSources(queryText);
    const proposals: ProposedAction[] = [];
    let response: string; // proposals collected below ride on the finalized message
    try {
      // Stream so tokens appear live in the thread as they are generated.
      // onProposeAction: model-proposed actions become confirm chips the
      // user taps — nothing changes the workspace until they do.
      let acc = "";
      response = await chatStream(queryText, msgs, model, {
        sources,
        onToken: (delta) => {
          acc += delta;
          setStreamText(acc);
        },
        onProposeAction: (proposal) => {
          proposals.push(proposal as unknown as ProposedAction);
        },
      });
    } catch (e) {
      setLoading(false);
      setStreamText("");
      if (e instanceof NoorCapError) {
        const capMsg: AIMessage = {
          id: generateId(),
          role: "assistant",
          content: "⭐ You've used all of today's free Noor messages. Your cap resets at midnight — or upgrade to Plus in Settings → Billing for 300 messages a day.",
          timestamp: new Date().toISOString(),
          model,
        };
        storage.addMessage(conversationId ?? "", capMsg);
        setMessages((prev) => [...prev, capMsg]);
        if (!pageMountedRef.current) notifyNoorReply(capMsg.content, conversationId ?? "");
        return;
      }
      const errMsg: AIMessage = {
        id: generateId(),
        role: "assistant",
        content: "I could not reach my models just now - try again in a moment.",
        timestamp: new Date().toISOString(),
        model,
      };
      const updated = [...msgs, errMsg];
      setMessages(updated);
      if (!pageMountedRef.current) notifyNoorReply(errMsg.content, conversationId ?? "");
      if (conversationId) storage.replaceConversationMessages(conversationId, updated);
      refresh();
      return;
    }
    const aiMsg: AIMessage = {
      id: generateId(),
      role: "assistant",
      content: response,
      timestamp: new Date().toISOString(),
      model,
      branch: branchMode || undefined,
      sources: sources.length ? sources : undefined,
      proposal: proposals.length ? proposals[0] : undefined,
    };
    const updated = [...msgs, aiMsg];
    setMessages(updated);
    if (conversationId) storage.replaceConversationMessages(conversationId, updated);
    // Finalize the message in storage, clear the live stream view.
    setLoading(false);
    setStreamText("");
    refresh();
    if (!pageMountedRef.current) notifyNoorReply(aiMsg.content, conversationId ?? "");
  };

  const pageMountedRef = useRef(false);
  useEffect(() => {
    pageMountedRef.current = true;
    noorPresence.mounted = true;
    return () => {
      pageMountedRef.current = false;
      noorPresence.mounted = false;
    };
  }, []);

  // A background ask (global search) landed in the currently open conversation:
  // sync the thread from storage so the user sees it arrive live.
  useEffect(() => {
    return subscribeNoorBg((e) => {
      if (e.convId !== conversationId) return;
      const conv = storage.getData().aiConversations.find((c) => c.id === e.convId);
      if (conv) setMessages(conv.messages);
    });
  }, [conversationId]);

  // Mounted + idle page answers orleia:noor-ask itself (live streaming UX).
  useEffect(() => {
    const onAsk = (ev: Event) => {
      const text = String((ev as CustomEvent<string>).detail || "").trim();
      if (text && !loading) void sendMessage(text);
    };
    window.addEventListener("orleia:noor-ask", onAsk);
    return () => window.removeEventListener("orleia:noor-ask", onAsk);
  });

  // ---- Confirm chips (proposed actions) ----
  // Confirm: execute the exact params the model proposed — no re-prompt, no
  // drift between what was shown and what runs.
  const confirmProposal = (msg: AIMessage) => {
    if (!msg.proposal || msg.proposalResolved) return;
    const result = executeAction({
      matched: true,
      type: msg.proposal.action as never,
      params: msg.proposal.params as Record<string, never>,
      confidence: 1,
    });
    resolveProposalInThread(msg, result.success ? result.message : "I couldn't complete that: " + result.message, "confirmed");
  };

  const dismissProposal = (msg: AIMessage) => {
    if (!msg.proposal || msg.proposalResolved) return;
    resolveProposalInThread(msg, "No problem — I left everything as it was.", "dismissed");
  };

  const resolveProposalInThread = (msg: AIMessage, note: string, resolved: "confirmed" | "dismissed") => {
    const noteMsg: AIMessage = {
      id: generateId(),
      role: "assistant",
      content: note,
      timestamp: new Date().toISOString(),
      model: msg.model,
    };
    setMessages((prev) => {
      const next = prev.map((m) => (m.id === msg.id ? { ...m, proposalResolved: resolved } : m));
      next.splice(next.findIndex((m) => m.id === msg.id) + 1, 0, noteMsg);
      if (conversationId) storage.replaceConversationMessages(conversationId, next);
      return next;
    });
    refresh();
  };

  const changeModel = (model: AIModel, opts?: { keepOpen?: boolean }) => {
    setSelectedModel(model);
    // Effort-slider changes keep the picker open — closing mid-drag
    // kicked the user out of the picker while they were sliding.
    if (!opts?.keepOpen) setShowModelPicker(false);
    const appData = storage.getData();
    appData.selectedModel = model;
    storage.saveData();
  };

  // Daily brief: Noor summarizes the situation model (risks, mentions, mood).
  const DAILY_BRIEF_PROMPT =
    "Give me my daily brief. Using the situation block in your context, " +
    "write 4-6 short lines covering: (1) anything at risk right now - at-risk habit streaks " +
    "or overdue tasks, (2) tasks I keep mentioning but haven't finished, (3) my mood trend " +
    "if known, (4) one concrete thing I should do first today. Be warm, direct, like a mentor. " +
    "No bullet spam - keep it human.";

  // A brief action is 'done' when its effect is already visible in storage -
  // this survives reloads and makes repeated clicks idempotent.
  const actionDone = (a: BriefAction): boolean => {
    const appData = storage.getData();
    if (a.type === "log-habit") return storage.isHabitLogged(a.id!);
    if (a.type === "complete-task") {
      const tk = appData.tasks.find((x) => x.id === a.id!);
      return !!tk && tk.status === "done";
    }
    if (a.type === "break-down") {
      const parent = appData.tasks.find((x) => x.id === a.id!);
      if (!parent) return false;
      return appData.tasks.some((x) => x.title === `Plan: ${parent.title}`);
    }
    return false;
  };

  // Tap-through actions for the brief, computed locally from the situation
  // model - deterministic, instant, private (no extra API call).
  const buildBriefActions = (): BriefAction[] => {
    const appData = storage.getData();
    const situation = buildSituationModel(appData, getGraph());
    const actions: BriefAction[] = [];
    // At-risk habit streaks -> Log today
    for (const r of situation.risks) {
      if (r.kind === "habit") {
        actions.push({ type: "log-habit", id: r.id, label: `Log ${r.title}`, detail: r.detail });
      } else {
        actions.push({ type: "break-down", id: r.id, label: `Break down ${r.title}`, detail: r.detail });
        actions.push({ type: "complete-task", id: r.id, label: `Done: ${r.title}` });
      }
    }
    // Repeatedly mentioned but not overdue tasks -> offer a breakdown
    for (const m of situation.taskMentions) {
      if (m.score >= 3 && !actions.some((a) => a.id === m.id)) {
        actions.push({
          type: "break-down",
          id: m.id,
          label: `Break down ${m.title}`,
          detail: `Mentioned ${m.count}x${m.recent ? `, ${m.recent} recent` : ""}`,
        });
      }
    }
    return actions.slice(0, 6);
  };

  const handleBriefAction = (a: BriefAction) => {
    if (actionDone(a)) return; // idempotent: storage state is the source of truth
    const appData = storage.getData();
    if (a.type === "log-habit") {
      storage.logHabit(a.id!);
    } else if (a.type === "complete-task") {
      storage.updateTask(a.id!, { status: "done", completedAt: new Date().toISOString() });
    } else if (a.type === "break-down") {
      // Create 3 focused subtasks, linked to the parent in the graph.
      const parent = appData.tasks.find((t) => t.id === a.id!);
      const base = parent?.title || (a.label || "").replace(/^Break down /, "");
      const steps = ["Plan", "Do the core work", "Review & finish"];
      for (const step of steps) {
        const sub = storage.createTask({
          title: `${step}: ${base}`,
          description: `Sub-step of "${base}" (from your daily brief).`,
          status: "todo",
          priority: "medium",
          dueDate: parent?.dueDate || null,
          dueTime: null,
          tags: [],
          listId: parent?.listId || "inbox",
          projectId: null, recurring: "none",
          recurringEndDate: null,
          estimatedMinutes: null,
          completedAt: null,
        });
        storage.linkEntities(`task:${a.id}`, `task:${sub.id}`);
      }
    }
    refresh();
  };

  const requestDailyBrief = () => {
    void sendMessage(DAILY_BRIEF_PROMPT, { actions: buildBriefActions() });
  };
  // ===== Web Search 2.0: deep research pipeline =====
  const runResearch = async (
    question: string,
    currentConvId: string,
    msgs: AIMessage[],
    forceFormat?: ResearchFormat
  ): Promise<void> => {
    setResearchState({ active: true, stage: "plan", stageDetail: "Planning research..." });
    try {
      // Stage 1: plan
      const planRes = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-orleia-device": getDeviceId() },
        body: JSON.stringify({ stage: "plan", question: question.slice(0, 300), format: forceFormat }),
      });
      const planData = (await planRes.json()) as { plan?: ResearchPlan };
      const plan: ResearchPlan = planData.plan || { query: question.slice(0, 80), subQueries: [question], format: forceFormat || "report" };
      setResearchState({ active: true, stage: "search", stageDetail: `Searching: ${plan.subQueries.slice(0, 3).join(" · ")}` });

      // Stage 2: fan out searches (existing /api/search)
      const searchLists = await Promise.all(
        plan.subQueries.slice(0, 5).map((sq) => fetchWebSources(sq))
      );
      const merged = new Map<string, AISource>();
      for (const list of searchLists) {
        for (const src of list) {
          if (src.kind !== "web" || !src.href) continue;
          const key = src.id || src.href || src.title;
          if (!merged.has(key)) merged.set(key, src);
        }
      }
      let sources: AISource[] = Array.from(merged.values())
        .filter((x) => typeof x.href === "string" && x.href.length > 0)
        .slice(0, 12);
      // Sub-queries can whiff (planner wrote sentences, or engines rate-limited
      // under the burst). One retry with the cleaned core query through the
      // news-first path before giving up.
      if (!sources.length && plan.query) {
        const retry = await fetchWebSources(plan.query);
        for (const src of retry) {
          if (src.kind !== "web" || !src.href) continue;
          const key = src.id || src.href || src.title;
          if (!merged.has(key)) merged.set(key, src);
        }
        sources = Array.from(merged.values())
          .filter((x) => typeof x.href === "string" && x.href.length > 0)
          .slice(0, 12);
      }
      if (!sources.length) throw new Error("no results");

      setResearchState({ active: true, stage: "read", stageDetail: `Reading ${Math.min(5, sources.length)} pages...` });

      // Stage 3: read top pages server-side
      let pages: ResearchPage[] = [];
      // Google News wrapper links are JS shells - the target URL is embedded
      // client-side and cannot be unwrapped server-side. Skip them so the read
      // stage spends its slots on fetchable article pages instead.
      const readable = sources.filter((s2) => !/news\.google\.com\/rss\/articles/i.test(String(s2.href)));
      try {
        const readRes = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-orleia-device": getDeviceId() },
          body: JSON.stringify({
            stage: "read",
            urls: readable.slice(0, 5).map((s2) => ({ url: s2.href, title: s2.title })),
          }),
        });
        const readData = (await readRes.json()) as { pages?: ResearchPage[] };
        pages = readData.pages || [];
      } catch {
        pages = [];
      }

      setResearchState({ active: true, stage: "synthesize", stageDetail: "Synthesizing findings..." });

      // Stage 4: synthesize via /api/chat with a situation block
      const researchSources: ResearchSource[] = sources.map((s2, i) => ({
        id: String(i + 1),
        title: s2.title,
        url: (s2.href as string) || "",
        snippet: s2.snippet || "",
      }));
      const { buildSynthesizerPrompt, extractJSON, coerceDeliverable, isInconclusive, buildInconclusiveRetryContext } =
        await import("@/lib/research");

      const synthPrompt = buildSynthesizerPrompt({ question, format: plan.format, sources: researchSources, pages });
      const synthRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-orleia-device": getDeviceId() },
        body: JSON.stringify({
          model: "nvidia/nemotron-3-super-120b-a12b",
          messages: [
            // Sized for the live fallback sibling: a 40k prompt + 4k output
            // overran the 55s route timeout after the primary model's EOL.
            { role: "user", content: synthPrompt.slice(0, 16000) },
          ],
          temperature: 0.4,
          maxTokens: 2600,
          situation: `RESEARCH OUTPUT FORMAT CONTRACT: Respond with ONLY the JSON deliverable object. No prose before or after.`,
        }),
      });
      if (!synthRes.ok) throw new Error("synthesis failed");
      const synthData = (await synthRes.json()) as { content?: string };
      const rawOut = synthData.content || "";
      let deliverable = coerceDeliverable(extractJSON(rawOut), plan.format);

      // Bogus null-result guard: if the synthesizer says "the sources don't
      // answer this" while the headlines clearly do (the GPT-6 Astra case),
      // escalate ONCE — resubmit to the strongest model with an explicit
      // rejection of the previous verdict. Mechanical, not prompt-hope.
      if (isInconclusive(deliverable)) {
        setResearchState({ active: true, stage: "synthesize", stageDetail: "Verifying against sources..." });
        const retryCtx = buildInconclusiveRetryContext(question, deliverable as NonNullable<typeof deliverable>);
        const retryRes = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-orleia-device": getDeviceId() },
          body: JSON.stringify({
            model: "nvidia/nemotron-3-ultra-550b-a55b",              messages: [
                { role: "user", content: [retryCtx, synthPrompt.slice(0, 14000)].join("\n\n") },
              ],
              temperature: 0.3,
              maxTokens: 2600,
            situation: `RESEARCH OUTPUT FORMAT CONTRACT: Respond with ONLY the JSON deliverable object. No prose before or after.`,
          }),
        });
        if (retryRes.ok) {
          const retryData = (await retryRes.json()) as { content?: string };
          const retryOut = coerceDeliverable(extractJSON(retryData.content || ""), plan.format);
          // Accept the escalated answer when it actually answers; if even the
          // strong model calls it a null result, the original stands (both are
          // surfaced with their sources either way).
          if (retryOut && !isInconclusive(retryOut)) deliverable = retryOut;
        }
      }

      if (!deliverable) throw new Error("Could not structure the findings. Try again.");

      // Persist + render
      const result = {
        plan,
        pages: pages.map((p) => ({ url: p.url, title: p.title, extract: "", ok: p.ok })),
        sources: researchSources,
        deliverable,
        createdAt: new Date().toISOString(),
      };
      const aiMsg: AIMessage = {
        id: generateId(),
        role: "assistant",
        content: `${deliverable.tldr || deliverable.title}`,
        timestamp: new Date().toISOString(),
        model: selectedModel,
        research: result as never,
        sources: sources,
      };
      storage.addMessage(currentConvId, aiMsg);
      setMessages((prev) => [...prev, aiMsg]);
      refresh();
    } catch (e) {
      const aiMsg: AIMessage = {
        id: generateId(),
        role: "assistant",
        content:
          e instanceof Error && e.message === "no results"
            ? "I could not find usable sources for that. Try rephrasing or narrowing the question."
            : "The research run hit a snag partway through. Try again in a moment.",
        timestamp: new Date().toISOString(),
        model: selectedModel,
      };
      storage.addMessage(currentConvId, aiMsg);
      setMessages((prev) => [...prev, aiMsg]);
      refresh();
    } finally {
      setResearchState({ active: false, stage: "", stageDetail: "" });
    }
  };

  const sendMessage = async (textOverride?: string, opts?: { actions?: BriefAction[] }) => {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;

    // New reply turn: reset the sticky device-voice fallback so this reply
    // starts fresh on the premium neural voice (no mid-reply voice flips).

    let currentConvId = conversationId;
    if (!currentConvId) {
      const conv = storage.createConversation();
      currentConvId = conv.id;
      setConversationId(conv.id);
      refresh();
    }

    // Abort handle for this generation - used when the conversation is
    // deleted mid-thought.
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: AIMessage = {
      id: generateId(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
      model: selectedModel,
      attachments: attachments.length
        ? attachments.map(({ kind, name, dataUrl }) => ({ kind, name, dataUrl }))
        : undefined,
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    // Resolve a leading /skill-slug: the chat bubble keeps the short
    // command, the model receives the skill's full instructions.
    let queryText = text;

    // @mention routing: naming a hired agent (@name) switches this thread
    // to chat with them — one agent at a time; @noor hands the thread back
    // to Noor. The bubble keeps the raw text; the model receives the
    // cleaned text plus the agent's persona prefix below.
    let activePetId = petAgentId;
    // 2+ named agents in one message = a round-table: answer as each of
    // them instead of binding this thread to the leftmost one.
    const isRoundTable = agentTurns(text, petRoster()).length >= 2;
    const mention = isRoundTable ? null : resolveMention(text, petRoster());
    if (mention) {
      const cleaned = (queryText.slice(0, mention.start) + queryText.slice(mention.end)).trim();
      queryText = cleaned || queryText;
      const mentionConv = storage.getData().aiConversations.find((c) => c.id === currentConvId);
      if (mention.kind === "noor") {
        activePetId = null;
        if (mentionConv && mentionConv.petAgentId) {
          delete mentionConv.petAgentId;
          storage.saveData();
        }
        setPetAgentId(null);
      } else {
        activePetId = mention.agent.id;
        if (mentionConv && mentionConv.petAgentId !== mention.agent.id) {
          mentionConv.petAgentId = mention.agent.id;
          storage.saveData();
        }
        setPetAgentId(mention.agent.id);
      }
    }
    let skillApplied = false;
    if (text.startsWith("/")) {
      // Skill instructions replace the command; mentions already stripped
      // from queryText stay stripped ("/research @Blob topic" keeps both).
      const parsed = skillForCommand(text);
      if (parsed) {
        const qm = /^\/([a-z0-9-]+)/i.exec(queryText);
        const rest = qm ? queryText.slice(qm[0].length).trim() : queryText;
        queryText = rest
          ? `${parsed.skill.instructions}\n\n---\n${rest}`
          : parsed.skill.instructions;
        skillApplied = true;
      }
    }
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setLoading(true);

    // Enrich attachments once - used for this reply AND persisted on the
    // message so follow-up questions in the conversation remember them:
    // images get a vision description, big text files get a full-file overview.
    let llmQuery = queryText;
    if (attachments.length > 0) {
      const enriched: Attachment[] = await Promise.all(
        attachments.map(async (att) => {
          if (att.kind === "image") {
            const desc = await describeImage(att.dataUrl);
            return { ...att, description: desc || undefined };
          }
          if (att.kind === "file" && att.text && att.text.length > FILE_INLINE_CHARS) {
            const digest = await buildFileOverview(att.name, att.text);
            if (digest) return { ...att, description: digest };
            // Overview failed - inline the head so the reply still has context.
            return {
              ...att,
              description: undefined,
              text: att.text.slice(0, FILE_INLINE_CHARS) + "\n...(file too large to inline fully - this is its beginning)",
            };
          }
          return att;
        })
      );
      userMsg.attachments = enriched.map(({ kind, name, dataUrl, description }) => ({
        kind,
        name,
        dataUrl,
        description,
      }));
      const parts: string[] = [];
      for (const att of enriched) {
        if (att.kind === "image") {
          parts.push(`[Attached image "${att.name}"${att.description ? `] ${att.description}` : " - could not be described"}`);
        } else if (att.text) {
          // Long files arrive here as an overview digest instead of raw text.
          const body = att.description || att.text;
          parts.push(`[Attached file "${att.name}"${att.description ? " - full-file overview" : ""}]\n${body}`);
        } else {
          parts.push(`[Attached file "${att.name}" - binary file, contents unavailable]`);
        }
      }
      llmQuery = `${queryText}\n\n---\nUser attached:\n${parts.join("\n\n")}`;
      setAttachments([]);
    }

    // Pet chat: speak as the hired pet — persona prefix on the FINAL query
    // (after attachment enrichment). Everything else (cap, actions, chips,
    // sources) flows through the normal Noor path untouched.
    if (activePetId) {
      const petAgentForTurn = petRoster().find((a) => a.id === activePetId);
      if (petAgentForTurn) llmQuery = petPersonaPrefix(petAgentForTurn) + "\n\n---\nUser: " + llmQuery;
    }

    // SCOUT JOB DISPATCH: "assign: <topic>" in a scout's thread enqueues a
    // real background web job (agent loop) instead of a chat reply. The
    // user's message is stored verbatim; delivery arrives in this thread.
    if (activePetId && queryText.toLowerCase().startsWith("assign:")) {
      const scoutAgent = petRoster().find((a) => a.id === activePetId);
      const topic = queryText.slice(7).trim();
      if (scoutAgent?.role === "scout" && topic) {
        const res = assignScoutJob(scoutAgent.id, topic, currentConvId);
        if (res.ok) {
          storage.addMessage(currentConvId, userMsg);
          setMessages((prev) => [...prev, userMsg]);
          refresh();
          setActiveScout(true);
          kickScoutRunner();
          setLoading(false);
          return;
        }
      }
    }

    let sources: AISource[] = [];
    if (isLiveQuery(queryText)) sources = await fetchWebSources(queryText);
    const sendOpts = { sources };

    storage.addMessage(currentConvId, userMsg);

    // MULTI-MENTION: 2+ hired agents named in one message -> each one
    // answers as its own employee, one reply after another, each reply
    // carrying only the part of the request addressed to it.
    const namedTurns = agentTurns(text, petRoster());
    if (namedTurns.length >= 2) {
      // A leading /skill-slug applies to the whole message (its instructions
      // already replaced the command in queryText).
      for (const turn of namedTurns) {
        const agent = turn.agent;
        const seg = skillApplied ? queryText : turn.clean;
        setStreamText("");

        // Scout turns get the same research pipeline as the pet-chat surface.
        if (agent.role === "scout" && wantsResearch(seg)) {
          setResearchState({ active: true, stage: "plan", stageDetail: "Planning research..." });
          let aborted = false;
          try {
            const run = await runResearchPipeline(seg, {
              onStage: (detail) => setResearchState({ active: true, stage: "search", stageDetail: detail }),
            });
            if (controller.signal.aborted || convDeleted(currentConvId)) {
              aborted = true;
            } else {
              const scoutMsg: AIMessage = {
                id: generateId(),
                role: "assistant",
                content: stripPetFlavor(run.content),
                timestamp: new Date().toISOString(),
                model: selectedModel,
                agentId: agent.id,
                sources: run.sources,
                research: run.research as never,
              };
              storage.addMessage(currentConvId, scoutMsg);
              setMessages((prev) => [...prev, scoutMsg]);
              refresh();
            }
          } catch (e) {
            if (controller.signal.aborted) {
              aborted = true;
            } else {
              const failMsg: AIMessage = {
                id: generateId(),
                role: "assistant",
                content:
                  e instanceof Error && e.message === "no results"
                    ? "I could not find usable sources for that. Try rephrasing or narrowing the question."
                    : e instanceof NoorCapError
                      ? "\u2b50 You've used all of today's free Noor messages. Your cap resets at midnight \u2014 or upgrade to Plus in Settings \u2192 Billing for 300 messages a day."
                      : "The research run hit a snag partway through. Try again in a moment.",
                timestamp: new Date().toISOString(),
                model: selectedModel,
                agentId: agent.id,
              };
              storage.addMessage(currentConvId, failMsg);
              setMessages((prev) => [...prev, failMsg]);
              refresh();
            }
          } finally {
            setResearchState({ active: false, stage: "", stageDetail: "" });
          }
          if (aborted) break;
          continue;
        }

        const q =
          petPersonaPrefix(agent) +
          `\n\nThe user addressed several teammates at once; the text below is YOUR part only - answer just that, do not cover the other parts.\n\n---\nUser: ` +
          seg;
        setStreamText("");
        try {
          let acc = "";
          const props: ProposedAction[] = [];
          const response = await chatStream(q, updatedMessages, selectedModel, {
            ...sendOpts,
            signal: controller.signal,
            onToken: (delta) => {
              if (controller.signal.aborted) return;
              acc += delta;
              setStreamText(acc);
            },
            onProposeAction: (proposal) => {
              props.push(proposal as ProposedAction);
            },
          });
          if (controller.signal.aborted || convDeleted(currentConvId)) break;
          const replyMsg: AIMessage = {
            id: generateId(),
            role: "assistant",
            content: stripPetFlavor(response),
            timestamp: new Date().toISOString(),
            model: selectedModel,
            agentId: agent.id,
            proposal: props.length ? props[0] : undefined,
            sources: sources.length ? sources : undefined,
          };
          storage.addMessage(currentConvId, replyMsg);
          setMessages((prev) => [...prev, replyMsg]);
          refresh();
        } catch (e) {
          if (controller.signal.aborted) break;
          const errMsg: AIMessage = {
            id: generateId(),
            role: "assistant",
            content:
              e instanceof NoorCapError
                ? "\u2b50 You've used all of today's free Noor messages. Your cap resets at midnight \u2014 or upgrade to Plus in Settings \u2192 Billing for 300 messages a day."
                : e instanceof Error && e.message === "no results"
                  ? "I could not find usable sources for that. Try rephrasing or narrowing the question."
                  : "I could not reach my models just now - try again in a moment.",
            timestamp: new Date().toISOString(),
            model: selectedModel,
          };
          storage.addMessage(currentConvId, errMsg);
          setMessages((prev) => [...prev, errMsg]);
          refresh();
          break;
        }
      }
      abortRef.current = null;
      setLoading(false);
      setStreamText("");
      return;
    }

    // Deep research branch: run the pipeline instead of a normal reply.
    if (researchMode) {
      setLoading(false);
      await runResearch(queryText, currentConvId, updatedMessages);
      return;
    }

    // SCOUT RESEARCH MODE: a hired Scout answering a research request gets
    // the same plan -> search -> read -> synthesize pass as research mode,
    // so scouting actually searches the web instead of guessing.
    if (activePetId && wantsResearch(queryText)) {
      const scoutAgent = petRoster().find((a) => a.id === activePetId);
      if (scoutAgent?.role === "scout") {
        setLoading(false);
        setResearchState({ active: true, stage: "plan", stageDetail: "Planning research..." });
        try {
          const run = await runResearchPipeline(queryText, {
            onStage: (detail) => setResearchState({ active: true, stage: "search", stageDetail: detail }),
          });
          if (controller.signal.aborted || convDeleted(currentConvId)) return;
          const scoutMsg: AIMessage = {
            id: generateId(),
            role: "assistant",
            content: stripPetFlavor(run.content),
            timestamp: new Date().toISOString(),
            model: selectedModel,
            agentId: scoutAgent.id,
            sources: run.sources,
            research: run.research as never,
          };
          storage.addMessage(currentConvId, scoutMsg);
          setMessages((prev) => [...prev, scoutMsg]);
          refresh();
        } catch (e) {
          if (controller.signal.aborted) return;
          const failMsg: AIMessage = {
            id: generateId(),
            role: "assistant",
            content:
              e instanceof Error && e.message === "no results"
                ? "I could not find usable sources for that. Try rephrasing or narrowing the question."
                : e instanceof NoorCapError
                  ? "\u2b50 You've used all of today's free Noor messages. Your cap resets at midnight \u2014 or upgrade to Plus in Settings \u2192 Billing for 300 messages a day."
                  : "The research run hit a snag partway through. Try again in a moment.",
            timestamp: new Date().toISOString(),
            model: selectedModel,
          };
          storage.addMessage(currentConvId, failMsg);
          setMessages((prev) => [...prev, failMsg]);
          refresh();
        } finally {
          setResearchState({ active: false, stage: "", stageDetail: "" });
          abortRef.current = null;
          setStreamText("");
        }
        return;
      }
    }


    // Image generation: "make an image of X" / "image: X" -> generate & skip the LLM.
    if (attachments.length === 0 && isImageRequest(queryText)) {
      setGeneratingImage(true);
      const prompt = cleanImagePrompt(queryText);
      try {
        const res = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        const data = (await res.json()) as { imageDataUrl?: string };
        if (res.ok && data.imageDataUrl) {
          const imgMsg: AIMessage = {
            id: generateId(),
            role: "assistant",
            content: "Here you go - I generated that image for you. Want me to tweak it or make another one?",
            timestamp: new Date().toISOString(),
            model: selectedModel,
            image: { dataUrl: data.imageDataUrl, prompt },
          };
          storage.addMessage(currentConvId, imgMsg);
          setMessages((prev) => [...prev, imgMsg]);
          setLoading(false);
          setGeneratingImage(false);
          refresh();
          return;
        }
      } catch {
        // Image generation failed - fall through to a normal chat reply.
      }
      setGeneratingImage(false);
    }

    let response: string;
    let petProposalFirst: ProposedAction | undefined;

try {
        let acc = "";        let agentContext = "";
        const usedModel = selectedModel;
        // Pet chat runs confirm-first: the onProposeAction hook makes the
        // stream interceptor parse-only, so pet actions land as confirm
        // chips instead of auto-executing (same contract as runReply).
        const petProposals: ProposedAction[] = [];
        response = await chatStream(
          llmQuery,
          updatedMessages,
          usedModel,
          {
            ...sendOpts,
            signal: controller.signal,
            onToken: (delta) => {
              if (controller.signal.aborted) return; // deleted mid-stream
              acc += delta;
              setStreamText(acc);
            },
            ...(activePetId
              ? {
                  onProposeAction: (proposal: unknown) => {
                    petProposals.push(proposal as unknown as ProposedAction);
                  },
                }
              : {}),
          },
          agentContext
        );
        petProposalFirst = petProposals.length ? petProposals[0] : undefined;
      } catch (e) {
        setLoading(false);
        setStreamText("");
        // Deleted mid-generation: discard silently, never write into a
        // conversation that no longer exists.
        if (controller.signal.aborted || convDeleted(currentConvId)) {
          abortRef.current = null;
          return;
        }
        if (e instanceof NoorCapError) {
          const capMsg: AIMessage = {
            id: generateId(),
            role: "assistant",
            content: "⭐ You've used all of today's free Noor messages. Your cap resets at midnight — or upgrade to Plus in Settings → Billing for 300 messages a day.",
            timestamp: new Date().toISOString(),
            model: selectedModel,
          };
          storage.addMessage(currentConvId, capMsg);
          setMessages((prev) => [...prev, capMsg]);
          refresh();
          if (!pageMountedRef.current) notifyNoorReply(capMsg.content, currentConvId);
          return;
        }
        const aiMsg: AIMessage = {
          id: generateId(),
          role: "assistant",
          content: "I could not reach my models just now - try again in a moment.",
          timestamp: new Date().toISOString(),
          model: selectedModel,
        };
        storage.addMessage(currentConvId, aiMsg);
        setMessages((prev) => [...prev, aiMsg]);
        refresh();
        if (!pageMountedRef.current) notifyNoorReply(aiMsg.content, currentConvId);
        return;
      }
    const aiMsg: AIMessage = {
      id: generateId(),
      role: "assistant",
      content: stripPetFlavor(response),
      timestamp: new Date().toISOString(),
      model: selectedModel,
      actions: opts?.actions || undefined,
      sources: sources.length ? sources : undefined,
      proposal: petProposalFirst,
    };

    // Deleted while Noor was thinking: discard the reply instead of
    // resurrecting the conversation.
    if (controller.signal.aborted || convDeleted(currentConvId)) {
      setLoading(false);
      setStreamText("");
      abortRef.current = null;
      return;
    }

    storage.addMessage(currentConvId, aiMsg);
    abortRef.current = null;

    const conv = storage.getData().aiConversations.find((c) => c.id === currentConvId);
    if (conv && conv.title === "New Chat" && conv.messages.length <= 2) {
      conv.title = summarizeChatTitle(queryText);
      storage.saveData();
    }

    setMessages((prev) => [...prev, aiMsg]);
    setLoading(false);
    setStreamText("");
    refresh();
    if (!pageMountedRef.current) notifyNoorReply(aiMsg.content, currentConvId);
  };

  const conversations = data.aiConversations;

  // Time-based greeting + a rotating unique line, for the fresh-chat hero.
  const GREETING_SUBTITLES = [
    "What's on your mind?",
    "Let's get something done.",
    "Your workspace is ready.",
    "Ask me anything.",
    "Time to focus.",
    "How can I help?",
    "Ready when you are.",
    "Let's make today count.",
  ];
  // Noor mobile empty state: chats strip above the pill (press-hold to
  // rename/delete), glass pill with inline model picker, big watermark.
  const [mobileChatMenu, setMobileChatMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const mobileMenuHold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdPos = useRef({ x: 0, y: 0 });
  const mobileMenuJustOpened = useRef(false);
  const openMobileChatMenu = (x: number, y: number, id: string) => {
    mobileMenuJustOpened.current = true;
    setMobileChatMenu({ x, y, id });
    haptic.tick();
  };
  const startMobileHold = (e: React.TouchEvent, id: string) => {
    const t0 = e.touches[0];
    holdPos.current = { x: t0.clientX, y: t0.clientY };
    mobileMenuJustOpened.current = false;
    if (mobileMenuHold.current) clearTimeout(mobileMenuHold.current);
    mobileMenuHold.current = setTimeout(() => {
      openMobileChatMenu(holdPos.current.x, holdPos.current.y, id);
    }, 480);
  };
  const cancelMobileHold = () => {
    if (mobileMenuHold.current) { clearTimeout(mobileMenuHold.current); mobileMenuHold.current = null; }
  };
  const tapMobileChat = (id: string) => {
    // A just-fired long-press must not ALSO load the chat on release.
    if (mobileMenuJustOpened.current) { mobileMenuJustOpened.current = false; return; }
    loadConversation(id);
  };
  const mobileChatsSorted = [...conversations].sort(
    (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const greeting = (() => {
    const h = new Date().getHours();
    const base =
      h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    const day = Math.floor(Date.now() / 86400000);
    const sub = GREETING_SUBTITLES[day % GREETING_SUBTITLES.length];
    return { base, sub };
  })();

  // Turn a raw first message into a short, human conversation title.
  const summarizeChatTitle = (raw: string): string => {
    let t = raw.trim().replace(/\s+/g, " ");
    t = t
      .replace(
        /^(?:hey|hi|hello|yo|ok|okay|please|can you|could you|would you|will you|do you think you can|i want you to|make me|create|add|write|set up|remind me to|tell me|help me)\s+/i,
        ""
      )
      .replace(/^(?:a|an|the)\s+/i, "")
      .replace(/[?.!]+$/, "");
    if (t.length > 42) t = t.slice(0, 42).trim() + "\u2026";
    return t || raw.trim().slice(0, 42);
  };

  const startRename = (convId: string, currentTitle: string) => {
    setRenamingId(convId);
    setRenameValue(currentTitle);
    setTimeout(() => renameInputRef.current?.focus(), 30);
  };
  const commitRename = () => {
    const v = renameValue.trim();
    if (renamingId && v) {
      storage.updateConversation(renamingId, { title: v.slice(0, 60) });
      refresh();
    }
    setRenamingId(null);
  };
  const cancelRename = () => setRenamingId(null);

  const isEmptyChat =
    messages.length === 0 &&
    !loading &&
    !generatingImage &&
        !searching;

  // Chat-with-pet context (derived; roster() reads the local store like
  // every other render-time storage read on this page).
  const petAgent = petAgentId ? petRoster().find((a) => a.id === petAgentId) || null : null;
  const petJob = petAgent ? jobByRole(petAgent.role) : null;
  const petCosmetic = petAgent ? petById(petAgent.petId) : null;
  const petHasJob = petAgent ? roleHasJob(petAgent.role) : false;
  const runPetJobNow = () => {
    if (!petAgent) return;
    if (petAgent.role === "scout") {
      const job = pendingScoutJob(petAgent.id);
      if (job) {
        setActiveScout(true);
        kickScoutRunner();
      } else {
        setInput("assign: ");
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } else {
      runRoleNow(petAgent.id);
    }
  };

  const loadingText = researchState.active
    ? researchState.stageDetail
    : generatingImage
    ? t("assistant.generatingImage")
    : searching
    ? t("assistant.searchingWeb")
    : selectedModel === "novella-low"
    ? t("assistant.processing")
    : t("assistant.responding");


  // Conversations panel content (shared between desktop side panel and mobile drawer)
  const chatsPanel = (onClose?: () => void) => {
    const q = chatSearch.trim().toLowerCase();
    const filtered = q
      ? conversations.filter(
          (conv) =>
            conv.title.toLowerCase().includes(q) ||
            conv.messages.some((m) => m.content.toLowerCase().includes(q))
        )
      : conversations;
    const sorted = [...filtered].sort(
      (a, b) =>
        (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="font-semibold text-sm tracking-tight">{t("assistant.chats")}</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={exportChat}
              disabled={messages.length === 0}
              className="btn-ghost p-1.5 rounded-xl hover:bg-secondary transition-colors disabled:opacity-30"
              title={t("assistant.exportChat")}
            >
              <Download className="h-4 w-4" />
            </button>
            <button onClick={startNewChat} className="btn-ghost p-1.5 rounded-xl hover:bg-secondary transition-colors" title={t("assistant.newChat")}>
              <Plus className="h-4 w-4" />
            </button>
            {onClose && (
              <button onClick={onClose} className="btn-ghost p-1.5 rounded-xl hover:bg-secondary transition-colors" title={t("assistant.hideChats")}>
                <XIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
          <input
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            placeholder={t("assistant.searchChats")}
            className="w-full rounded-xl border border-border bg-secondary/40 pl-9 pr-3 py-2 text-xs outline-none transition-colors focus:border-primary-500/40"
          />
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
          {sorted.map((conv) => (
            <div
              key={conv.id}
              role="button"
              tabIndex={0}
              onClick={() => { loadConversation(conv.id); setShowChats(false); }}
              onKeyDown={(e) => {
                // Only when the row itself is focused: keystrokes inside the
                // rename <input> (space, enter) must keep native behavior.
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  loadConversation(conv.id);
                  setShowChats(false);
                }
              }}
              className={cn(
                "w-full cursor-pointer text-left rounded-xl px-3 py-2.5 text-sm transition-all duration-200 group",
                conversationId === conv.id
                  ? "bg-primary-500/10 text-primary-500"
                  : "hover:bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="flex items-center gap-2">
                {conv.pinned ? (
                  <Pin className="h-3.5 w-3.5 shrink-0 text-primary-500 fill-primary-500/30" />
                ) : (
                  <MessageSquare className="h-4 w-4 shrink-0" />
                )}
                {renamingId === conv.id ? (
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.stopPropagation(); commitRename(); }
                      else if (e.key === "Escape") { e.stopPropagation(); cancelRename(); }
                    }}
                    onBlur={commitRename}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full min-w-0 rounded-md border border-primary-500/40 bg-background px-1.5 py-0.5 text-xs outline-none"
                  />
                ) : (
                  <span className="truncate text-xs">{conv.title}</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); startRename(conv.id, conv.title); }}
                  className="touch-reveal shrink-0 p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary-500"
                  title={t("assistant.rename")}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); togglePin(conv.id); }}
                  className={cn(
                    "touch-reveal shrink-0 p-0.5 transition-opacity hover:text-primary-500",
                    conv.pinned ? "opacity-100 text-primary-500" : "opacity-0 group-hover:opacity-100"
                  )}
                  title={conv.pinned ? t("assistant.unpin") : t("assistant.pin")}
                >
                  <Pin className="h-3 w-3" />
                </button>
                <button
                  onClick={(e) => deleteConversation(conv.id, e)}
                  className="touch-reveal shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-red-500"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-1">
                {conv.pinned && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary-500/15 text-primary-500">
                    {t("assistant.pinned")}
                  </span>
                )}
                <p className="text-[10px] text-muted-foreground/60">{conv.messages.length} {conv.messages.length !== 1 ? t("assistant.msgs") : t("assistant.msg")}</p>
                {conv.messages.length > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground/60">
                    {msgLabel(conv.messages[conv.messages.length - 1].model)}
                  </span>
                )}
              </div>
            </div>
          ))}
          {sorted.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              {conversations.length === 0 ? t("assistant.noConversations") : t("assistant.noMatches")}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div ref={rootRef} className="fixed inset-0 z-0 flex gap-6 overflow-hidden md:relative md:inset-auto md:z-auto md:h-dvh">
      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Header */}
        {/* Header — mobile clears the floating glass buttons (top-3 + 40px tall,
            same 64px clearance the shell gives other pages); compact again at
            md where the buttons unmount. */}
        <div className={cn("shrink-0 flex items-center justify-between gap-2 border-border/60 px-3 pt-[calc(4rem+env(safe-area-inset-top,0px))] pb-2.5 md:px-6 md:pt-[calc(0.75rem+env(safe-area-inset-top))] md:pb-3",
          "border-b-0", "md:border-b")}>
          <div className="flex items-center min-w-0 gap-1">
            {!isMobile && (
              <img
                src="/noor-mark-white.png"
                alt="Noor"
                className="h-8 w-8 object-contain invert dark:invert-0 sm:h-9 sm:w-9"
              />
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Model picker — desktop only on this bar; mobile picks the model
                from the chip inside the composer pill. */}
            <div className={cn("relative", isMobile && "hidden")} ref={modelPickerRef}>
              <button
                onClick={() => {
                  const next = !showModelPicker;
                  setShowModelPicker(next);
                  // Refresh the local-install status every time the picker
                  // opens so the ready dots are never stale.
                  if (next) void probeOllama().then(setOllama);
                }}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 border sm:px-3.5 sm:py-2.5",
                  "hover:bg-secondary",
                  showModelPicker ? "border border-foreground/40 text-foreground" : "border border-transparent"
                )}
              >
                <span className="hidden sm:inline">{MODEL_META[selectedModel] || msgLabel(selectedModel)}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", showModelPicker && "rotate-180")} />
              </button>
              <AnimatePresence>
                {showModelPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full right-0 mt-2 w-72 max-w-[calc(100vw-3rem)] sm:w-80 bg-background border border-border rounded-2xl shadow-2xl p-2 z-50"
                  >
                    <p className="text-[9px] font-mono tracking-wider text-muted-foreground/40 px-3 py-1.5 uppercase">{t("assistant.models")}</p>
                    {/* Novella 5.0 — one model, effort slider (Faster ←→ Smarter) */}
                    <div className="px-2 pb-1 pt-0.5">
                      <div className="flex items-center gap-2 px-1.5 pb-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary-500" />
                        <span className="text-xs font-semibold text-foreground">Novella 5.0</span>
                        <span className="text-[10px] text-muted-foreground/70">one brain, six efforts</span>
                      </div>
                      <EffortSlider value={effortOf(selectedModel)} onChange={lv => changeModel(effortModelId(lv), { keepOpen: true })} />
                    </div>
                    <div className="my-1.5 h-px bg-border/60" />
                    {/* ---- Local AI (Ollama) — runs on this computer, no cap ---- */}
                    <button
                      onClick={() => {
                        const next = !localOpen;
                        setLocalOpen(next);
                        if (next && !ollama) void probeOllama().then(setOllama);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-200 hover:bg-secondary"
                    >
                      <Laptop className="h-4 w-4 text-emerald-500" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{t("assistant.localAI")}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{t("assistant.localAISub")}</p>
                      </div>
                      <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", localOpen && "rotate-180")} />
                    </button>
                    {localOpen && (
                      <div className="mt-1 space-y-0.5">
                        {ollama && !ollama.reachable && (
                          <div className="mx-1 mb-1 rounded-xl bg-amber-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
                            {t("assistant.localAIUnreachable")}
                            <span className="mt-1 block break-all font-mono text-[10px] opacity-80">{ollamaSetupHint()}</span>
                          </div>
                        )}
                        {LOCAL_MODELS.map((m) => {
                          const active = selectedModel === m.id;
                          const installed = ollama ? isModelInstalled(ollama, m) : null;
                          return (
                            <button
                              key={m.id}
                              onClick={() => changeModel(m.id)}
                              className={cn(
                                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200",
                                active ? "bg-primary-500/10 ring-1 ring-primary-500/20" : "hover:bg-secondary"
                              )}
                            >                              <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={m.logo}
                                  alt=""
                                  className={cn("absolute inset-0 h-full w-full rounded-lg object-contain p-1.5", m.logoDark && "dark:hidden")}
                                  onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                                />
                                {m.logoDark && (
                                  <img
                                    src={m.logoDark}
                                    alt=""
                                    className="absolute inset-0 h-full w-full rounded-lg object-contain p-1.5 hidden dark:block"
                                    onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                                  />
                                )}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{m.name}</span>
                                  <span className="text-[10px] text-muted-foreground/60">{m.family}</span>
                                  {active && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary-500/20 text-primary-500">{t("assistant.active")}</span>}
                                </div>
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => { e.stopPropagation(); setLocalInfo(m); }}
                                  className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 transition-colors hover:text-foreground"
                                >
                                  <Info className="h-3 w-3" />
                                  {t("assistant.localInfo")}
                                </span>
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-0.5">
                                <span className="text-[10px] text-muted-foreground/70">~{m.sizeGb} GB</span>
                                {installed !== null && installed && (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500"><Check className="h-3 w-3" />{t("assistant.localReady")}</span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                        <p className="px-3 pb-1 pt-1.5 text-[10px] leading-relaxed text-muted-foreground/60">{t("assistant.localAIHint")}</p>
                      </div>
                    )}
                    <div className="my-1.5 h-px bg-border/60" />
                    <a
                      href="/settings?cat=skills"
                      className="flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-200 hover:bg-secondary"
                    >
                      <Zap className="h-4 w-4 text-amber-500" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{t("skills.title")}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{t("skills.pickerHint")}</p>
                      </div>
                    </a>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {/* Chats toggle — desktop only. On mobile the "Chats" button above
                the pill replaces it in the empty state. */}
            {!isMobile && (
              <button
                onClick={() => setShowChats(!showChats)}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-200 sm:h-10 sm:w-10",
                  showChats
                    ? "bg-primary-500/10 border-primary-500/30 text-primary-500"
                    : "border-transparent hover:bg-secondary text-muted-foreground"
                )}
                title={showChats ? t("assistant.hideChats") : t("assistant.showChats")}
                aria-label={showChats ? t("assistant.hideChats") : t("assistant.showChats")}
                aria-expanded={showChats}
              >
                <PanelRight className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Noor watermark — mobile empty state only: big mark, 50% transparent,
            centered above the pill. Purely decorative. */}
        {isMobile && isEmptyChat && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/noor-mark-white.png"
              alt=""
              className="h-44 w-44 object-contain opacity-10 invert dark:invert-0"
            />
          </div>
        )}

        {/* Messages */}
        <div ref={messagesBoxRef} className={cn("flex-1 overflow-y-auto px-2 md:px-6", isEmptyChat && "hidden")}>
          <div className="noor-chat-font mx-auto w-full py-6 space-y-6 md:py-8">
            {messages.map((msg) => {
              if (msg.role === "user") {
                const isEditing = editingId === msg.id;
                return (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="group flex flex-col items-end">
                    <div className="max-w-[85%] rounded-[28px] rounded-br-lg bg-primary-500/15 border border-primary-500/20 px-5 py-3 text-[15px] text-foreground">
                      {isEditing ? (
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              void saveEdit(msg.id);
                            }
                            if (e.key === "Escape") { setEditingId(null); setEditText(""); }
                          }}
                          autoFocus
                          rows={3}
                          className="w-full min-w-[260px] max-w-[420px] resize-none bg-transparent outline-none leading-relaxed"
                        />
                      ) : (
                        <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                      )}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {msg.attachments.map((a) =>
                            a.kind === "image" ? (
                              <img
                                key={a.name + (a.dataUrl || "").slice(0, 24)}
                                src={a.dataUrl || ""}
                                alt={a.name}
                                className="h-16 w-16 rounded-xl border border-primary-500/30 object-cover"
                              />
                            ) : (
                              <span
                                key={a.name}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-primary-500/30 bg-secondary/40 px-2 py-1 text-[11px] text-foreground/80"
                              >
                                <FileText className="h-3 w-3" />
                                {a.name}
                              </span>
                            )
                          )}
                        </div>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="mt-1.5 flex items-center gap-2">
                        <button
                          onClick={() => void saveEdit(msg.id)}
                          disabled={loading || !editText.trim()}
                          className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1 text-[11px] font-medium text-background transition-all hover:opacity-90 disabled:opacity-40"
                        >
                          <Check className="h-3 w-3" /> Save
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditText(""); }}
                          className="rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingId(msg.id); setEditText(msg.content); }}
                        disabled={loading}
                        title={t("assistant.editMessage")}
                        className="touch-reveal mt-1.5 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/40 opacity-0 transition-all hover:bg-secondary hover:text-foreground group-hover:opacity-100 disabled:opacity-0"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </motion.div>
                );
              }
              if (msg.kind === "usage-warning") {
                return (
                  <motion.div key={msg.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="flex w-full justify-center py-1">
                    <div className="max-w-[85%] rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-center text-xs text-amber-600 dark:text-amber-400">
                      {msg.content}
                    </div>
                  </motion.div>
                );
              }
              const msgModel = resolveModelId(msg.model || "core-1");
              return (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="group flex justify-start">
                  {/* Noor replies are plain text — no bubble, no chrome. The
                      user's own messages keep their bubble for contrast. */}
                  <div className="max-w-[92%] py-1">
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-foreground/50">Noor</span>
                      <span className="text-[10px] text-muted-foreground/40">· {MODEL_META[msgModel]}</span>
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40">{t("assistant.aiLabel")}</span>
                    </div>
                    <div className="text-[15px] leading-relaxed text-foreground/90">
                      <Markdown content={msg.content} />
                      {msg.proposal && <ProposalChip msg={msg} onConfirm={() => confirmProposal(msg)} onDismiss={() => dismissProposal(msg)} />}
                      {msg.image && (
                        <div className="mt-2">
                          <div className="max-w-[min(100%,340px)] overflow-hidden rounded-2xl border border-border">
                            <ImageLoader
                              src={typeof msg.image === "string" ? msg.image : msg.image.dataUrl}
                              alt={typeof msg.image === "string" ? "" : msg.image.prompt}
                              gridSize={14}
                              cellGap={10}
                              cellShape="square"
                              cellColor="#52525b"
                              blinkSpeed={1400}
                              transitionDuration={500}
                              fadeOutDuration={600}
                              loadingDelay={600}
                              className="cursor-zoom-in"
                              onClick={() => {
                                const src = typeof msg.image === "string" ? msg.image : msg.image?.dataUrl;
                                if (!src) return;
                                setPreviewAttachment({ id: msg.id, name: `noor-${msg.id}.png`, dataUrl: src, size: 0, kind: "image" } as unknown as Attachment);
                              }}
                            />
                          </div>
                          <p className="mt-1.5 text-[11px] text-muted-foreground/60">{typeof msg.image === "string" ? "" : msg.image.prompt}</p>
                        </div>
                      )}
                    </div>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {msg.sources.slice(0, 6).map((s, i) => (
                          <a
                            key={s.kind + s.id + i}
                            href={s.href}
                            target={s.kind === "web" ? "_blank" : undefined}
                            rel={s.kind === "web" ? "noreferrer" : undefined}
                            title={s.snippet || s.title}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary-500/40 hover:text-foreground"
                          >
                            {sourceIcon(s.kind)}
                            <span className="max-w-[140px] truncate">{s.title}</span>
                          </a>
                        ))}
                      </div>
                    )}
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {msg.actions.map((a) => {
                          const dk = `${a.type}:${a.id}`;
                          const done = actionDone(a);
                          return (
                            <button
                              key={dk}
                              onClick={() => handleBriefAction(a)}
                              disabled={done}
                              title={a.detail}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95 disabled:cursor-default",
                                done
                                  ? "border-green-500/40 bg-green-500/10 text-green-500"
                                  : "border-primary-500/40 bg-primary-500/10 text-primary-500 hover:bg-primary-500/20"
                              )}
                            >
                              {done ? (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {t("assistant.actionDone")}
                                </>
                              ) : (
                                a.label
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {msg.research && (
                      <div className="mt-3">
                        <ResearchCard
                          deliverable={msg.research.deliverable}
                          sources={msg.research.sources}
                          defaultOpen={researchOpen[msg.id] !== false}
                          onSendToTasks={() => {
                            const d = msg.research!.deliverable;
                            if (!d.actionItems) return;
                            for (const a of d.actionItems) {
                              storage.createTask({
                                title: a.task,
                                description: a.context || "",
                                status: "todo",
                                priority: a.priority,
                                dueDate: null,
                                dueTime: null,
                                completedAt: null,
                                tags: ["research"],
                                listId: "inbox",
                                projectId: null,
                                recurring: "none",
                                recurringDays: undefined,
                                recurringEndDate: null,
                                estimatedMinutes: null,
                              });
                            }
                            refresh();
                          }}
                          onSaveAsNote={() => {
                            const d = msg.research!.deliverable;
                            const md = deliverableToMarkdown(d, msg.research!.sources);
                            storage.createNote({
                              title: d.title,
                              content: md,
                              contentHtml: "",
                              folderId: null,
                              projectId: null,
                              tags: ["research"],
                              pinned: false,
                              archived: false,
                              favorite: false,
                            });
                            refresh();
                          }}
                          onExportDeck={() => {
                            const d = msg.research!.deliverable;
                            if (!d.deck) return;
                            storage.createDeck({
                              title: d.deck.title,
                              description: d.deck.description,
                              slides: d.deck.slides.map((sl) => ({
                                id: generateId(),
                                layout: sl.layout,
                                kicker: sl.kicker,
                                title: sl.title,
                                content: sl.content || [""],
                                contentRight: sl.contentRight,
                                stats: sl.stats,
                                notes: sl.notes || "",
                                accent: undefined,
                              })),
                              theme: "midnight",
                              transition: "fade",
                            });
                            refresh();
                            router.push("/deck");
                          }}
                          onExportMarkdown={() =>
                            downloadResearchMarkdown(msg.research!.deliverable, msg.research!.sources)
                          }
                        />
                      </div>
                    )}
                    <div className="mt-2.5 flex items-center gap-1">
                      <p className="text-[10px] text-muted-foreground/40">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {msg.branch && (
                        <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-primary-500/15 text-primary-500">
                          {t("assistant.branching")}
                        </span>
                      )}
                      <span className="flex-1" />
                      <button
                        onClick={() => void copyMessage(msg.id, msg.content)}
                        title={copiedId === msg.id ? t("assistant.copied") : t("assistant.copy")}
                        className="touch-reveal flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/40 opacity-0 transition-all hover:bg-secondary hover:text-foreground group-hover:opacity-100"
                      >
                        {copiedId === msg.id ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <CopyIcon className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        onClick={() => void regenerate(msg.id)}
                        disabled={loading || branchingId === msg.id}
                        title={t("assistant.regenerate")}
                        className="touch-reveal flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/40 opacity-0 transition-all hover:bg-secondary hover:text-foreground group-hover:opacity-100 disabled:opacity-30"
                      >
                        {branchingId === msg.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            {(loading || researchState.active) && (
              streamText ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-start"
                >
                  <div className="max-w-[85%] rounded-[28px] rounded-bl-lg bg-card border border-border px-5 py-3 text-[15px]">
                    <Markdown content={streamText} />
                    <span className="mt-1 inline-block h-4 w-[2px] animate-pulse bg-foreground/60" aria-hidden="true" />
                  </div>
                </motion.div>
              ) : (
                <div className="flex items-center gap-3 pl-1">
                  <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/50 px-3.5 py-2.5" aria-hidden="true">
                    <ThinkingOrb state="solving" size={20} theme="dark" />
                  </div>
                  <span className="text-sm text-muted-foreground/80">{loadingText}</span>
                </div>
              )
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Mobile chat long-press menu (press-hold a chat chip above the pill) */}
        {mobileChatMenu && (
          <>
            <div className="fixed inset-0 z-[190]" onClick={() => setMobileChatMenu(null)} />
            <div
              className="fixed z-[200] w-48 overflow-hidden rounded-2xl border border-border/60 bg-popover shadow-2xl"
              style={{
                left: Math.max(8, Math.min(mobileChatMenu.x, (typeof window !== "undefined" ? window.innerWidth : 400) - 200)),
                top: Math.max(8, Math.min(mobileChatMenu.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 200)),
              }}
            >
              <button
                onClick={() => { startRename(mobileChatMenu.id, conversations.find((c) => c.id === mobileChatMenu.id)?.title || ""); setMobileChatMenu(null); setShowChats(true); }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
              >
                <Pencil className="h-3.5 w-3.5" /> {t("assistant.rename")}
              </button>
              <button
                onClick={() => { const id = mobileChatMenu.id; setMobileChatMenu(null); deleteConversation(id, { stopPropagation: () => {} } as unknown as React.MouseEvent); }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-destructive transition-colors hover:bg-muted"
              >
                <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
              </button>
            </div>
          </>
        )}

        {/* Input */}
        <div
          className={cn(
            "shrink-0 px-3 pb-12 sm:px-6 sm:pb-6",
            isEmptyChat
              ? "flex-1 flex flex-col justify-end bg-background/80 backdrop-blur-sm pt-0 sm:pt-4 lg:items-center lg:justify-center lg:bg-transparent lg:backdrop-blur-none lg:pt-0"
              : "bg-background/80 backdrop-blur-sm pt-0 sm:pt-4"
          )}
        >
          <div className={cn("w-full", isEmptyChat ? "mx-auto lg:max-w-2xl" : "mx-auto lg:max-w-4xl")}>
            {/* Mobile: chats access lives in the floating glass circle
                (second row, under the hamburger) rendered at page root. */}
            {/* Pet chat empty state: pet face + one-tap job prompts. */}
            {isEmptyChat && petAgent && !loading && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                {petCosmetic && (
                  <span
                    className="h-6 w-6 shrink-0"
                    dangerouslySetInnerHTML={{ __html: petSvg(petCosmetic, "h-full w-full") }}
                  />
                )}
                <span className="mr-1 text-xs font-semibold text-foreground">
                  {t("assistant.chattingWith", "Chatting with")} {petAgent.name}
                </span>
                <span className="mr-1 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {petJob?.icon} {t(`petjob.${petAgent.role}.name`, petJob?.name || petAgent.role)}
                </span>
                {petAgent.role === "scout" ? (
                  <div className="flex w-full items-center gap-1.5">
                    <input
                      value={pendingScoutTopic}
                      onChange={(e) => setPendingScoutTopic(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && pendingScoutTopic.trim()) submitScoutTopic(petAgent.id);
                      }}
                      placeholder={t("petagent.scout.placeholder", "Assign a research job — e.g. “Compare 3 flagship phones, prices in EUR”")}
                      className="min-w-0 flex-1 rounded-full border border-border/70 bg-secondary/60 px-4 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary-500/50 focus:outline-none"
                    />
                    <button
                      onClick={() => submitScoutTopic(petAgent.id)}
                      disabled={!pendingScoutTopic.trim()}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary-500 px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {t("petagent.scout.assign", "Assign job")}
                    </button>
                  </div>
                ) : (
                  (petAgent.role === "wrangler"
                    ? [
                        t("petagent.chip.sweep", "Sweep my overdue tasks"),
                        t("petagent.chip.duetoday", "What should I do today?"),
                      ]
                    : [
                        t("petagent.chip.huddle", "What's on for today?"),
                        t("petagent.chip.howhelp", "What can you do for me?"),
                      ]
                  ).map((label) => (
                    <button
                      key={label}
                      onClick={() => sendMessage(label)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-secondary/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-primary-500/40 hover:text-foreground hover:bg-secondary active:scale-95"
                    >
                      <PawPrint className="h-3 w-3 text-primary-500" />
                      {label}
                    </button>
                  ))
                )}
              </div>
            )}
            {/* Scout is literally working: visible, honest status chip. */}
            {activeScout && (
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary-500/30 bg-primary-500/5 px-3 py-1.5 text-xs font-medium text-primary-600">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500" />
                {t("petagent.scout.working", "🔭 Scout is on the job — findings will land here")}
              </div>
            )}
            {!isEmptyChat && !input.trim() && !loading && !generatingImage && !searching && (
              <div className="mb-2 flex flex-wrap justify-start gap-1.5">
                {petAgent && (
                  <button
                    onClick={() => router.push("/pets")}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-secondary/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-primary-500/40 hover:text-foreground hover:bg-secondary active:scale-95"
                  >
                    <PawPrint className="h-3 w-3 text-primary-500" />
                    {petAgent.name}
                  </button>
                )}
                {petHasJob && (
                  <button
                    onClick={runPetJobNow}
                    title={t("petagent.runNowHint", "Trigger this pet's job right now")}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-secondary/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-primary-500/40 hover:text-foreground hover:bg-secondary active:scale-95"
                  >
                    <PawPrint className="h-3 w-3 text-primary-500" />
                    {petAgent?.role === "scout"
                      ? t("petagent.runJob", "New job")
                      : t("petagent.runNow", "Run now")}
                  </button>
                )}
                <button
                  onClick={requestDailyBrief}
                  title={t("assistant.dailyBriefHint")}
                  aria-label={t("assistant.dailyBrief")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-secondary/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-primary-500/40 hover:text-foreground hover:bg-secondary active:scale-95"
                >
                  <MessageSquare className="h-3 w-3 text-primary-500" />
                  {t("assistant.dailyBrief")}
                </button>
              </div>
            )}
            {/* On mobile the pill IS the Liquid Glass control: bigger (52px),
                squircle corners (iOS-style, not a full pill), model picker
                inside on the left, + and mic on the right. Desktop keeps the
                exact previous composer. */}
            <div
              className={cn(
                isMobile
                  ? "orleia-search-glass noor-composer-pill pl-2 pr-1.5 py-1.5 " + (composerMultiline || attachments.length > 0 ? "rounded-[24px]" : "rounded-[26px]")
                  : "bg-secondary/40 pl-4 pr-2 py-2 " + (composerMultiline || attachments.length > 0 ? "rounded-[20px]" : "rounded-full")
              )}
            >
              {/* Inline model picker (mobile): the current model as a chip.
                  The dropdown reuses showModelPicker state; on mobile it is
                  anchored HERE (bottom-full) instead of the hidden header. */}
              {isMobile && (
                <div className="relative order-first mr-2" ref={modelPickerRef}>
                  <button
                    onClick={() => {
                      const next = !showModelPicker;
                      setShowModelPicker(next);
                      if (next) void probeOllama().then(setOllama);
                    }}
                    className="flex h-9 items-center gap-1 rounded-full bg-background/60 px-2.5 text-xs font-medium text-muted-foreground transition-all active:scale-95"
                    aria-label={t("assistant.models")}
                  >
                    <span>{MODEL_META[selectedModel] || msgLabel(selectedModel)}</span>
                    <ChevronDown className={cn("h-3 w-3 transition-transform", showModelPicker && "rotate-180")} />
                  </button>
                  {showModelPicker && (
                    <div className="absolute bottom-full left-0 mb-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-background shadow-2xl p-2 z-50">
                      <p className="text-[9px] font-mono tracking-wider text-muted-foreground/40 px-3 py-1.5 uppercase">{t("assistant.models")}</p>
                      {/* Novella 5.0 — one model, six effort levels */}
                      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
                        <Sparkles className="h-3.5 w-3.5 text-primary-500" />
                        <span className="text-xs font-semibold text-foreground">Novella 5.0</span>
                        <span className="text-[10px] text-muted-foreground/70">one brain, six efforts</span>
                      </div>
                      {/* Novella 5.0 effort slider (embedded) */}
                      <div className="px-2 pb-1 pt-0.5">
                        <EffortSlider value={effortOf(selectedModel)} onChange={lv => changeModel(effortModelId(lv), { keepOpen: true })} />
                      </div>
                      <div className="my-1.5 h-px bg-border/60" />
                      <button
                        onClick={() => { const next = !localOpen; setLocalOpen(next); if (next && !ollama) void probeOllama().then(setOllama); }}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-200 hover:bg-secondary"
                      >
                        <Laptop className="h-4 w-4 text-emerald-500" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{t("assistant.localAI")}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{t("assistant.localAISub")}</p>
                        </div>
                        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", localOpen && "rotate-180")} />
                      </button>
                      {localOpen && LOCAL_MODELS.map((m) => {
                        const active = selectedModel === m.id;
                        const installed = ollama ? isModelInstalled(ollama, m) : null;
                        return (
                          <button
                            key={m.id}
                            onClick={() => changeModel(m.id)}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200",
                              active ? "bg-primary-500/10 ring-1 ring-primary-500/20" : "hover:bg-secondary"
                            )}
                          >
                            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={m.logo}
                                alt=""
                                className={cn("absolute inset-0 h-full w-full rounded-lg object-contain p-1.5", m.logoDark && "dark:hidden")}
                                onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                              />
                              {m.logoDark && (
                                <img
                                  src={m.logoDark}
                                  alt=""
                                  className="absolute inset-0 h-full w-full rounded-lg object-contain p-1.5 hidden dark:block"
                                  onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                                />
                              )}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{m.name}</span>
                                <span className="text-[10px] text-muted-foreground/60">{m.family}</span>
                              </div>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); setLocalInfo(m); }}
                                className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 transition-colors hover:text-foreground"
                              >
                                <Info className="h-3 w-3" />
                                {t("assistant.localInfo")}
                              </span>
                            </div>
                            {installed !== null && installed && (
                              <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-emerald-500"><Check className="h-3 w-3" />{t("assistant.localReady")}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {/* Attached items live INSIDE the composer - thumbnail row on top,
                  ChatGPT-style. No filenames; the thumbnail is the label. */}
              {attachments.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2 pl-1 pt-1">
                  {attachments.map((a) => (
                    <div key={a.id} className="orleia-attach-in relative shrink-0">
                      {a.kind === "image" ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={a.dataUrl || ""}
                          alt=""
                          className="h-14 w-14 rounded-xl object-cover cursor-zoom-in"
                          onClick={() => setPreviewAttachment(a)}
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-secondary">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <button
                        onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id!))}
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground/85 text-background"
                        aria-label={"Remove " + a.name}
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    </div>
                  ))}                </div>
              )}
              {/* Live dictation feedback: interim words + readable errors.
                  Previously errors were set but never rendered - dictation
                  looked silently broken in browsers that block the service. */}
              {(voiceListening || voiceError) && (
                <div className="px-1 pb-2">
                  {voiceError ? (
                    <p className="text-xs text-red-500">{voiceError}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-red-500 align-middle" />
                      {voiceInterim || "\u2026"}
                    </p>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="relative shrink-0" ref={plusRef}>
                <button
                  onClick={() => setPlusOpen(!plusOpen)}
                  aria-label={t("assistant.attach")}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground active:scale-95",
                    plusOpen && "border border-foreground/40 text-foreground"
                  )}
                >
                  <Plus className="h-5 w-5" />
                </button>
                {plusOpen && (
                  <div className="absolute bottom-full left-0 z-30 mb-2 w-60 rounded-2xl border border-border bg-background/95 p-1.5 shadow-xl backdrop-blur-md">
                    {/* Take a photo must "just do the thing": the in-app mini
                        camera when one exists, otherwise straight to the native
                        camera app via the capture attribute - no OS chooser. */}
                    <button
                      onClick={() => {
                        setPlusOpen(false);
                        const inp = imageInputRef.current;
                        inp?.removeAttribute("capture");
                        if (typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function") {
                          setCameraOpen(true);
                        } else if (inp) {
                          inp.setAttribute("capture", "environment");
                          inp.click();
                        }
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-secondary"
                    >
                      <Camera className="h-4 w-4 text-primary-500" />
                      {t("assistant.takePhoto")}
                    </button>
                    <div className="my-1 h-px bg-border/70" />
                    <button
                      onClick={() => { imageInputRef.current?.click(); setPlusOpen(false); }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-secondary"
                    >
                      <ImagePlus className="h-4 w-4 text-primary-500" />
                      {t("assistant.attachImage")}
                    </button>
                    <button
                      onClick={() => { fileInputRef.current?.click(); setPlusOpen(false); }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-secondary"
                    >
                      <Paperclip className="h-4 w-4 text-primary-500" />
                      {t("assistant.attachFile")}
                    </button>
                    {petRoster().length > 0 && (
                      <>
                        <div className="my-1 h-px bg-border/70" />
                        {petRoster().map((a) => {
                          const pp = petById(a.petId);
                          return (
                            <button
                              key={a.id}
                              onClick={() => { openPetChat(a.id); setPlusOpen(false); }}
                              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-secondary"
                            >
                              {pp && (
                                <span
                                  className="h-5 w-5 shrink-0"
                                  dangerouslySetInnerHTML={{ __html: petSvg(pp, "h-full w-full") }}
                                />
                              )}
                              <span className="flex-1 truncate">
                                {t("assistant.talkToPet", "Talk to {pet}").replace("{pet}", a.name)}
                              </span>
                              <span
                                className={
                                  a.role === "scout" && activeScoutJobs().some((j) => j.agentId === a.id && (j.status === "pending" || j.status === "running"))
                                    ? "shrink-0 rounded-full bg-primary-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-primary-600"
                                    : "shrink-0 text-[10px] text-muted-foreground"
                                }
                              >
                                {a.role === "scout" && activeScoutJobs().some((j) => j.agentId === a.id && (j.status === "pending" || j.status === "running"))
                                  ? t("petagent.scout.workingShort", "working")
                                  : jobByRole(a.role)?.icon}
                              </span>
                            </button>
                          );
                        })}
                      </>
                    )}
                    <button
                      onClick={() => { router.push("/settings?cat=skills"); setPlusOpen(false); }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-secondary"
                    >
                      <Sparkles className="h-4 w-4 text-primary-500" />
                      {t("skills.title")}
                    </button>
                    <div className="my-1 h-px bg-border/70" />
                    <button
                      onClick={() => setResearchMode(!researchMode)}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-secondary"
                    >
                      <Telescope className={cn("h-4 w-4", researchMode ? "text-violet-500" : "text-muted-foreground")} />
                      <span className="flex-1">Research mode</span>
                      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", researchMode ? "bg-violet-500" : "border border-border bg-secondary")}>
                        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", researchMode ? "left-[18px]" : "left-0.5")} />
                      </span>
                    </button>
                  </div>
                )}
              </div>
              <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleAttachImage} />
              <MiniCamera open={cameraOpen} onClose={() => setCameraOpen(false)} onCapture={handleCameraCapture} />
              {/* Attachment preview overlay - tap the thumbnail to inspect.
                  Portaled to <body> so the floating bars can't overlap it;
                  actions: save / copy / share. */}
              {previewAttachment && typeof document !== "undefined" && createPortal(
                <div
                  className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-black/90 p-4"
                  onClick={() => setPreviewAttachment(null)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewAttachment.dataUrl || ""}
                    alt={previewAttachment.name}
                    className="max-h-[70dvh] max-w-full rounded-2xl object-contain shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div
                    className="mt-4 flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = previewAttachment.dataUrl || "";
                        a.download = previewAttachment.name || "orleia-image.png";
                        a.click();
                      }}
                      className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                    >
                      <Download className="h-4 w-4" />
                      {t("common.save")}
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const blob = await (await fetch(previewAttachment.dataUrl || "")).blob();
                          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                        } catch {
                          /* clipboard image unsupported - ignore */
                        }
                      }}
                      className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                    >
                      <Copy className="h-4 w-4" />
                      {t("common.copy", "Copy")}
                    </button>
                    <button
                      onClick={() => { void shareText(previewAttachment.name || "Orleia image", previewAttachment.dataUrl || ""); }}
                      className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                    >
                      <Share2 className="h-4 w-4" />
                      {t("common.share")}
                    </button>
                  </div>
                  <button
                    onClick={() => setPreviewAttachment(null)}
                    className="absolute right-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm"
                    style={{ top: "calc(1rem + env(safe-area-inset-top, 0px))" }}
                    aria-label="Close preview"
                  >
                    <XIcon className="h-5 w-5" />
                  </button>
                </div>,
                document.body
              )}
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleAttachFile} />
              <div className="relative flex flex-1 items-end">
              {mentionToken !== null && mentionMatches.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 z-40 mb-2 max-h-56 overflow-y-auto rounded-2xl border border-border bg-popover p-1 shadow-xl">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("assistant.mentionTitle", "Chat with an agent")}
                  </p>
                  {mentionMatches.map((m, i) => (
                    <button
                      key={m.kind + (m.agent?.id ?? "noor")}
                      type="button"
                      onMouseDown={(ev) => { ev.preventDefault(); insertMention(m.name); }}
                      onMouseEnter={() => setMentionIdx(i)}
                      className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors", i === mentionIdx ? "bg-secondary" : "")}
                    >
                      {m.kind === "agent" && m.agent && mentionPetSvg(m.agent) ? (
                        <span className="h-6 w-6 shrink-0" dangerouslySetInnerHTML={{ __html: mentionPetSvg(m.agent) ?? "" }} />
                      ) : (
                        <PawPrint className="h-4 w-4 shrink-0 text-primary-500" />
                      )}
                      <span className="truncate font-medium">@{m.name}</span>
                      <span className="flex-1 truncate text-right text-xs text-muted-foreground">
                        {m.kind === "agent" && m.agent
                          ? t(`petjob.${m.agent.role}.name`, m.agent.role)
                          : t("assistant.backToNoor", "Back to Noor")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {slashOpen && slashMatches.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 z-40 mb-2 max-h-56 overflow-y-auto rounded-2xl border border-border bg-popover p-1 shadow-xl">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("skills.pick")}</p>
                  {slashMatches.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); insertSkillSlug(s); }}
                      onMouseEnter={() => setSlashIdx(i)}
                      className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors", i === slashIdx ? "bg-secondary" : "")}
                    >
                      <Sparkles className="h-4 w-4 shrink-0 text-primary-500" />
                      <span className="truncate font-medium">/{skillSlug(s.name)}</span>
                      <span className="flex-1 truncate text-muted-foreground">{s.name}</span>
                      {s.enabled && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-500">{t("skills.activeCount")}</span>}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  const v = e.target.value;
                  setInput(v);
                  setSlashOpen(v.startsWith("/") && !v.slice(1).includes(" "));
                  setSlashIdx(0);
                  // @mention token = text after the last "@" before the caret
                  if (mentionPickedRef.current) {
                    mentionPickedRef.current = false;
                    setMentionToken(null);
                  } else {
                    const caret = e.target.selectionStart ?? v.length;
                    const before = v.slice(0, caret);
                    const at = before.lastIndexOf("@");
                    const seg = at === -1 ? null : before.slice(at + 1);
                    setMentionToken(seg !== null && !seg.includes("\n") ? seg : null);
                    setMentionIdx(0);
                  }
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
                onKeyDown={(e) => {
                  if (mentionToken !== null && mentionMatches.length > 0) {
                    if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx((i) => (i + 1) % mentionMatches.length); return; }
                    if (e.key === "ArrowUp") { e.preventDefault(); setMentionIdx((i) => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
                    if (e.key === "Enter" || e.key === "Tab") {
                      e.preventDefault();
                      const m = mentionMatches[mentionIdx] ?? mentionMatches[0];
                      if (m) insertMention(m.name);
                      return;
                    }
                    if (e.key === "Escape") { e.preventDefault(); setMentionToken(null); return; }
                  }
                  if (slashOpen && slashMatches.length > 0) {
                    if (e.key === "ArrowDown") { e.preventDefault(); setSlashIdx((i) => (i + 1) % slashMatches.length); return; }
                    if (e.key === "ArrowUp") { e.preventDefault(); setSlashIdx((i) => (i - 1 + slashMatches.length) % slashMatches.length); return; }
                    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertSkillSlug(slashMatches[slashIdx] ?? slashMatches[0]); return; }
                    if (e.key === "Escape") { e.preventDefault(); setSlashOpen(false); return; }
                  }
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                }}
                placeholder={
                  petAgent
                    ? t("assistant.messagePet", "Message " + petAgent.name)
                    : selectedModel === "novella-low"
                      ? t("assistant.quickQuestion")
                      : t("assistant.messageNoor")
                }
                className="noor-chat-font flex-1 bg-transparent resize-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 text-[15px] py-2 max-h-40 leading-relaxed"
                rows={1}
              />
              </div>
              <button
                onClick={() => {
                  if (voiceListening) { stopVoice(); } else { startVoice(); }
                }}
                disabled={!voiceSupported || loading}
                title={voiceSupported ? t("assistant.tapToSpeak") : t("assistant.voiceUnsupported")}
                aria-label={t("assistant.tapToSpeak")}
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
                  voiceListening ? "border-red-500 bg-red-500/10 text-red-500" : "border-border/60 bg-secondary/40 text-muted-foreground hover:border-primary-500/40 hover:text-foreground"
                )}
              >
                {voiceListening ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}
              </button>
              
              {/* Send button: only when something is typed (replaces the orb). */}
              {!!input.trim() && (
                <button
                  onClick={() => sendMessage()}
                  disabled={loading}
                  className="btn-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                >
                  <Send className="h-5 w-5" />
                </button>
              )}
              </div>
            </div>
            <p className="hidden sm:block text-[10px] text-muted-foreground/40 text-center mt-2">
              {t("assistant.disclaimer")}
            </p>
          </div>
        </div>
      </div>

      {/* Local model info popup — full details (pull command, exact model
          tag, parameters, memory) without cluttering the picker rows. */}
      {localInfo && (
        <div ref={localInfoRef} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-6" onClick={() => setLocalInfo(null)}>
          <div
            role="dialog"
            aria-label={t("assistant.localInfo")}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-3xl border border-border bg-card p-5 shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={localInfo.logo} alt="" className={cn("absolute inset-0 h-full w-full rounded-lg object-contain p-1.5", localInfo.logoDark && "dark:hidden")} />
                {localInfo.logoDark && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={localInfo.logoDark} alt="" className="absolute inset-0 h-full w-full rounded-lg object-contain p-1.5 hidden dark:block" />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{localInfo.name}</p>
                <p className="text-[11px] text-muted-foreground">{localInfo.family}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 text-[12px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">{t("assistant.localInfoTag")}</dt>
                <dd className="break-all text-right font-mono text-[11px]">{localInfo.ollamaTag}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("assistant.localInfoParams")}</dt>
                <dd className="font-medium">{localInfo.params}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("assistant.localInfoRam")}</dt>
                <dd className="font-medium">~{localInfo.vramGb} GB</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">{t("assistant.localInfoPull")}</dt>
                <dd className="break-all text-right font-mono text-[11px]">ollama pull {localInfo.ollamaTag}</dd>
              </div>
            </dl>
            <button
              onClick={() => { void navigator.clipboard?.writeText(`ollama pull ${localInfo.ollamaTag}`); }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-secondary px-3 py-2 text-xs font-medium transition-colors hover:bg-secondary/70"
            >
              <Copy className="h-3.5 w-3.5" />
              <span className="break-all font-mono text-[11px]">ollama pull {localInfo.ollamaTag}</span>
            </button>
            <button
              onClick={() => setLocalInfo(null)}
              className="mt-2 w-full rounded-xl px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      )}

      {/* Mobile: chats access — a floating Liquid Glass circle in a second
          row under the hamburger (matches MobileTopBar's other buttons;
          opens the mobile chats drawer). Rendered at page root so no
          transformed ancestor can trap its fixed positioning. */}
      {isMobile && mobileChatsSorted.length > 0 && (
        <div
          className="orleia-hit-50 left-4 md:hidden"
          style={{ top: "calc(5rem + env(safe-area-inset-top, 0px))" }}
        >
          <button
            onClick={() => { haptic.tick(); setShowChats(true); }}
            className="orleia-glass-btn"
            aria-label={t("assistant.chats")}
          >
            <MessageSquare className="h-5 w-5" />
            {mobileChatsSorted.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-500 px-1 text-[9px] font-bold text-white">
                {mobileChatsSorted.length > 9 ? "9+" : mobileChatsSorted.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Desktop chats panel (right side) - CSS transition so it glides on
          every device (framer-motion is globally disabled on touch UIs to
          kill the tab-switch flicker, which made this snap). */}
      <aside
        aria-hidden={!showChats}
        className={cn(
          "hidden lg:flex flex-col shrink-0 overflow-hidden border-l border-border/60 transition-[width,opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          showChats ? "w-72 opacity-100" : "w-0 opacity-0 translate-x-8 border-transparent"
        )}
      >
        <div className="w-72 shrink-0 h-full pl-6">
          {chatsPanel(() => setShowChats(false))}
        </div>
      </aside>

      {/* Mobile chats drawer — mirrors the Reminders sheet. Portaled to
          <body>: the page wrapper carries framer's will-change (a stacking
          context), so an in-page z-index can never beat the root-level
          Liquid Glass buttons. z-[75] at body level covers them. */}
      {typeof document !== "undefined" && createPortal(
        <>
          <div
            aria-hidden={!showChats}
            onClick={() => setShowChats(false)}
            className={cn(
              "fixed inset-0 z-[65] bg-black/50 backdrop-blur-sm transition-opacity duration-300 ease-out lg:hidden",
              showChats ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
          />
          <aside
            aria-hidden={!showChats}
            role="dialog"
            aria-label={t("assistant.chats")}
            className={cn(
              "fixed inset-y-0 right-0 z-[75] flex w-80 max-w-[calc(100vw-1rem)] flex-col border-l border-border bg-card shadow-2xl lg:hidden",
              "transition-[transform,visibility] duration-300 ease-out will-change-transform",
              showChats ? "translate-x-0 visible" : "pointer-events-none translate-x-full invisible"
            )}
          >
            <div className="flex items-center gap-3 px-4 py-4">
              <MessageSquare className="h-5 w-5 text-primary-500" />
              <h2 className="flex-1 font-semibold">{t("assistant.chats")}</h2>
              <button
                onClick={() => setShowChats(false)}
                className="rounded-lg p-2.5 -m-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t("assistant.closeChats")}
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {chatsPanel()}
            </div>
          </aside>
        </>,
        document.body
      )}
    </div>
  );
}
