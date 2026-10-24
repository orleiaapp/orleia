// ============================================================
// Ximagine client — streaming against /api/ximagine, parsing the
// model's file output, and assembling a sandboxed preview document.
// ============================================================

import type { XFile, XMode, XThemeId } from "@/lib/ximagine";
import { kitHead } from "@/lib/ximagine-kit";

export interface XWireMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface XStreamResult {
  text: string;
  thinking: string;
  finishReason: string | null;
  /** Credits used today / daily limit, from response headers. */
  used: number | null;
  limit: number | null;
  error?: "credit_cap" | "server";
}

interface StreamOnce {
  text: string;
  thinking: string;
  finishReason: string | null;
}

/** Remove <think> traces that leak into content. Handles tags split across chunks. */
function makeThinkFilter() {
  let inThink = false;
  return (chunk: string): string => {
    if (!chunk) return "";
    let out = "";
    let i = 0;
    while (i < chunk.length) {
      if (!inThink) {
        const open = chunk.toLowerCase().indexOf("<think", i);
        if (open === -1) {
          out += chunk.slice(i);
          break;
        }
        out += chunk.slice(i, open);
        const close = chunk.indexOf(">", open);
        if (close === -1) break; // tag opens mid-chunk: hold back the rest
        inThink = true;
        i = close + 1;
      } else {
        const close = chunk.toLowerCase().indexOf("</think>", i);
        if (close === -1) break; // still inside: drop this chunk
        inThink = false;
        i = close + "</think>".length;
      }
    }
    return out;
  };
}

const THINK_OPEN_RE = /<[?]think/gi;

/** Whole-string think-strip for stored/continued text. */
export function stripThink(text: string): string {
  let t = text.replace(/<\/?think[^>]*>/gi, "");
  // Unclosed open-tag remnant (cut mid-stream).
  t = t.replace(THINK_OPEN_RE, "");
  return t;
}

