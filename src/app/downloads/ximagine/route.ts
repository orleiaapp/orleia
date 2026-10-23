import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Ximagine installer lives on Vercel Blob under a versioned pathname
// (immutable caching). This route keeps the download link on our own
// domain — the landing page points at /downloads/ximagine — so the
// storage location can change later without touching any page.
//
// ?download=1 makes Blob serve the file with
// Content-Disposition: attachment, so the browser downloads the .exe
// instead of trying to render it. Uploads go through
// scripts/upload-ximagine.mjs.
const INSTALLER_URL =
  "https://6bdmafsuooogvteq.public.blob.vercel-storage.com/downloads/ximagine/Ximagine-Setup-0.1.0.exe";

function redirect() {
  return NextResponse.redirect(`${INSTALLER_URL}?download=1`, 307);
}

export function GET() {
  return redirect();
}

export function HEAD() {
  return redirect();
}
