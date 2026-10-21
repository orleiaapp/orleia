// ============================================================
// MODEL_PROFILES for plain-Node test batteries (run_suite*.js,
// verify_family.js) — loaded from the REAL source of truth.
//
// src/lib/ai-models.ts is TypeScript, so Node cannot require it
// directly. Rather than copy the profiles (they drifted before —
// this used to be a hand-copied .vtest/ snapshot that died with
// its directory), transpile the real file in-memory with the
// project's own `typescript` package and re-export what it says.
//
// Drift-free by construction: prompts, temperatures, token
// budgets and NIM model ids are always the app's current ones.
// ============================================================

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const SRC = path.join(__dirname, "..", "src", "lib", "ai-models.ts");

function loadProfiles() {
  const source = fs.readFileSync(SRC, "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: SRC,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  const mod = { exports: {} };
  // ai-models.ts has no runtime imports (only `import type`), so the
  // transpiled module needs nothing from `require`.
  new Function("module", "exports", "require", outputText)(mod, mod.exports, require);
  if (!mod.exports.MODEL_PROFILES) {
    throw new Error("ai-models-shim: MODEL_PROFILES not found after transpile");
  }
  return mod.exports.MODEL_PROFILES;
}

module.exports = { MODEL_PROFILES: loadProfiles() };