/** Odd fence count => the reply was likely cut mid-file. */
function fencesUnbalanced(text: string): boolean {
  const fences = text.match(/^[ \t]*```/gm);
  return fences ? fences.length % 2 === 1 : false;
}

async function streamOnce(opts: {
  body: Record<string, unknown>;
  onThinking?: (t: string) => void;
  onToken?: (t: string) => void;
  signal?: AbortSignal;
}): Promise<StreamOnce & { ok: boolean; status: number; used: number | null; limit: number | null; creditCap?: boolean }> {
  const res = await fetch("/api/ximagine", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-orleia-device": getDevice() },
    body: JSON.stringify({ ...opts.body, stream: true }),
    signal: opts.signal,
  });

  const usageHeader = res.headers.get("x-ximagine-usage") || "";
  const [usedRaw, limitRaw] = usageHeader.split(",");
  const used = usedRaw && Number.isFinite(parseInt(usedRaw, 10)) ? parseInt(usedRaw, 10) : null;
  const limit = limitRaw && Number.isFinite(parseInt(limitRaw, 10)) ? parseInt(limitRaw, 10) : null;

  if (!res.ok || !res.body) {
    let payload = "";
    try {
      payload = await res.text();
    } catch {
      /* ignore */
    }
    let code = "";
    try {
      code = (JSON.parse(payload) as { error?: string })?.error || "";
    } catch {
      /* ignore */
    }
    return {
      text: "",
      thinking: "",
      finishReason: null,
      ok: false,
      status: res.status,
      used,
      limit,
      creditCap: code === "ximagine_credit_cap",
    };
  }

  const filter = makeThinkFilter();
  let text = "";
  let thinking = "";
  let finishReason: string | null = null;
  let buf = "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  const handleLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const j = JSON.parse(payload) as {
        choices?: { delta?: { content?: string; reasoning_content?: string }; finish_reason?: string | null }[];
      };
      const d = j.choices?.[0]?.delta;
      if (d?.reasoning_content) {
        thinking += d.reasoning_content;
        if (thinking.length > 24_000) thinking = thinking.slice(-24_000);
        opts.onThinking?.(thinking);
      }
      if (d?.content) {
        const clean = filter(d.content);
        if (clean) {
          text += clean;
          opts.onToken?.(clean);
        }
      }
      const fr = j.choices?.[0]?.finish_reason;
      if (fr) finishReason = fr;
    } catch {
      /* partial/keepalive line */
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of block.split("\n")) handleLine(line);
    }
  }
  for (const line of buf.split("\n")) handleLine(line);

  // A model that answers reasoning-only (possible on the oldest fallback)
  // would render as silence — surface the working notes instead.
  if (!text.trim() && thinking.trim()) text = `*(from working notes)*\n\n${thinking.trim()}`;

  return { text, thinking, finishReason, ok: true, status: 200, used, limit };
}

function getDevice(): string {
  try {
    // Same anonymous per-install id Orleia uses; no personal data.
    let id = localStorage.getItem("orleia-device-id");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `x${Date.now().toString(36)}`;
      localStorage.setItem("orleia-device-id", id);
    }
    return id;
  } catch {
    return "anon-device";
  }
}

/**
 * One user turn, with at most one continuation pass when the reply was cut
 * (finish_reason "length" or an unclosed file fence).
 */
export async function ximagineGenerate(opts: {
  messages: XWireMessage[];
  mode: XMode;
  theme: XThemeId;
  /** Current app files (build edits only). */
  files?: XFile[];
  signal?: AbortSignal;
  onThinking?: (t: string) => void;
  onToken?: (t: string) => void;
}): Promise<XStreamResult> {
  const base = { messages: opts.messages, mode: opts.mode, theme: opts.theme, ...(opts.files ? { files: opts.files } : {}) };

  let first: Awaited<ReturnType<typeof streamOnce>>;
  try {
    first = await streamOnce({ body: base, onThinking: opts.onThinking, onToken: opts.onToken, signal: opts.signal });
    if (!first.ok && first.status >= 500) {
      await new Promise((r) => setTimeout(r, 800));
      first = await streamOnce({ body: base, onThinking: opts.onThinking, onToken: opts.onToken, signal: opts.signal });
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { text: "", thinking: "", finishReason: null, used: null, limit: null, error: "server" };
    }
    // Network hiccup: one retry.
    try {
      first = await streamOnce({ body: base, onThinking: opts.onThinking, onToken: opts.onToken });
    } catch {
      return { text: "", thinking: "", finishReason: null, used: null, limit: null, error: "server" };
    }
  }

  if (!first.ok) {
    return {
      text: "",
      thinking: "",
      finishReason: null,
      used: first.used,
      limit: first.limit,
      error: first.creditCap ? "credit_cap" : "server",
    };
  }

  let text = first.text;
  let thinking = first.thinking;
  let finishReason = first.finishReason;
  let used = first.used;
  let limit = first.limit;

  const needsMore =
    !!text.trim() && (finishReason === "length" || fencesUnbalanced(text)) && text.length < 220_000;
  if (needsMore) {
    const cont = await streamOnce({
      body: {
        messages: [
          ...opts.messages,
          { role: "assistant", content: text },
          {
            role: "user",
            content:
              "Continue exactly where you stopped. Do not repeat anything you already wrote, no preamble, no commentary — straight into the continuation.",
          },
        ],
        mode: opts.mode,
        theme: opts.theme,
      },
      onThinking: opts.onThinking,
      onToken: opts.onToken,
      signal: opts.signal,
    });
    if (cont.ok && cont.text.trim()) {
      text += cont.text;
      thinking += cont.thinking ? `\n${cont.thinking}` : "";
      finishReason = cont.finishReason ?? finishReason;
      used = cont.used ?? used;
      limit = cont.limit ?? limit;
    }
  }

  return { text: stripThink(text), thinking, finishReason, used, limit };
}

// ------------------------------------------------------------
// Build parsing: fenced blocks whose info string is "file: <path>"
// ------------------------------------------------------------

function safePath(p: string): string | null {
  const cleaned = p.trim().replace(/^\/+/, "").replace(/\.{2,}/g, "");
  if (!cleaned || cleaned.length > 120) return null;
  if (!/^[a-z0-9 ._()-]+$/i.test(cleaned)) return null;
  return cleaned;
}

/**
 * Map a fence info string to one of the app's files, or null to ignore it.
 * The spec form is `file: <path>`, but the model drifts toward plain
 * language tags (three backticks then html) or a bare filename, so accept
 * those too rather than discarding an otherwise complete build.
 */
function pathFromInfo(info: string): string | null {
  const raw = (info || "").trim();
  if (!raw) return null;
  const fileForm = raw.match(/^file:\s*(.+)$/i);
  if (fileForm) return safePath(fileForm[1]);
  const lang = raw.toLowerCase();
  if (lang === "html" || lang === "htm") return safePath("index.html");
  if (lang === "css") return safePath("styles.css");
  if (lang === "js" || lang === "javascript" || lang === "mjs") return safePath("app.js");
  if (/^[a-z0-9 ._()-]+\.(html?|css|js|mjs)$/i.test(raw)) return safePath(raw);
  return null;
}


export interface ParsedBuild {
  files: XFile[];
  prose: string;
}

export function parseBuild(raw: string): ParsedBuild {
  const text = stripThink(raw);
  const lines = text.split("\n");
  const files: XFile[] = [];
  const seen = new Set<string>();

  let i = 0;
  while (i < lines.length) {
    const opener = lines[i].match(/^\s*```+\s*(\S.*?)\s*$/);
    if (!opener) {
      i++;
      continue;
    }
    const path = pathFromInfo(opener[1]);
    const body: string[] = [];
    i++;
    while (i < lines.length && !/^\s*```+\s*$/.test(lines[i])) {
      body.push(lines[i]);
      i++;
    }
    i++; // skip closer (or run off the end when the reply was cut)
    if (!path || seen.has(path)) continue;
    seen.add(path);
    files.push({ path, content: body.join("\n").replace(/\s+$/, "") });
  }

  // Prose = everything before the first file fence, in whatever accepted
  // form it was written, so code never leaks into the chat message.
  let prose = text;
  // Also stop at a bare "file:" line or a bold filename heading: the model
  // writes those as plain text ahead of the real fence, and leaving them in
  // would put code in front of a user who cannot read code.
  const cuts = [
    // any opening fence, in whatever language tag it was written
    text.search(/^\s*```+/im),
    // "file: index.html" anywhere on a line, including behind a list marker
    text.search(/\bfile:\s*\S+\.(?:html?|css|js|mjs)\b/i),
    // the same marker anchoring its own line, optionally list-prefixed
    text.search(/^\s*(?:\d+\.\s*|[-*]\s+)?file:\s*\S+\s*$/im),
    // a bare known filename on its own line, bold or not, list-prefixed or not
    text.search(
      /^\s*(?:\d+\.\s*|[-*]\s+)?\*\*?(?:index\.html|styles\.css|app\.js)\*\*?\s*$/im
    ),
  ].filter((n) => n >= 0);
  const firstFence = cuts.length ? Math.min(...cuts) : -1;
  if (firstFence >= 0) prose = text.slice(0, firstFence);
  prose = prose.trim();

  // Fallback: a raw single-file answer (model ignored the fence format).
  if (!files.length) {
    const docStart = text.search(/<!DOCTYPE\s+html|<html[\s>]/i);
    if (docStart >= 0) {
      const endTag = text.lastIndexOf("</html>");
      const doc = text.slice(docStart, endTag >= docStart ? endTag + "</html>".length : undefined).trim();
      if (doc.length > 80) files.push({ path: "index.html", content: doc });
    }
  }

  return { files, prose };
}

