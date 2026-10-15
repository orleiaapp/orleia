// ============================================================
// Lightweight Markdown <-> HTML converters for the Documents
// editor (Tiptap). Covers the subset of HTML Tiptap produces:
// headings, paragraphs, bold/italic/strike/code, links, lists,
// task lists, blockquotes, hr, images, code blocks, tables.
// No external deps — import/export stay local-first.
// ============================================================

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Inline HTML -> markdown (bold, italic, strike, code, links, images). */
function inlineToMarkdown(html: string): string {
  let s = html;
  s = s.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/g, (_m, src, alt) => `![${alt}](${src})`);
  s = s.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*>/g, (_m, alt, src) => `![${alt}](${src})`);
  s = s.replace(/<img[^>]*src="([^"]*)"[^>]*>/g, (_m, src) => `![](${src})`);
  s = s.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_m, href, text) => `[${text}](${href})`);
  s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/g, (_m, _t, inner) => `**${inner}**`);
  s = s.replace(/<(em|i)>([\s\S]*?)<\/\1>/g, (_m, _t, inner) => `*${inner}*`);
  s = s.replace(/<del>([\s\S]*?)<\/del>/g, "~~$1~~");
  s = s.replace(/<s>([\s\S]*?)<\/s>/g, "~~$1~~");
  s = s.replace(/<code>([\s\S]*?)<\/code>/g, (_m, inner) => "`" + inner + "`");
  s = s.replace(/<br\s*\/?>/g, "\n");
  return s;
}

/** Markdown inline syntax -> HTML (escape first, then apply marks). */

// URL scheme allowlist. This HTML is rendered via dangerouslySetInnerHTML
// in the note preview, so a raw href="javascript:..." link would be a
// stored XSS on click. escapeHtml() runs first (so quotes/tags cannot
// break out of the attribute and entity obfuscation like java&#115;cript
// stays double-escaped), which means a plain scheme check here is sound.
const SAFE_URL_RE = /^(https?:\/\/|mailto:|tel:|\/\/|\/|\?|#)/i;
const SAFE_IMG_RE = /^(https?:\/\/|data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]|\/)/i;

function safeLinkHref(href: string): string | null {
  return SAFE_URL_RE.test(href) ? href : null;
}

function safeImgSrc(src: string): string | null {
  // data:image is fine for <img>; anything else data: (text/html etc.) is not.
  return SAFE_IMG_RE.test(src) ? src : null;
}

