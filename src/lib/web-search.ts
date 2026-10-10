// ============================================================
// Web search for Noor's "Web" toggle.
//
// Runs server-side in /api/search so the browser never scrapes
// third-party HTML. DuckDuckGo HTML + Bing RSS (both keyless)
// with query cleaning so conversational phrasing ("whats the
// weather in X") is turned into real search keywords instead of
// garbage like WhatsApp. Live weather comes from wttr.in.
// ============================================================

import type { AISource } from "@/types";

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const KIND_LABELS: Record<string, string> = {
  document: "Document",
  journal: "Journal",
  task: "Task",
  habit: "Habit",
  web: "Web",
};

/** Scam/spam/clickbait signals in result titles, snippets, or URLs. */
const JUNK_PATTERNS =
  /(free bitcoin|bitcoin (giveaway|gift)|claim (your|a) (prize|reward|bonus)|congratulations.{0,20}winner|you (have )?won|100% (free|guaranteed|secure)|get rich quick|double your money|make money (fast|quickly|overnight)|instant (cash|loan).{0,15}(no credit|approval)|casino (bonus|credits|spins|welcome|deposit)|slot machine|sex cam|adult dating|urgent.{0,15}(account|login|verify|password)|verify your (account|identity|password)|lottery (winner|win)|free (iphone|gift card|prize).{0,15}(giveaway|contest|win|claim|today)|hot singles|forex (pro|signals).{0,20}(profit|guaranteed)|miracle (cure|weight loss).{0,20}(pill|supplement|formula|diet|tea|drink|cream|patch))/i;

/** Prompt-injection attempts smuggled inside result titles or snippets. */
const INJECTION_PATTERNS =
  /(ignore (all |any |your )?(previous|prior|above) instructions|disregard (all |the |above )?instructions|you are now |act as (if )?(an? )?(unrestricted|free|jailbroken|developer mode)|reveal (your|the) (system |hidden |internal )?(prompt|instructions|rules)|forget (everything|all previous)|new instructions|do not follow (the|your) (system )?(prompt|instructions)|jailbreak|dan mode|ignore the system|override (your|the) (rules|instructions|guidelines))/i;

/** Homepage / section-front URLs and nav-page titles - never real content. */
const HOMEPAGE_TITLE_RE =
  /(breaking news( updates| headlines| videos)?|latest (news|headlines|stories|videos)( and (photos|videos|more|breaking news))?|top stories|news homepage|home page)/i;
