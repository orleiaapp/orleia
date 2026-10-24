import { readFileSync } from "node:fs";
import { register } from "node:module";
import vm from "node:vm";

register("./scripts-test/ts-alias-loader.mjs", import.meta.url);
const { parseBuild, assemblePreview } = await import("./src/lib/ximagine-ai.ts");

const file = process.argv[2] || "probe2.txt";
const theme = process.argv[3] || "ocean";

const raw = JSON.parse(readFileSync(file, "utf8"));
const text = raw.choices[0].message.content;
console.log("model:", raw.model, "| completion chars:", text.length);

const { files, prose } = parseBuild(text);
const pick = (p) => files.find((f) => f.path === p)?.content ?? "";
const html = pick("index.html");
const css = pick("styles.css");
const js = pick("app.js");

console.log("\n=== files parsed ===");
for (const f of files) console.log(`  ${f.path}: ${f.content.length} chars`);

const results = [];
const ck = (name, ok, detail = "") => results.push({ name, ok, detail });

console.log("\n=== prose ===");
console.log(JSON.stringify(prose.slice(0, 300)));
ck("prose has no code fence", !prose.includes("```"));
ck("prose has no file marker", !/file:\s*\S+\.(html?|css|js)/i.test(prose));

console.log("\n=== app.js ===");
ck("no ESM import left", !/^\s*import\s/m.test(js));
ck("no export left", !/^\s*export\s/m.test(js));
try {
  new vm.Script(js);
  ck("app.js parses as a classic script", true);
} catch (e) {
  ck("app.js parses as a classic script", false, e.message);
}

console.log("\n=== styles.css ===");
const firstCss = css.split("\n").slice(0, 14).join("\n");
console.log(firstCss);
ck("no :root block", !/:root/.test(css));
ck("no @import", !/@import/.test(css));
ck("no remote url()", !/url\(\s*['"]?https?:/i.test(css));
ck("no --xm-* token assigned", !/--xm-[a-z-]+\s*:/.test(css));
ck("no xm-* class rule (kit not shadowed)", !/(^|[\s,>+~(])\.xm-[a-z]/m.test(css));

console.log("\n=== preview ===");
const preview = assemblePreview(files, "probe", {}, { theme });
const accent = theme === "ocean" ? "#22d3ee" : "#b45309";
ck(`kit theme accent present (${accent})`, preview.includes(`--xm-accent:${accent}`));
ck("kit defines the token block", preview.includes(":root{--xm-bg:"));
ck("XM global injected", preview.includes("window.XM = XM"));
const styleIdx = [...preview.matchAll(/<style>/g)].map((m) => m.index);
ck("kit <style> precedes the app's own", styleIdx.length >= 2 && styleIdx[0] < styleIdx[1], JSON.stringify(styleIdx));
ck("app.js inlined (no dead src)", !/<script[^>]+src=["'][^"']*app\.js/i.test(preview));
ck("model accent did not leak", !preview.includes("#3b82f6"));

const scripts = [...preview.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const appScript = scripts[scripts.length - 1] || "";
try {
  new vm.Script(appScript);
  ck("inlined preview script parses", true);
} catch (e) {
  ck("inlined preview script parses", false, e.message);
}
ck("inlined script has a real body", appScript.trim().length > 40, `${appScript.trim().length} chars`);

// markup sanity
ck("has a viewport meta", /<meta[^>]+name=["']viewport/i.test(html));
ck("uses the page frame", /class="xm-header"/.test(html) && /class="xm-main"/.test(html));
ck("has a real h1", /<h1[\s>]/.test(html));

console.log("\n=== results ===");
let fail = 0;
for (const r of results) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.detail ? "" : "  -> " + r.detail}`);
}
console.log(`\n${results.length - fail}/${results.length} passed`);
process.exit(fail ? 1 : 0);