/** Upsert parsed files into an existing file set (unchanged files are kept). */
export function mergeFiles(existing: XFile[], incoming: XFile[]): XFile[] {
  const map = new Map(existing.map((f) => [f.path, f]));
  for (const f of incoming) map.set(f.path, f);
  return Array.from(map.values());
}

// ------------------------------------------------------------
// Preview assembly: one self-contained document with a localStorage
// shim that persists through a validated postMessage bridge.
// ------------------------------------------------------------

const STORAGE_PRELUDE = (data: Record<string, unknown>) => `<script>(function(){
var mem = __XM_DATA__;
var t = null;
function persist(){ try { parent.postMessage({ __xm: 1, app: __XM_APP__, data: mem }, "*"); } catch (e) {} }
function sched(){ if (t) clearTimeout(t); t = setTimeout(persist, 150); }
var shim = {
  getItem: function(k){ k = String(k); return Object.prototype.hasOwnProperty.call(mem, k) ? String(mem[k]) : null; },
  setItem: function(k, v){ try { mem[String(k)] = String(v); sched(); } catch (e) {} },
  removeItem: function(k){ delete mem[String(k)]; sched(); },
  clear: function(){ mem = {}; sched(); },
  key: function(i){ var ks = Object.keys(mem); return (i >= 0 && i < ks.length) ? ks[i] : null; }
};
Object.defineProperty(shim, "length", { get: function(){ return Object.keys(mem).length; } });
try { Object.defineProperty(window, "localStorage", { configurable: true, value: shim }); }
catch (e) { try { window.localStorage = shim; } catch (e2) {} }
window.XMStorage = shim;
})();</script>`;

