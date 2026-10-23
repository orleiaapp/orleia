// Uploads the freshly built Ximagine Windows installer to Vercel Blob
// (the same store push reminders use) and prints the public URL that
// /downloads/ximagine should redirect to.
//
// Usage:
//   node --env-file=.env.local scripts/upload-ximagine.mjs [path/to/Ximagine-Setup-0.1.0.exe]

import { put } from "@vercel/blob";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const file = process.argv[2] || "ximagine/dist/Ximagine-Setup-0.1.0.exe";
const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error("BLOB_READ_WRITE_TOKEN is not set (expected in .env.local)");
  process.exit(1);
}

const data = readFileSync(file);
const name = basename(file);
const pathname = `downloads/ximagine/${name}`;

const blob = await put(pathname, data, {
  access: "public",
  token,
  addRandomSuffix: false,
  allowOverwrite: true,
  // Versioned filename => immutable caching is safe.
  cacheControlMaxAge: 31_536_000,
});

console.log(JSON.stringify({ url: blob.url, pathname: blob.pathname, size: data.length }, null, 2));
