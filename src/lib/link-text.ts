// ============================================================
// Link splitting for plain-text chat bubbles.
//
// Pet bubbles render as pre-wrap text (no markdown engine), so a reply's
// URLs would be dead weight: this splits content into markdown links, bare
// URLs and plain text, with a COMPACT label ("openai.com/devday" instead of
// the raw 120-char address) while the href keeps the full URL.
//
// Pure (no React) so it can be unit-tested directly.
// ============================================================

import { compactUrl } from "./utils";

export type LinkToken =
  | { type: "text"; text: string }
  | { type: "link"; href: string; label: string };

// Markdown link first, then any bare URL. Bare URLs may contain balanced
// parens (Wikipedia's .../Icon_(computing)), so they stop at whitespace,
// angle brackets or quotes - not at ")".
const TOKEN_RE = /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>"']+)/g;

/** Peel sentence punctuation and unbalanced closing parens off a bare URL. */
function trimUrl(raw: string): { href: string; tail: string } {
  let url = raw;
  const punct = /[.,;:!?]+$/.exec(url);
  let tail = punct ? punct[0] : "";
  if (punct) url = url.slice(0, -punct[0].length);
  const opens = (url.match(/\(/g) || []).length;
  let closes = (url.match(/\)/g) || []).length;
  while (closes > opens && url.endsWith(")")) {
    url = url.slice(0, -1);
    tail = ")" + tail;
    closes--;
  }
  return { href: url, tail };
}

export function splitLinks(content: string): LinkToken[] {
  const out: LinkToken[] = [];
  if (!content) return out;
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(content))) {
    if (m.index > last) out.push({ type: "text", text: content.slice(last, m.index) });
    if (m[2]) {
      out.push({ type: "link", href: m[2], label: m[1] || compactUrl(m[2]) });
    } else {
      const { href, tail } = trimUrl(m[3]);
      if (href) out.push({ type: "link", href, label: compactUrl(href) });
      if (tail) out.push({ type: "text", text: tail });
    }
    last = TOKEN_RE.lastIndex;
  }
  if (last < content.length) out.push({ type: "text", text: content.slice(last) });
  return out;
}
