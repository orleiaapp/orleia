// ============================================================
// Ximagine toolkit — the invisible skill layer every generated
// app gets for free.
//
// It is injected at preview and export time only (never written
// into the stored source files, never shown in chat): a small
// theme-aware base stylesheet plus a window.XM helper object.
// Together they give Noor confirmation dialogs, toasts, empty
// states, progress bars, safe storage and event delegation out
// of the box, so its output budget goes to features instead of
// re-plumbing the same widgets in every build.
// ============================================================

import type { XThemeId } from "@/lib/ximagine";

interface KitTokens {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  onAccent: string;
  accentSoft: string;
  danger: string;
  shadow: string;
}

const TOKENS: Record<XThemeId, KitTokens> = {
  paper: {
    bg: "#faf9f6",
    surface: "#ffffff",
    text: "#171717",
    muted: "#6b6b66",
    border: "#e7e5df",
    accent: "#b45309",
    onAccent: "#ffffff",
    accentSoft: "rgba(180,83,9,0.13)",
    danger: "#dc2626",
    shadow: "0 1px 2px rgba(16,24,40,0.06)",
  },
  ocean: {
    bg: "#0b2733",
    surface: "#0f3442",
    text: "#e8f4f8",
    muted: "#8fb3c0",
    border: "#1b4b5e",
    accent: "#22d3ee",
    onAccent: "#04212a",
    accentSoft: "rgba(34,211,238,0.15)",
    danger: "#f87171",
    shadow: "0 1px 3px rgba(0,0,0,0.35)",
  },
  sunset: {
    bg: "#fdf6ef",
    surface: "#ffffff",
    text: "#2b1a12",
    muted: "#7a6357",
    border: "#efe0d3",
    accent: "#c2410c",
    onAccent: "#ffffff",
    accentSoft: "rgba(194,65,12,0.13)",
    danger: "#dc2626",
    shadow: "0 1px 2px rgba(43,26,18,0.07)",
  },
  forest: {
    bg: "#052e16",
    surface: "#0a3d22",
    text: "#e7f5ec",
    muted: "#93c3a6",
    border: "#14532d",
    accent: "#4ade80",
    onAccent: "#052e16",
    accentSoft: "rgba(74,222,128,0.16)",
    danger: "#f87171",
    shadow: "0 1px 3px rgba(0,0,0,0.4)",
  },
  mono: {
    bg: "#ffffff",
    surface: "#ffffff",
    text: "#0a0a0a",
    muted: "#52525b",
    border: "#d4d4d8",
    accent: "#0a0a0a",
    onAccent: "#fafafa",
    accentSoft: "rgba(10,10,10,0.08)",
    danger: "#0a0a0a",
    shadow: "0 1px 2px rgba(10,10,10,0.08)",
  },
};

