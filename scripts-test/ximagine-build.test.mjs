// ============================================================
// Ximagine build pipeline — the three defects that made a real,
// live-generated app render as a dead plain page:
//
//   1. app.js is inlined into a classic <script>, so an ESM
//      `import { XM } from './xm.js'` is a SyntaxError that
//      stops the whole file — every control goes dead.
//   2. styles.css is inlined AFTER the kit, so the model's
//      re-declarations of the xm-* classes (and its :root token
//      block) shadow the designed layer with weaker guesses.
//   3. @import of Google Fonts was cut at the first ";" inside
//      `wght@400;500`, orphaning the tail of the URL.
//
// These assert the shipped pipeline, not a copy of it.
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-alias-loader.mjs", import.meta.url);
const { parseBuild, assemblePreview } = await import("../src/lib/ximagine-ai.ts");

function build(css, js) {
  const raw = [
    "Here it is.",
    "",
    "file: index.html",
    "```html",
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Water Tracker</title>",
    '<link rel="stylesheet" href="styles.css">',
    "</head><body>",
    '<header class="xm-header"><h1 class="xm-title">Water Intake</h1></header>',
    '<main class="xm-main"><div class="my-widget">x</div></main>',
    '<script src="app.js"></script>',
    "</body></html>",
    "```",
    "",
    "file: styles.css",
    "```css",
    css,
    "```",
    "",
    "file: app.js",
    "```javascript",
    js,
    "```",
  ].join("\n");
  const { files, prose } = parseBuild(raw);
  const get = (p) => files.find((f) => f.path === p)?.content ?? "";
  return { files, prose, html: get("index.html"), css: get("styles.css"), js: get("app.js") };
}

test("prose is separated from the file blocks", () => {
  const { prose, files } = build("body{color:var(--xm-text)}", "render();");
  assert.equal(prose, "Here it is.");
  assert.equal(files.length, 3);
});

test("app.js: a stray ESM import cannot blank the whole script", () => {
  const { js } = build(
    "body{color:var(--xm-text)}",
    "import { XM } from './xm.js';\nconst state = XM.seed('k', () => ({ items: [] }));\nrender();"
  );
  assert.ok(!/^\s*import\s/m.test(js), `import survived: ${js}`);
  assert.ok(js.includes("const state = XM.seed"), js);
  assert.ok(js.includes("render();"), js);
});

test("app.js: multiline import and every export form are stripped", () => {
  const { js } = build(
    "body{color:var(--xm-text)}",
    [
      "import {",
      "  helper,",
      "  other",
      "} from './helpers.js';",
      "export function render() {}",
      "export const STATE = {};",
      "export default render;",
      "export { helper, other };",
      "render();",
    ].join("\n")
  );
  assert.ok(!/^\s*import\s/m.test(js), `import survived: ${js}`);
  assert.ok(!/^\s*export\s/m.test(js), `export survived: ${js}`);
  assert.ok(js.includes("function render() {}"), js);
  assert.ok(js.includes("const STATE = {};"), js);
  assert.ok(js.includes("render();"), js);
});

test("app.js: dynamic import() and comments are left alone", () => {
  const { js } = build(
    "body{color:var(--xm-text)}",
    "// import { x } from 'y';\nconst p = import('./later.js');\nboot(p);"
  );
  assert.ok(js.includes("// import { x } from 'y';"), js);
  assert.ok(js.includes("import('./later.js')"), js);
});

test("styles.css: the model cannot shadow the kit's classes", () => {
  const { css } = build(
    [
      ":root { --xm-accent: #3b82f6; --xm-bg: #ffffff; }",
      ".xm-title { font-weight: 500; font-size: 40px; }",
      ".xm-btn { border-radius: 8px; padding: 4px; }",
      ".xm-empty .thing { display: none; }",
      "@media (min-width: 640px) { .xm-footer { position: fixed; bottom: 0; } }",
      ".my-widget { color: var(--xm-accent); padding: 12px; }",
      "@media (min-width: 760px) { .my-widget { display: grid; } }",
    ].join("\n"),
    "render();"
  );
  assert.ok(!css.includes("#3b82f6"), "theme token survived");
  assert.ok(!/:root/.test(css), ":root survived");
  assert.ok(!/font-weight:\s*500/.test(css), "xm-title re-declaration survived");
  assert.ok(!/font-size:\s*40px/.test(css), "xm-title size survived");
  assert.ok(!/border-radius:\s*8px/.test(css), "xm-btn re-declaration survived");
  assert.ok(!/position:\s*fixed/.test(css), "xm-footer override survived");
  assert.ok(!/\.xm-empty/.test(css), "xm-empty rule survived");
  // the model's own classes must still ship
  assert.ok(css.includes(".my-widget"), "own class was dropped");
  assert.ok(css.includes("color: var(--xm-accent)"), "own declaration was dropped");
  assert.ok(css.includes("display: grid"), "own @media rule was dropped");
});