// Long-press inspector (preview only — never included in exports): hold
// ~450ms on any element to highlight it and tell the workbench's edit
// window what it is. Same validated postMessage channel as app data.
const INSPECT_PRELUDE = `<script>(function(){
if (window.parent === window) return;
var lp = null, sx = 0, sy = 0, fired = false, hi = null;
function clearHi(){ if (hi) { try { hi.style.outline = hi.__xmPrev || ""; hi.style.outlineOffset = ""; } catch (e) {} hi = null; } }
function fire(el){
  fired = true; setTimeout(function(){ fired = false; }, 700);
  clearHi();
  try { el.__xmPrev = el.style.outline || ""; el.style.outline = "2px solid #34d399"; el.style.outlineOffset = "2px"; hi = el; } catch (e) {}
  try {
    parent.postMessage({ __xm: 2, app: __XM_APP__, tag: el.tagName.toLowerCase(),
      id: String(el.id || ""), cls: (typeof el.className === "string" ? el.className : "").slice(0, 200),
      html: (el.outerHTML || "").slice(0, 20000), text: (el.textContent || "").trim().slice(0, 4000) }, "*");
  } catch (e) {}
}
function onDown(e){
  if (e.touches && e.touches.length > 1) { clearTimeout(lp); return; }
  var t = e.touches ? e.touches[0] : e;
  sx = t.clientX; sy = t.clientY;
  var el = e.target; if (!el || el.nodeType !== 1) return;
  clearTimeout(lp);
  lp = setTimeout(function(){ fire(el); }, 450);
}
function cancel(){ clearTimeout(lp); }
function onMove(e){ var t = e.touches ? e.touches[0] : e; if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) cancel(); }
document.addEventListener("touchstart", onDown, { passive: true });
document.addEventListener("touchmove", onMove, { passive: true });
document.addEventListener("touchend", cancel, true);
document.addEventListener("mousedown", onDown);
document.addEventListener("mousemove", onMove);
document.addEventListener("mouseup", cancel);
document.addEventListener("click", function(e){ if (fired) { e.preventDefault(); e.stopPropagation(); } }, true);
window.addEventListener("message", function(e){ var d = e.data; if (d && d.__xmCmd === "clear") clearHi(); });
})();</script>`;

export function assemblePreview(
  files: XFile[],
  appId: string,
  data: Record<string, unknown>,
  opts?: { bridge?: boolean; theme?: XThemeId }
): string {
  let html = files.find((f) => /^index\.html?$/i.test(f.path))?.content || "";
  if (!html) {
    const bodyFiles = files.filter((f) => !/\.html?$/i.test(f.path));
    html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${bodyFiles
      .map((f) => `<script src="${f.path}"></script>`)
      .join("")}</body></html>`;
  }

  // Inline every css/js file the HTML references (and, defensively, any file
  // that references itself by basename).
  for (const f of files) {
    const base = f.path.split("/").pop() || f.path;
    if (/\.css$/i.test(f.path)) {
      const styleTag = `<style>\n${f.content}\n</style>`;
      const linkRe = new RegExp(`<link[^>]+href=["']([^"']*${escapeRe(base)})["'][^>]*>`, "gi");
      const hadRef = linkRe.test(html);
      linkRe.lastIndex = 0;
      html = html.replace(linkRe, styleTag);
      if (!hadRef) html = html.replace("</head>", `${styleTag}</head>`);
    } else if (/\.js$/i.test(f.path)) {
      const scriptTag = `<script>\n${f.content}\n</script>`;
      const srcRe = new RegExp(`<script[^>]+src=["']([^"']*${escapeRe(base)})["'][^>]*>\\s*</script>`, "gi");
      const hadRef = srcRe.test(html);
      srcRe.lastIndex = 0;
      html = html.replace(srcRe, scriptTag);
      if (!hadRef) html = html.replace("</body>", `${scriptTag}</body>`);
    }
  }

  // The invisible skill layer goes into EVERY document - preview and export
  // alike - always first in <head>, so a generated styles.css can override it.
  let prelude = kitHead(opts?.theme ?? "paper");

  // Standalone export drops the postMessage bridge (it uses the browser's
  // real localStorage) and the long-press inspector.
  if (opts?.bridge !== false) {
    prelude +=
      (STORAGE_PRELUDE(data) + INSPECT_PRELUDE)
        .replace("__XM_DATA__", JSON.stringify(data).replace(/<\//g, "<\\/"))
        .replaceAll("__XM_APP__", JSON.stringify(appId));
  }
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => `${m}${prelude}`);
  else html = prelude + html;
  return html;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ------------------------------------------------------------
// Plan-mode question chips: "Q: question" + "- option" blocks.
// ------------------------------------------------------------

export interface XQuestion {
  q: string;
  options: string[];
}

export function parseQuestions(text: string): XQuestion[] {
  const out: XQuestion[] = [];
  let cur: XQuestion | null = null;
  for (const line of text.split("\n")) {
    const qm = line.match(/^\s*Q:\s*(.{4,160})\s*$/);
    if (qm) {
      cur = { q: qm[1], options: [] };
      out.push(cur);
      continue;
    }
    if (!cur) continue;
    const om = line.match(/^\s*[-*]\s+(.{1,180})\s*$/);
    if (om) {
      cur.options.push(om[1]);
      continue;
    }
    if (line.trim() === "") continue;
    cur = null; // any other content closes the block
  }
  return out.filter((q) => q.options.length >= 2).slice(0, 3);
}
