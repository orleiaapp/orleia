import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// The app resolves `@/*` to `./src/*` through tsconfig paths. Node's loader
// knows nothing about that, so tests would fail to import the very modules
// under test. Resolve the alias here instead of duplicating the source.
export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = path.resolve(process.cwd(), "src", specifier.slice(2));
    const candidates = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.js`,
      path.join(base, "index.ts"),
    ];
    const hit = candidates.find((c) => existsSync(c));
    if (hit) return nextResolve(pathToFileURL(hit).href, context);
  }
  return nextResolve(specifier, context);
}