test("styles.css: @import is removed whole, with no orphaned URL tail", () => {
  const { css } = build(
    [
      "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap');",
      "@import \"https://cdn.example.com/other.css\";",
      "body { font-family: system-ui; }",
    ].join("\n"),
    "render();"
  );
  assert.ok(!css.includes("@import"), `@import survived: ${css}`);
  assert.ok(!css.includes("fonts.googleapis"), "font host survived");
  assert.ok(!css.includes("500&display=swap"), `orphaned tail: ${css}`);
  assert.ok(!css.includes("other.css"), "second @import survived");
  assert.ok(css.includes("body { font-family: system-ui; }"), `rule lost: ${css}`);
});

test("styles.css: remote url() is neutralised, local url() kept", () => {
  const { css } = build(
    [
      ".logo { background: url('https://evil.example/x.png'); }",
      ".own { background: url('data:image/svg+xml;base64,AAAA); }",
    ].join("\n"),
    "render();"
  );
  assert.ok(!css.includes("evil.example"), `remote url survived: ${css}`);
  assert.ok(css.includes(".own { background: url('data:"), `data uri lost: ${css}`);
});

// Count braces the way a CSS tokenizer would: quotes and comments are
// skipped, so a `content:"}"` rule does not read as an orphaned close.
function countBraces(css) {
  let open = 0;
  let close = 0;
  let quote = "";
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end < 0 ? css.length : end + 1;
    } else if (c === "{") open++;
    else if (c === "}") close++;
  }
  return { open, close };
}

test("styles.css: braces stay balanced after stripping", () => {
  const { css } = build(
    [
      ":root{--xm-accent:#3b82f6}",
      ".xm-card{border:0}",
      "@media (min-width:640px){.xm-footer{position:fixed}.keep{display:block}}",
      ".keep::before{content:\"}\"}",
      ".after{color:var(--xm-text)}",
    ].join("\n"),
    "render();"
  );
  const { open, close } = countBraces(css);
  assert.equal(open, close, `unbalanced: ${css}`);
  assert.ok(css.includes(".keep{display:block}"), `nested survivor lost: ${css}`);
  assert.ok(!css.includes("position:fixed"), `xm-footer override survived: ${css}`);
  assert.ok(css.includes(".after"), css);
});

test("prose: no code or file markers leak into the chat message", () => {
  const { prose } = build("body{color:var(--xm-text)}", "render();");
  assert.ok(!prose.includes("```"), prose);
  assert.ok(!/file:\s*\S+\.css/i.test(prose), prose);
});

test("preview: the kit's theme lands first, and the app cannot restate it", () => {
  const { files } = build(
    [
      ":root { --xm-accent: #3b82f6; }",
      ".xm-title { font-weight: 500; }",
      ".my-widget { color: var(--xm-accent); }",
    ].join("\n"),
    "import { XM } from './xm.js';\nrender();"
  );

  const paper = assemblePreview(files, "app1", {}, { theme: "paper" });
  assert.ok(paper.includes("--xm-accent:#b45309"), "paper accent missing");
  assert.ok(!paper.includes("#3b82f6"), "model accent leaked into preview");
  assert.ok(!paper.includes("font-weight: 500"), "model .xm-title leaked into preview");
  assert.ok(paper.includes(".my-widget"), "own CSS lost in preview");
  assert.ok(paper.includes("const state") || paper.includes("render();"), "app.js not inlined");
  assert.ok(!/^\s*import\s/m.test(paper.replace(/^[\s\S]*?<\/script>/, "")), "import in inlined script");

  // the kit's <style> must precede the app's own, so only the kit sets the frame
  const kitAt = paper.indexOf("--xm-accent:#b45309");
  const appAt = paper.indexOf(".my-widget {");
  assert.ok(kitAt >= 0 && appAt > kitAt, `kit (${kitAt}) should precede app css (${appAt})`);

  const ocean = assemblePreview(files, "app1", {}, { theme: "ocean" });
  assert.ok(ocean.includes("--xm-accent:#22d3ee"), "ocean accent missing");
});