const BARE_DOMAIN_RE = /^https?:\/\/(www\.)?[^/]+\/?([?#].*)?$/i;

function sanitizeResults(results: WebResult[]): WebResult[] {
  return results.filter((r) => {
    if (!/^https?:\/\//i.test(r.url)) return false;
    const hay = (r.title + " " + r.snippet + " " + r.url).toLowerCase();
    if (JUNK_PATTERNS.test(hay)) return false;
    if (INJECTION_PATTERNS.test(hay)) return false;
    // A nav/homepage tells the model nothing ("Fox News - Breaking News
    // Updates...") and poisons synthesis - drop bare domains and nav titles.
    if (BARE_DOMAIN_RE.test(r.url)) return false;
    if (HOMEPAGE_TITLE_RE.test(r.title)) return false;
    return true;
  });
}

/** Queries that need live/current data - triggers an automatic web search. */
const LIVE_INTENTS =
  /\b(weather|forecast|temperature|news|stocks?|bitcoin|ethereum|currency|traffic|earthquake|sunrise|sunset|gpt|chatgpt|gemini|claude|openai|anthropic|deepseek|midjourney|grok|release date|coming out|latest model|sequel|announcement|launch date|latest|newest|upcoming|released|announced|whats new|what's new)\b|\b(price of|share price|exchange rate|air quality)\b|°c|°f/i;

/** Freshness intent - newest/latest X, releases, versions. News-first search. */
const FRESH_INTENT =
  /\b(latest|newest|current|recent|just (released|launched|announced)|new(est)? version|who (is|was) the|what('s| is) the (best|top)|upcoming|unreleased|in \d{4}|this (year|month|week)|yesterday|today)\b/i;

/**
 * Queries explicitly scoped to the user's own data ("search my notes for
 * gemini", "what does my journal say about the launch") — even when the
 * topic is a live keyword, the answer lives locally, so the web gate must
 * not hijack it away from the local search/action engine.
 */
const LOCAL_SCOPE_RE =
  /\b(?:my|our)\s+(?:notes?|tasks?|journals?|entries|habits?|documents?|files?|lists?|calendar|data|workspace)\b/i;

export function isLiveQuery(q: string): boolean {
  if (LOCAL_SCOPE_RE.test(q)) return false;
  return LIVE_INTENTS.test(q);
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

function cleanText(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();
}

/** Strip HTML tags but keep entity decoding to cleanText (RSS descriptions arrive as HTML). */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function fetchHtml(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: ctrl.signal,
      });
      if (!res.ok) return null;
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/** The DDG html endpoint wraps real URLs behind //duckduckgo.com/l/?uddg=<encoded>. */
function ddgRealUrl(href: string): string {
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      /* fall through */
    }
  }
  if (href.startsWith("//")) return "https:" + href;
  return href;
}

/**
 * Bing wraps real URLs behind bing.com/ck/a redirects; the target lives in the
 * base64 `u=` query param. Unwrap it so Noor cites the actual page.
 */
function bingRealUrl(href: string): string {
  if (!href.includes("/ck/a?")) return href;
  const m = href.match(/[?&]u=([^&]+)/);
  if (!m) return href;
  let b64 = m[1];
  try {
    b64 = decodeURIComponent(b64);
  } catch {
    /* keep as-is */
  }
  if (b64.startsWith("a1")) b64 = b64.slice(2);
  try {
    // Guard for client bundles (this module is also imported for
    // buildSearchBlock); Buffer only exists server-side.
    if (typeof Buffer === "undefined") return href;
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const decoded = Buffer.from(b64 + pad, "base64").toString("utf-8");
    if (decoded.startsWith("http")) return decoded;
  } catch {
    /* fall through to original href */
  }
  return href;
}

/**
 * Turn conversational phrasing into search-engine keywords. Without this,
 * engines read "whats" as "whatsapp" and "whats the weather in X" returns
 * WhatsApp downloads instead of a forecast.
 */
function cleanSearchQuery(q: string): string {
  let s = q.trim();
  s = s.replace(/[?!.]+$/, "").trim();
  s = s
    .replace(/^(no|nah|nope)[,!.'\s]+/i, "")
    .replace(
      /^(whats the|what's the|whats|what's|what is|what are|whatre|what're|what r|can you|could you|can u|could u|please|hey|hi|hello|yo|tell me|do you know|do u know|i wanna know|i want to know|i need to know|lemme know|let me know|research|look into|find out|check out)\s+/i,
      ""
    )
    .replace(
      /^(what|who|where|when|why|how|which)\s+(is|are|was|were|does|do|did|can|could|will|would|has|have)\s+/i,
      ""
    )    .replace(
      /^(the|a|an)\s+/i,
      ""
    )
    .replace(/\bcoming out\b/gi, "release date")
    .replace(/\band\s+also\s+(?:research\s+|find\s+|look\s+up\s+)?/gi, " and ")
    .replace(/\bwhen is\b/gi, " ")
    .replace(/\b(please|thank you|thanks|pls|plz|btw|by the way)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return s;
}

/** Live weather via wttr.in (keyless) - real current conditions for a place. */
async function weatherResult(q: string): Promise<WebResult | null> {
  if (!/(weather|forecast|temperature|rain|snow)/i.test(q)) return null;
  // Strip diacritics (Kamieniec Ząbkowicki -> Kamieniec Zabkowicki) so the
  // ASCII location regex below still captures properly-spelled places.
  const norm = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const m = norm.match(/(?:weather|forecast|temperature)\s+(?:in|at|for|of|on)?\s*([a-z0-9 ,'-]{2,60})/i);
  if (!m) return null;
  const loc = m[1].trim().replace(/\s+/g, " ");
  if (!loc || /^(today|tomorrow|now|right now|this week|this weekend|tonight)$/i.test(loc)) {
    return null;
  }
  const locUrl = "https://wttr.in/" + encodeURIComponent(loc.replace(/ /g, "+"));
  // wttr.in serves its HTML page to browser-like UAs - ask for plain text
  // with a curl-like UA so we get just "Clear +14C, 6km/h" back.
  let raw: string | null = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(locUrl + "?format=%C+%t+%w+%h&lang=en&m", {
        headers: { "User-Agent": "curl/8.0", Accept: "text/plain" },
        signal: ctrl.signal,
      });
      if (res.ok) raw = await res.text();
    } finally {
      clearTimeout(timer);
    }
  } catch {
    raw = null;
  }
  if (!raw || /unknown location|please try/i.test(raw)) return null;
  const text = cleanText(raw);
  if (!text || /weather report|html/i.test(text)) return null;
  return {
    title: "Weather in " + loc + " (live)",
    url: locUrl,
    snippet: "Currently: " + text + ". Live from wttr.in, updated just now.",
  };
}

async function searchDuckDuckGo(q: string, limit: number): Promise<WebResult[]> {
  const html = await fetchHtml(
    "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q)
  );
  if (!html) return [];

  const titles: { url: string; title: string }[] = [];
  const titleRe = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = titleRe.exec(html)) && titles.length < limit) {
    const url = ddgRealUrl(m[1]);
    if (!url.startsWith("http")) continue;
    titles.push({ url, title: cleanText(m[2]) });
  }
  const snips: string[] = [];
  const snipRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  while ((m = snipRe.exec(html)) && snips.length < titles.length) {
    snips.push(cleanText(m[1]));
  }
  return titles.map((t, i) => ({ ...t, snippet: snips[i] || "" }));
}

async function searchDuckDuckGoLite(q: string, limit: number): Promise<WebResult[]> {
  // The lite endpoint is far more tolerant of datacenter/cloud IPs than the
  // full html page, which serves bot walls to Vercel's egress. Same engines,
  // same uddg-wrapped links, simpler markup.
  const html = await fetchHtml(
    "https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(q)
  );
  if (!html) return [];

  const snips: string[] = [];
  const snipRe = /<td class=["']result-snippet["']>([\s\S]*?)<\/td>/g;
  let m: RegExpExecArray | null;
  while ((m = snipRe.exec(html)) && snips.length < limit) {
    snips.push(cleanText(m[1]));
  }

  const out: WebResult[] = [];
  const titleRe = /<a rel="nofollow" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let i = 0;
  while ((m = titleRe.exec(html)) && out.length < limit) {
    const url = ddgRealUrl(m[1]);
    if (!url.startsWith("http")) continue;
    out.push({ url, title: cleanText(m[2]), snippet: snips[i] || "" });
    i++;
  }
  return out;
}

async function searchMojeek(q: string, limit: number): Promise<WebResult[]> {
  // Independent, keyless, bot-friendly index - a solid datacenter fallback
  // that Bing's RSS endpoint no longer provides (it returns first-word
  // results for multi-word queries).
  const html = await fetchHtml(
    "https://www.mojeek.com/search?q=" + encodeURIComponent(q)
  );
  if (!html) return [];

  const snips: string[] = [];
  const snipRe = /<p class=["']s["']>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = snipRe.exec(html)) && snips.length < limit) {
    snips.push(cleanText(m[1]));
  }

  const out: WebResult[] = [];
  const titleRe = /<h2><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/g;
  let i = 0;
  while ((m = titleRe.exec(html)) && out.length < limit) {
    const url = cleanText(m[1]);
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({ url, title: cleanText(m[2]), snippet: snips[i] || "" });
    i++;
  }
  return out;
}

/**
 * Words too generic to drive relevance. Wikipedia's full-text search OR-matches
 * every query word, so "latest gemini models" surfaces GPT-5.2 / Imagen /
 * Generative AI purely because they contain the word "models" - the topic
 * filter below keeps only results that actually mention the distinctive terms.
 */
const WIKI_STOPWORDS = new Set([
  "a", "an", "the", "of", "for", "to", "in", "on", "at", "with", "and", "or",
  "also", "from", "about", "into", "like", "such", "than", "their", "them",
  "latest", "new", "best", "top", "most", "recent", "upcoming", "current",
  "model", "models", "list", "info", "information", "update", "updates",
  "research", "release", "releases", "released", "launch", "launches",
  "launched", "date", "dates", "version", "versions", "story", "stories",
  "when", "what", "which", "who", "where", "why", "how", "is", "are", "was",
  "were", "do", "does", "did", "can", "could", "will", "would", "has", "have",
  "get", "gets", "got", "tell", "show", "find", "look", "need", "wanna",
  "want", "make", "made", "use", "used", "using", "know", "think", "like",
]);

/** "2026-05-19T14:32:11Z" -> "May 19, 2026" (Wikipedia's last-edit timestamp). */
function formatWikiDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Build a WebResult from a Wikipedia search item, stamping the page's last-edit date onto the snippet. */
function toWikiResult(it: {
  title?: string;
  snippet?: string;
  timestamp?: string;
}): WebResult {
  const date = formatWikiDate(it.timestamp);
  const base = cleanText(it.snippet || "");
  return {
    title: it.title || "",
    url: "https://en.wikipedia.org/wiki/" + encodeURIComponent((it.title || "").replace(/ /g, "_")),
    snippet: date ? `${base} (Wikipedia, last updated ${date})` : base,
  };
}

/** Distinctive topic words of a query - the terms a relevant page must mention. */
function topicTokens(q: string): string[] {
  const toks = new Set<string>();
  for (const w of q.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length < 3) continue;
    if (/^\d+$/.test(w)) continue;
    if (WIKI_STOPWORDS.has(w)) continue;
    toks.add(w);
  }
  return [...toks];
}

async function wikiSearchOne(rawQ: string, limit: number): Promise<WebResult[]> {
  // Wikipedia articles about a subject already cover its release/version
  // history, so drop version numbers ("5.1") and "release date" phrasing -
  // full-text search matches them against unrelated pages (Toy Story 5,
  // "Kavinsky") and drowns the real result.
  const q =
    rawQ
      .replace(/\b\d+(?:\.\d+)+\b/g, " ")
      .replace(/\b(?:release|launch)\s+dates?\b/gi, " ")
      .replace(/\s{2,}/g, " ")
      .trim() || rawQ;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(
        "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
          encodeURIComponent(q) +
          "&srlimit=" +
          limit +
          "&srprop=snippet|timestamp&format=json&origin=*",
        { signal: ctrl.signal, headers: { "User-Agent": UA } }
      );
      if (!res.ok) return [];
      const data = await res.json();
      const items: { title?: string; snippet?: string; timestamp?: string }[] =
        data?.query?.search || [];

      // Relevance filter: Wikipedia full-text search OR-matches every word, so
      // "latest gemini models" returns GPT-5.2 / Imagen / Generative AI (all
      // "models"-word matches, none about Gemini). Prefer results whose title
      // contains a topic token; fall back to snippet mentions; if nothing
      // matches, keep the raw ranking rather than returning nothing.
      const tokens = topicTokens(q);
      if (tokens.length > 0) {
        const scored = items.map((it) => {
          const title = (it.title || "").toLowerCase();
          const snip = cleanText(it.snippet || "").toLowerCase();
          let titleHit = false;
          let score = 0;
          for (const t of tokens) {
            if (title.includes(t)) {
              titleHit = true;
              score += 2;
            }
            if (snip.includes(t)) score += 1;
          }
          return { it, titleHit, score };
        });
        const titleHits = scored.filter((s) => s.titleHit);
        const anyHits = scored.filter((s) => s.score > 0);
        const kept =
          titleHits.length >= 2 ? titleHits : anyHits.length >= 1 ? anyHits : scored;
        return kept.slice(0, limit).map(({ it }) => toWikiResult(it));
      }

      return items.map(toWikiResult);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return [];
  }
}

async function searchWikipedia(q: string, limit: number): Promise<WebResult[]> {
  // The one keyless engine that is deterministic from datacenter IPs: a
  // proper JSON API (no HTML scraping, no bot wall). Great for research/
  // current-topics queries (models, people, products, release dates) where
  // the scraping engines 403 from Vercel's egress.
  //
  // Multi-topic requests ("research gemini and claude") are split on
  // "and"/"also" and each part searched separately - Wikipedia's full-text
  // search gets noisy when handed a combined query.
  const parts = q
    .split(/\s+(?:and|also|&)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  const out: WebResult[] = [];
  const seen = new Set<string>();
  for (const part of parts.length > 1 ? parts : [q]) {
    for (const r of await wikiSearchOne(part, limit)) {
      if (out.length >= limit) break;
      const key = r.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    if (out.length >= limit) break;
  }
  return out;
}

async function searchBing(q: string, limit: number): Promise<WebResult[]> {
  // Bing's RSS endpoint returns direct real URLs (no ck/a redirect wrapping)
  // and works from datacenter IPs where the HTML layout varies.
  const xml = await fetchHtml(
    "https://www.bing.com/search?q=" + encodeURIComponent(q) + "&format=rss&count=" + limit
  );
  if (!xml) return [];
  const out: WebResult[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) && out.length < limit) {
    const item = m[1];
    const title = item.match(/<title>([\s\S]*?)<\/title>/);
    const link = item.match(/<link>([\s\S]*?)<\/link>/);
    if (!title || !link) continue;
    const url = bingRealUrl(cleanText(link[1]));
    if (!url.startsWith("http")) continue;
    const desc = item.match(/<description>([\s\S]*?)<\/description>/);
    out.push({
      title: cleanText(title[1]),
      url,
      snippet: desc ? cleanText(desc[1]) : "",
    });
  }
  return out;
}

// ===== News RSS engines (keyless, datacenter-friendly) =====
// Freshness questions need news results, but DDG/Mojeek bot-wall datacenter
// IPs (the "six news homepages" failure). News RSS endpoints serve clean,
// newest-first headlines to any IP.

/** Parse a minimal RSS feed into items (title, link, description). */
function parseRssItems(xml: string): Array<{ title: string; link: string; description: string }> {
  const items: Array<{ title: string; link: string; description: string }> = [];
  const itemRe = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  const tag = (block: string, name: string) => {
    const t = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
    return t ? cleanText(t[1]) : "";
  };
  while ((m = itemRe.exec(xml)) && items.length < 20) {
    const block = m[1];
    let link = tag(block, "link");
    if (!link) {
      const l = block.match(/<link[^>]*href="([^"]+)"/i);
      if (l) link = cleanText(l[1]);
    }
    items.push({ title: tag(block, "title"), link, description: tag(block, "description") });
  }
  return items;
}

/** Bing News wraps real URLs in an apiclick redirect - unwrap it. */
function bingNewsRealUrl(href: string): string {
  try {
    const u = new URL(href);
    if (u.pathname.endsWith("apiclick.aspx")) {
      const inner = u.searchParams.get("url");
      if (inner && /^https?:\/\//i.test(inner)) return inner;
    }
  } catch {
    // keep original
  }
  return href;
}

async function searchGoogleNews(q: string, limit: number): Promise<WebResult[]> {
  const url =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(q) +
    "&hl=en-US&gl=US&ceid=US:en";
  const xml = await fetchHtml(url, 7000);
  if (!xml) return [];
  return parseRssItems(xml)
    .filter((it) => it.title && it.link.startsWith("http"))
    .slice(0, limit)
    .map((it) => ({
      title: it.title,
      url: it.link,
      snippet: it.description ? stripHtml(it.description).slice(0, 300) : "News headline via Google News RSS.",
    }));
}

async function searchBingNews(q: string, limit: number): Promise<WebResult[]> {
  const url = "https://www.bing.com/news/search?q=" + encodeURIComponent(q) + "&format=RSS";
  const xml = await fetchHtml(url, 7000);
  if (!xml) return [];
  return parseRssItems(xml)
    .filter((it) => it.title && it.link.startsWith("http"))
    .slice(0, limit)
    .map((it) => ({
      title: it.title,
      url: bingNewsRealUrl(it.link),
      snippet: it.description ? stripHtml(it.description).slice(0, 300) : "News result via Bing News RSS.",
    }));
}

export async function webSearch(q: string, limit = 6): Promise<WebResult[]> {
  const n = Math.min(Math.max(2, limit), 8);
  const cleaned = cleanSearchQuery(q);
  const query = cleaned || q;

  const fresh = FRESH_INTENT.test(query);
  const [weatherP, gnewsP, bnewsP, ddgP, liteP, wikiP, mojeekP, bingP] = await Promise.allSettled([
    weatherResult(query),
    searchGoogleNews(query, n),
    searchBingNews(query, n),
    searchDuckDuckGo(query, n),
    searchDuckDuckGoLite(query, n),
    searchWikipedia(query, n),
    searchMojeek(query, n),
    searchBing(query, n),
  ]);

  const results: WebResult[] = [];
  const weather = weatherP.status === "fulfilled" ? weatherP.value : null;
  if (weather) results.push(weather);

  const of = (p: PromiseSettledResult<WebResult[]>): WebResult[] =>
    p.status === "fulfilled" ? p.value : [];

  const news = [...of(gnewsP), ...of(bnewsP)];
  const engines = [of(ddgP), of(liteP), of(wikiP), of(mojeekP), of(bingP)];

  // Freshness questions (latest/newest X, releases, model names) go to news
  // RSS engines first - general web scrapers get bot-walled from datacenter
  // IPs and come back with news homepages instead of articles.
  let engineRes: WebResult[] = [];
  if (fresh && news.length >= 2) {
    engineRes = sanitizeResults(news);
  }
  if (engineRes.length === 0) {
    engineRes = engines.find((r) => r.length >= 3) || engines.find((r) => r.length > 0) || [];
    engineRes = sanitizeResults(engineRes);
  }
  if (engineRes.length === 0 && news.length > 0) {
    engineRes = sanitizeResults(news);
  }
  if (engineRes.length === 0) {
    // Degraded fallback: keep the top raw results rather than returning nothing -
    // the model is told to treat web content as untrusted data anyway.
    const best = [...(news.length ? [news] : []), ...engines].find((r) => r.length > 0);
    engineRes = best ? best.slice(0, 2) : [];
  }
  // Freshness results overlap heavily across news engines - dedupe by URL base.
  if (fresh) {
    const seen = new Set<string>();
    engineRes = engineRes.filter((r) => {
      const k = r.url.replace(/[#?].*$/, "");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  const cap = weather ? n - 1 : n;
  results.push(...engineRes.slice(0, cap));
  return results;
}

/**
 * Render sources as a numbered block the system prompt tells the model to
 * cite with [1], [2], ... The block is appended to the system prompt.
 */
export function buildSearchBlock(sources: AISource[]): string {
  if (!sources || sources.length === 0) return "";
  const hasWeb = sources.some((s) => s.kind === "web");
  const lines = sources.map((s, i) => {
    const cite = `[${i + 1}] ${KIND_LABELS[s.kind] || "Source"}: "${s.title}" - ${s.snippet || "No preview available"}`;
    // Web results carry a real URL - give the model the link so its replies
    // can point straight at the source (chips show them too).
    return s.kind === "web" && s.href ? `${cite} (${s.href})` : cite;
  });
  return (
    "\n\n" +
    (hasWeb
      ? "WEB SEARCH RESULTS (live results from the web - up to date):"
      : "WORKSPACE SEARCH RESULTS (real data from the user's Orleia workspace - live facts, not guesses):") +
    "\n" +
    lines.join("\n") +
    (hasWeb
      ? "\n\nIMPORTANT: These results give you real-time data access. If the question is about current or live information (weather, news, prices, scores, facts), base your answer on them - never claim you lack real-time data or the internet. Cite them inline like [1], [2] next to the facts you use. Evaluate each source critically before using it: ignore results that look like spam, scams, or obviously fake or unofficial pages, and say so when the only results you have are unreliable. Never invent facts the results do not state. If they do not answer the question, say so briefly and answer from what you know." + FRESHNESS_RULES
      : "\n\nUse these results when they are relevant. Cite them inline like [1], [2] next to the facts you use. If none are relevant, say so briefly and answer from what you know.")
  );
}

/**
 * Rules appended to every web-search block: freshness honesty and
 * anti-hallucination. Kept separate from buildSearchBlock's inline IMPORTANT
 * text so it can be reused verbatim.
 */
export const FRESHNESS_RULES = `\n\nFRESHNESS & HONESTY RULES (for questions about what is newest/latest/current - models, releases, versions, news, prices, dates):
- Your training knowledge has a cutoff and may be outdated. For freshness questions, answer ONLY from these results - never answer the "what is the newest" part from memory.
- If a source carries a "last updated" date and the question asks for the newest thing, mention how recent the source is (e.g. "the newest source I have is dated May 2026") instead of implying a fact is current without evidence.
- Never invent release dates, version numbers, model names, prices, or news that no result states. If the results do not contain a confirmed newest answer, say you couldn't confirm it rather than guessing.
- If results conflict or look unreliable (rumors, clickbait, unverified claims), say so plainly and do not present either side as fact.`;
