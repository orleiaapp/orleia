// ============================================================
// Translation key-parity test — `npm test`.
//
// src/lib/i18n.ts holds one flat key/value dict per language. When a
// key exists in `en` but not in a translation, that screen silently
// falls back to English (an "English echo" in an otherwise localized
// app). When a key exists only in a translation, it is dead weight
// left behind after an English rename/delete.
//
// This test parses the real source file (no build step, no imports of
// the 13k-line module) and asserts every language declared in
// LANGUAGES carries exactly the `en` key set.
// ============================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const I18N_PATH = path.join(ROOT, "src", "lib", "i18n.ts");
const source = readFileSync(I18N_PATH, "utf8");

/** All language codes declared in LANGUAGES, in order. */
function languageCodes() {
  const start = source.indexOf("export const LANGUAGES");
  assert.notEqual(start, -1, "LANGUAGES export not found in i18n.ts");
  const end = source.indexOf("];", start);
  assert.notEqual(end, -1, "LANGUAGES array not terminated");
  const block = source.slice(start, end);
  const codes = [...block.matchAll(/code:\s*"([a-z]{2})"/g)].map((m) => m[1]);
  assert.ok(codes.length >= 2, "expected at least 2 languages");
  return codes;
}

/**
 * Parse the `dict` object literal with a small lexer.
 *
 * Structure: dict { <lang>: { "key": "value", ... }, ... }
 * A naive regex would trip over `{n}` placeholders and quotes inside
 * string values, so this walks character by character, skipping string
 * bodies while tracking brace depth.
 *
 * Returns { lang: Set<key> } for keys at depth 2 (inside a language
 * block) plus the set of language blocks found at depth 1.
 */
function parseDict() {
  const dictStart = source.indexOf("const dict");
  assert.notEqual(dictStart, -1, "dict object not found in i18n.ts");
  const eq = source.indexOf("{", dictStart);
  assert.notEqual(eq, -1, "dict object literal not found");

  const langs = new Map(); // code -> Set of keys
  let currentLang = null;
  let depth = 0;
  let i = eq;
  let pendingLang = null; // language code seen at depth 1, awaiting its `{`
  let lastIdent = null;

  const skipString = (idx) => {
    // source[idx] is the opening quote; returns index after closing quote.
    const quote = source[idx];
    let j = idx + 1;
    while (j < source.length) {
      if (source[j] === "\\") j += 2;
      else if (source[j] === quote) return j + 1;
      else j += 1;
    }
    throw new Error(`i18n parse: unterminated string at offset ${idx}`);
  };

  while (i < source.length) {
    const c = source[i];

    if (c === '"' || c === "'" || c === "`") {
      const start = i;
      i = skipString(i);
      const raw = source.slice(start + 1, i - 1);
      // A quoted string at depth 2 followed by `:` is a translation key.
      if (depth === 2 && currentLang && source.slice(i).match(/^\s*:/)) {
        langs.get(currentLang).add(raw.replace(/\\(["'\\])/g, "$1"));
      }
      continue;
    }

    if (c === "{") {
      depth += 1;
      if (depth === 2 && pendingLang) {
        currentLang = pendingLang;
        langs.set(currentLang, new Set());
        pendingLang = null;
      }
      i += 1;
      continue;
    }

    if (c === "}") {
      if (depth === 2) currentLang = null;
      depth -= 1;
      if (depth === 0) break; // end of dict
      i += 1;
      continue;
    }

    if (depth === 1 && /[A-Za-z_$]/.test(c)) {
      const m = source.slice(i).match(/^[A-Za-z_$][\w$]*/);
      lastIdent = m[0];
      i += lastIdent.length;
      continue;
    }

    if (depth === 1 && c === ":") {
      // `en:` (or a quoted language code) selects the next block.
      if (lastIdent && !langs.has(lastIdent)) pendingLang = lastIdent;
      lastIdent = null;
      i += 1;
      continue;
    }

    if (!/\s/.test(c)) lastIdent = null;
    i += 1;
  }

  return langs;
}

const codes = languageCodes();
const dict = parseDict();

test("every language in LANGUAGES has a dict block", () => {
  const missingBlocks = codes.filter((c) => !dict.has(c));
  assert.deepEqual(
    missingBlocks,
    [],
    `LANGUAGES declares ${missingBlocks.join(", ")} but dict has no block for them`
  );
});

test("every dict block is a declared language", () => {
  const undeclared = [...dict.keys()].filter((c) => !codes.includes(c));
  assert.deepEqual(
    undeclared,
    [],
    `dict has blocks for ${undeclared.join(", ")} missing from LANGUAGES`
  );
});

test("English is present and non-empty", () => {
  assert.ok(dict.has("en"), "English (en) block missing");
  assert.ok(dict.get("en").size > 100, "English block looks too small");
});

test("no language is missing English keys (no English echoes)", () => {
  const en = dict.get("en");
  assert.ok(en, "en block missing");
  const failures = [];
  for (const code of codes) {
    if (code === "en") continue;
    const keys = dict.get(code);
    if (!keys) continue; // reported by the first test
    const missing = [...en].filter((k) => !keys.has(k)).sort();
    if (missing.length) {
      failures.push(
        `${code}: ${missing.length}/${en.size} missing — e.g. ${missing
          .slice(0, 8)
          .join(", ")}${missing.length > 8 ? ", …" : ""}`
      );
    }
  }
  assert.deepEqual(failures, [], `translations falling back to English:\n  ${failures.join("\n  ")}`);
});

test("no language carries keys English dropped (dead keys)", () => {
  const en = dict.get("en");
  assert.ok(en, "en block missing");
  const failures = [];
  for (const code of codes) {
    if (code === "en") continue;
    const keys = dict.get(code);
    if (!keys) continue;
    const extra = [...keys].filter((k) => !en.has(k)).sort();
    if (extra.length) {
      failures.push(
        `${code}: ${extra.length} dead keys — e.g. ${extra.slice(0, 8).join(", ")}${
          extra.length > 8 ? ", …" : ""
        }`
      );
    }
  }
  assert.deepEqual(failures, [], `keys present only in translations:\n  ${failures.join("\n  ")}`);
});

test("all languages share one identical key count", () => {
  const en = dict.get("en");
  const counts = codes.map((c) => `${c}=${dict.get(c)?.size ?? "missing"}`);
  for (const code of codes) {
    const size = dict.get(code)?.size;
    if (size !== undefined) {
      assert.equal(
        size,
        en.size,
        `key-count drift: ${counts.join(" ")}`
      );
    }
  }
});