function inlineToHtml(md: string): string {
  let s = escapeHtml(md);
  // images must run before links
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, src) => {
    const safe = safeImgSrc(src);
    return safe ? `<img src="${safe}" alt="${alt}"/>` : alt || "";
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, href) => {
    const safe = safeLinkHref(href);
    return safe
      ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`
      : text; // unsafe scheme -> render the text, no link
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, "$1<em>$2</em>");
  s = s.replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  return s;
}

/** Convert editor HTML into GitHub-flavored markdown. */
export function htmlToMarkdown(html: string): string {
  if (!html) return "";
  let s = html;

  // Tables -> GFM pipe tables
  s = s.replace(/<table[\s\S]*?<\/table>/g, (table) => {
    const rows: string[][] = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(table))) {
      const cells: string[] = [];
      const cellRe = /<(t[dh])[^>]*>([\s\S]*?)<\/t\1>/g;
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(m[1]))) {
        let cell = inlineToMarkdown(cm[2]).replace(/<[^>]+>/g, "").trim();
        cell = cell.replace(/\|/g, "\\|").replace(/\n/g, " ");
        cells.push(cell || " ");
      }
      if (cells.length) rows.push(cells);
    }
    if (!rows.length) return "";
    const width = Math.max(...rows.map((r) => r.length));
    const norm = rows.map((r) => { const c = [...r]; while (c.length < width) c.push(" "); return c; });
    const [head, ...body] = norm;
    const lines = [
      "| " + head.join(" | ") + " |",
      "| " + head.map(() => "---").join(" | ") + " |",
      ...body.map((r) => "| " + r.join(" | ") + " |"),
    ];
    return "\n\n" + lines.join("\n") + "\n\n";
  });

  // Code blocks (with optional language class)
  s = s.replace(/<pre[^>]*><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g, (_m, attrs, code) => {
    const langMatch = /class="language-([^"]+)"/.exec(attrs || "");
    const lang = langMatch ? langMatch[1] : "";
    const text = decodeEntities(code.replace(/<[^>]+>/g, ""));
    return "\n\n```" + lang + "\n" + text.replace(/\n$/, "") + "\n```\n\n";
  });

  // Task list items
  s = s.replace(/<li[^>]*><label[^>]*><input[^>]*checked[^>]*><\/label>([\s\S]*?)<\/li>/g, "- [x] $1\n");
  s = s.replace(/<li[^>]*><label[^>]*><input[^>]*><\/label>([\s\S]*?)<\/li>/g, "- [ ] $1\n");

  // Headings
  for (const lvl of [1, 2, 3, 4, 5, 6]) {
    const re = new RegExp(`<h${lvl}[^>]*>([\\s\\S]*?)</h${lvl}>`, "g");
    s = s.replace(re, (_m, inner) => "\n\n" + "#".repeat(lvl) + " " + inlineToMarkdown(inner).replace(/<[^>]+>/g, "").trim() + "\n\n");
  }

  // Blockquotes (single level)
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/g, (_m, inner) => {
    const text = inlineToMarkdown(inner)
      .replace(/<\/p>\s*<p[^>]*>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    return "\n\n" + text.split("\n").map((l) => "> " + l).join("\n") + "\n\n";
  });

  // Ordered / unordered lists
  const listRe = /<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/g;
  let lm: RegExpExecArray | null;
  const out: string[] = [];
  let lastIdx = 0;
  const plainToMd = (frag: string) => inlineToMarkdown(frag)
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/g, "$1\n")
    .replace(/<hr\s*\/?>/g, "\n\n---\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n");

  while ((lm = listRe.exec(s))) {
    out.push(plainToMd(s.slice(lastIdx, lm.index)));
    let itemStr = "";
    const itemRe = /<li[^>]*>([\s\S]*?)<\/li>/g;
    let im: RegExpExecArray | null;
    let n = 0;
    while ((im = itemRe.exec(lm[2]))) {
      n++;
      const content = inlineToMarkdown(im[1]).replace(/<[^>]+>/g, "").trim();
      if (/^- \[[ x]\] /m.test(content) || /^- \[[ x]\] /.test(content)) {
        itemStr += content + "\n";
      } else {
        const prefix = lm[1] === "ol" ? `${n}. ` : "- ";
        itemStr += prefix + content.replace(/^- /, "") + "\n";
      }
    }
    out.push("\n\n" + itemStr + "\n");
    lastIdx = lm.index + lm[0].length;
  }
  out.push(plainToMd(s.slice(lastIdx)));
  s = out.join("");

  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}

/** Convert markdown into Tiptap-compatible HTML. */
export function markdownToHtml(md: string): string {
  if (!md) return "";
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    if (buf.length) {
      out.push("<p>" + inlineToHtml(buf.join(" ").trim()) + "</p>");
      buf.length = 0;
    }
  };

  const para: string[] = [];
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = /^\s*```(\w*)\s*$/.exec(line);
    if (fence) {
      flushParagraph(para);
      const lang = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // closing fence
      out.push(`<pre><code${lang ? ` class="language-${lang}"` : ""}>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushParagraph(para);
      const lvl = Math.min(h[1].length, 6);
      out.push(`<h${lvl}>${inlineToHtml(h[2].trim())}</h${lvl}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushParagraph(para);
      out.push("<hr/>");
      i++;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      flushParagraph(para);
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push("<blockquote><p>" + inlineToHtml(body.join(" ").trim()) + "</p></blockquote>");
      continue;
    }

    // Table
    if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      flushParagraph(para);
      const parseRow = (l: string) =>
        l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = parseRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      const thead = "<tr>" + head.map((c) => `<th>${inlineToHtml(c)}</th>`).join("") + "</tr>";
      const tbody = rows
        .map((r) => "<tr>" + head.map((_c, idx) => `<td>${inlineToHtml(r[idx] || "")}</td>`).join("") + "</tr>")
        .join("");
      out.push(`<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`);
      continue;
    }

    // Lists (ul / ol / task)
    const ulItem = /^\s*[-*+]\s+(.*)$/.exec(line);
    const olItem = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (ulItem || olItem) {
      flushParagraph(para);
      const isOl = !!olItem;
      const items: string[] = [];
      let hasTasks = false;
      while (i < lines.length) {
        const um = /^\s*[-*+]\s+(.*)$/.exec(lines[i]);
        const om = /^\s*(\d+)[.)]\s+(.*)$/.exec(lines[i]);
        if (isOl && om) items.push(om[2]);
        else if (!isOl && um) items.push(um[1]);
        else break;
        i++;
      }
      const lis = items
        .map((it) => {
          const tm = /^\[([ xX])\]\s+(.*)$/.exec(it);
          if (tm) {
            hasTasks = true;
            const checked = tm[1].toLowerCase() === "x";
            return `<li><label><input type="checkbox"${checked ? " checked" : ""}/> ${inlineToHtml(tm[2])}</label></li>`;
          }
          return `<li>${inlineToHtml(it)}</li>`;
        })
        .join("");
      if (hasTasks) {
        out.push(`<ul data-type="taskList">${lis}</ul>`);
      } else {
        out.push(isOl ? `<ol>${lis}</ol>` : `<ul>${lis}</ul>`);
      }
      continue;
    }

    // Blank line
    if (!line.trim()) {
      flushParagraph(para);
      i++;
      continue;
    }

    para.push(line.trim());
    i++;
  }
  flushParagraph(para);
  return out.join("\n");
}