// Theme-aware primitives. Injected FIRST in <head> so the app's own
// styles.css always wins when it overrides something.
const KIT_CSS = `
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--xm-bg);color:var(--xm-text);
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  font-size:16px;line-height:1.5}
img,svg,video{max-width:100%}
button,input,select,textarea{font:inherit;color:inherit}
a{color:var(--xm-accent)}
:focus-visible{outline:2px solid var(--xm-accent);outline-offset:2px;border-radius:6px}
.xm-card{background:var(--xm-surface);border:1px solid var(--xm-border);
  border-radius:14px;padding:16px;box-shadow:var(--xm-shadow);margin-bottom:12px}
.xm-row{display:flex;align-items:center;gap:10px}
.xm-row.wrap{flex-wrap:wrap}
.xm-col{display:flex;flex-direction:column;gap:8px}
.xm-sep{height:1px;background:var(--xm-border);border:0;margin:12px 0}
.xm-title{font-size:22px;font-weight:650;letter-spacing:-0.01em;margin:0;line-height:1.25}
.xm-header .xm-title{font-size:clamp(24px,5vw,30px);line-height:1.15}
.xm-main .xm-title{font-size:19px;line-height:1.3}
.xm-sub{margin:3px 0 0;font-size:14px;color:var(--xm-muted)}
.xm-hint{font-size:13px;color:var(--xm-muted)}
.xm-stat{display:flex;flex-direction:column;gap:2px;min-width:0;
  font-size:15px;font-weight:650;color:var(--xm-text);
  font-variant-numeric:tabular-nums;line-height:1.2}
.xm-stat b{font-size:20px;font-weight:650;font-variant-numeric:tabular-nums;line-height:1.2}
.xm-stat span{font-size:11px;text-transform:uppercase;letter-spacing:0.07em;color:var(--xm-muted)}
.xm-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;
  min-height:44px;padding:0 16px;border-radius:12px;border:1px solid var(--xm-border);
  background:var(--xm-surface);color:var(--xm-text);cursor:pointer;font-size:15px;
  font-weight:550;text-align:center;text-decoration:none;
  transition:transform 0.12s ease,background 0.15s ease,border-color 0.15s ease,opacity 0.15s ease}
.xm-btn:hover{border-color:var(--xm-accent)}
.xm-btn:active{transform:scale(0.97)}
.xm-btn[disabled]{opacity:0.45;cursor:not-allowed;transform:none}
.xm-btn.xm-btn-primary{background:var(--xm-accent);border-color:transparent;color:var(--xm-on-accent);font-weight:600}
.xm-btn-primary:hover{border-color:transparent;opacity:0.92}
.xm-btn-ghost{background:transparent;border-color:transparent;color:var(--xm-muted)}
.xm-btn-ghost:hover{background:var(--xm-accent-soft);color:var(--xm-text);border-color:transparent}
.xm-btn-danger{background:transparent;border-color:var(--xm-danger);color:var(--xm-danger)}
.xm-icon{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;
  flex:0 0 auto;border-radius:999px;border:1px solid var(--xm-border);
  background:var(--xm-surface);color:var(--xm-muted);cursor:pointer;transition:background 0.15s ease}
.xm-icon:hover{background:var(--xm-accent-soft);color:var(--xm-text)}
.xm-input{width:100%;min-height:44px;padding:0 14px;border-radius:12px;
  border:1px solid var(--xm-border);background:var(--xm-surface);color:var(--xm-text);font-size:16px}
.xm-input::placeholder{color:var(--xm-muted);opacity:0.85}
textarea.xm-input{padding:12px 14px;min-height:92px;line-height:1.5;resize:vertical}
.xm-chip{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 13px;
  border-radius:999px;border:1px solid var(--xm-border);background:var(--xm-surface);
  color:var(--xm-muted);font-size:13px;cursor:pointer;transition:background 0.15s ease}
.xm-chip:hover{color:var(--xm-text)}
.xm-chip[aria-pressed="true"],.xm-chip.on,.xm-chip.active{background:var(--xm-accent-soft);
  border-color:var(--xm-accent);color:var(--xm-text)}
.xm-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.xm-item{display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--xm-surface);
  border:1px solid var(--xm-border);border-radius:12px}
.xm-item.done{opacity:0.6}
.xm-done{text-decoration:line-through;color:var(--xm-muted)}
.xm-bar{height:8px;border-radius:999px;background:var(--xm-accent-soft);overflow:hidden}
.xm-bar>span{display:block;height:100%;border-radius:999px;background:var(--xm-accent);transition:width 0.3s ease}
progress.xm-bar{appearance:none;-webkit-appearance:none;width:100%;margin:0;border:0}
progress.xm-bar::-webkit-progress-bar{background:var(--xm-accent-soft);border-radius:999px}
progress.xm-bar::-webkit-progress-value{background:var(--xm-accent);border-radius:999px}
progress.xm-bar::-moz-progress-bar{background:var(--xm-accent);border-radius:999px}
.xm-empty{text-align:center;padding:34px 20px;color:var(--xm-muted)}
.xm-empty .e{display:block;font-size:34px;margin-bottom:10px;line-height:1}
.xm-empty strong{display:block;color:var(--xm-text);font-size:15px;font-weight:600}
.xm-empty p{margin:6px 0 16px;font-size:14px}
.xm-toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,20px);
  background:#141416;color:#fff;padding:11px 16px;border-radius:12px;font-size:14px;
  box-shadow:0 10px 30px rgba(0,0,0,0.3);opacity:0;pointer-events:none;z-index:9999;
  max-width:88vw;text-align:center;transition:opacity 0.2s ease,transform 0.2s ease}
.xm-toast.show{opacity:1;transform:translate(-50%,0)}
.xm-toast.ok{background:#14532d;color:#dcfce7}
.xm-toast.bad{background:#7f1d1d;color:#ffe4e4}
.xm-modal{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.55);
  display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;
  transition:opacity 0.18s ease}
.xm-modal.show{opacity:1}
.xm-modal .box{width:100%;max-width:340px;background:var(--xm-surface);color:var(--xm-text);
  border:1px solid var(--xm-border);border-radius:16px;padding:20px;
  box-shadow:0 24px 60px rgba(0,0,0,0.4)}
.xm-modal .box p{margin:0 0 16px;font-size:15px;line-height:1.45}
.xm-modal .acts{display:flex;gap:8px;justify-content:flex-end}
.xm-modal .acts .xm-btn{min-height:40px;padding:0 14px;font-size:14px}
/* Page frame: sticky header -> centred stacking column -> quiet footer. */
.xm-header{position:sticky;top:0;z-index:20;background:var(--xm-bg);
  border-bottom:1px solid var(--xm-border);padding:16px 20px 14px}
.xm-main{width:100%;max-width:640px;margin:0 auto;padding:20px 16px 48px;
  display:flex;flex-direction:column;gap:16px}
.xm-footer{width:100%;max-width:640px;margin:0 auto;padding:18px 16px 40px;
  border-top:1px solid var(--xm-border);color:var(--xm-muted);font-size:13px;text-align:center}
.xm-form{display:flex;gap:8px;align-items:center}
.xm-form .xm-input{flex:1;min-width:0}
.xm-section{display:flex;flex-direction:column;gap:10px}
/* Responsive grid so a build widens on a laptop instead of staying a narrow strip. */
.xm-grid{display:grid;gap:12px;grid-template-columns:1fr}
/* Type scale, so headings and hierarchy exist even before styles.css runs. */
h1,h2,h3{margin:0;line-height:1.2;letter-spacing:-0.01em;font-weight:650}
h1{font-size:clamp(24px,5vw,30px)}
h2{font-size:19px}
h3{font-size:16px;font-weight:600}
@media (min-width:760px){
  .xm-main{max-width:880px;gap:20px}
  .xm-grid{grid-template-columns:repeat(2,1fr)}
}
@media (min-width:1040px){.xm-grid{grid-template-columns:repeat(3,1fr)}}
@media (max-width:420px){.xm-title{font-size:20px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

// window.XM — no network, no eval, quota-safe, runs before app.js.
const KIT_JS = `
(function(){
function ready(fn){ if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn(); }
var XM = {
  esc: function(s){ var A = String.fromCharCode(38);
    return String(s == null ? "" : s).replace(/[<>&"']/g, function(c){
      return c === "<" ? A + "lt;" : c === ">" ? A + "gt;" : c === "&" ? A + "amp;"
        : c === '"' ? A + "quot;" : A + "#39;"; }); },
  uid: function(){ return "i" + Date.now().toString(36) + Math.random().toString(36).slice(2,7); },
  qs: function(s, r){ return (r || document).querySelector(s); },
  qsa: function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); },
  load: function(key, fb){ try { var raw = localStorage.getItem(key);
      if (raw == null) return typeof fb === "function" ? fb() : fb;
      var v = JSON.parse(raw);
      return v == null ? (typeof fb === "function" ? fb() : fb) : v;
    } catch(e){ return fb; } },
  save: function(key, val){ try { var s = JSON.stringify(val);
      if (typeof s === "string") localStorage.setItem(key, s); } catch(e){} },
  seed: function(key, make){ var cur = XM.load(key, null); if (cur != null) return cur;
    var v = null; try { v = make(); } catch(e){ v = null; }
    if (v != null) XM.save(key, v); return v; },
  pct: function(a, b){ b = Number(b); if (!b) return 0;
    return Math.max(0, Math.min(100, Math.round(Number(a) / b * 100))); },
  bar: function(p){ p = Math.max(0, Math.min(100, Math.round(Number(p) || 0)));
    return '<div class="xm-bar" role="progressbar" aria-valuenow="' + p +
      '" aria-valuemin="0" aria-valuemax="100"><span style="width:' + p + '%"></span></div>'; },
  empty: function(e, title, hint, btn){
    return '<div class="xm-empty"><span class="e" aria-hidden="true">' + XM.esc(e || "\\u2728") +
      '</span><strong>' + XM.esc(title || "Nothing here yet") + '</strong>' +
      (hint ? '<p>' + XM.esc(hint) + '</p>' : "") + (btn || "") + '</div>'; },
  day: function(ts){ var d = ts == null ? new Date() : new Date(ts);
    if (isNaN(d.getTime())) d = new Date();
    var m = String(d.getMonth() + 1), dd = String(d.getDate());
    return d.getFullYear() + "-" + (m.length < 2 ? "0" + m : m) + "-" + (dd.length < 2 ? "0" + dd : dd); },
  rel: function(ts){ var s = (Date.now() - Number(ts || 0)) / 1000;
    if (!isFinite(s) || s < 0) return "";
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    if (s < 604800) return Math.floor(s / 86400) + "d ago";
    return XM.day(ts); },
  toast: (function(){ var el = null, t = null;
    return function(msg, kind){
      ready(function(){
        if (!el){ el = document.createElement("div"); el.className = "xm-toast";
          el.setAttribute("role", "status"); document.body.appendChild(el); }
        el.className = "xm-toast" + (kind === "bad" ? " bad" : kind === "ok" ? " ok" : "");
        el.textContent = String(msg == null ? "" : msg);
        requestAnimationFrame(function(){ if (el) el.classList.add("show"); });
        if (t) clearTimeout(t);
        t = setTimeout(function(){ if (el) el.classList.remove("show"); }, 2400);
      });
    }; })(),
  confirm: function(msg, onOk, onCancel){
    ready(function(){
      var prev = document.activeElement;
      var m = document.createElement("div");
      m.className = "xm-modal";
      m.innerHTML = '<div class="box" role="alertdialog" aria-modal="true"><p></p><div class="acts">' +
        '<button type="button" class="xm-btn xm-btn-ghost" data-a="0">Cancel</button>' +
        '<button type="button" class="xm-btn xm-btn-primary" data-a="1">Confirm</button>' +
        '</div></div>';
      m.querySelector("p").textContent = String(msg == null ? "" : msg);
      function onKey(e){ if (e.key === "Escape"){ e.preventDefault(); close(); run(false); } }
      function close(){ document.removeEventListener("keydown", onKey, true);
        if (m.parentNode) m.parentNode.removeChild(m);
        if (prev && prev.focus) { try { prev.focus(); } catch(e){} } }
      function run(ok){ close();
        if (ok){ if (typeof onOk === "function") onOk(); }
        else if (typeof onCancel === "function") onCancel(); }
      m.addEventListener("click", function(e){
        if (e.target === m) return run(false);
        var b = e.target && e.target.closest ? e.target.closest("[data-a]") : null;
        if (b) run(b.getAttribute("data-a") === "1");
      });
      document.addEventListener("keydown", onKey, true);
      document.body.appendChild(m);
      requestAnimationFrame(function(){ m.classList.add("show"); });
      var yes = m.querySelector('[data-a="1"]'); if (yes) yes.focus();
    });
  },
  on: function(root, sel, ev, fn){
    if (typeof sel === "function"){ fn = sel; ev = "click"; sel = ""; }
    else if (typeof ev === "function"){ fn = ev; ev = sel; sel = ""; }
    var el = typeof root === "string" ? document.querySelector(root) : root;
    if (!el || typeof ev !== "string") return;
    el.addEventListener(ev, function(e){
      var t = sel ? (e.target && e.target.closest ? e.target.closest(sel) : null) : e.target;
      if (t && el.contains(t)) fn.call(el, e, t);
    });
  }
};
window.XM = XM;
})();
`;

/**
 * The full <head> fragment for one theme: variables + base CSS + helpers.
 * Inserted before the app's own styles/scripts so generated code can
 * override anything it wants.
 */
export function kitHead(theme: XThemeId): string {
  const t = TOKENS[theme] || TOKENS.paper;
  const vars =
    `:root{--xm-bg:${t.bg};--xm-surface:${t.surface};--xm-text:${t.text};` +
    `--xm-muted:${t.muted};--xm-border:${t.border};--xm-accent:${t.accent};` +
    `--xm-on-accent:${t.onAccent};--xm-accent-soft:${t.accentSoft};` +
    `--xm-danger:${t.danger};--xm-shadow:${t.shadow}}`;
  return `<style>${vars}${KIT_CSS}</style><script>${KIT_JS}</script>`;
}
