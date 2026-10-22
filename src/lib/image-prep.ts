"use client";

// ============================================================
// Image prep for vision uploads.
//
// A phone photo is 3-5 MB; the vision model sees it as a fixed grid of
// patches, so most of those bytes buy nothing but upload time. We
// downscale to a 1280px long edge and re-encode as JPEG before the
// data URL ever leaves the device - a 4 MB photo becomes ~200-350 KB,
// which is the single biggest latency win in the photo-to-answer path.
//
// Text-heavy images (homework, screenshots, documents) keep a higher
// quality setting: JPEG artefacts around small glyphs hurt transcription
// far more than they hurt a landscape photo.
// ============================================================

export interface PreparedImage {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

const MAX_EDGE = 1280;
/** Photos re-encode hard; text needs more bits per pixel. */
const QUALITY_PHOTO = 0.82;
const QUALITY_TEXT = 0.9;
/** Below this, re-encoding costs more than it saves. */
const ALREADY_SMALL_BYTES = 320 * 1024;
const ALREADY_SMALL_EDGE = 1600;

/** Rough decoded size of a base64 data URL. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.round((b64.length * 3) / 4);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

type Bitmap = { width: number; height: number; close?: () => void };

async function decode(dataUrl: string): Promise<{ bitmap: Bitmap; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void } | null> {
  // createImageBitmap is the fast path (off-main-thread decode in Chrome).
  try {
    if (typeof createImageBitmap === "function") {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      // "from-image" honours EXIF orientation, so a phone photo taken
      // sideways stays upright instead of reaching the model rotated.
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      return {
        bitmap,
        draw: (ctx, w, h) => ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, w, h),
      };
    }
  } catch {
    /* fall through to the <img> decoder */
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        bitmap: { width: img.naturalWidth, height: img.naturalHeight },
        draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Downscale + compress a picked image for /api/vision.
 * Always resolves: if canvas encoding is unavailable we return the
 * original data URL rather than blocking the attachment.
 */
export async function prepareImageForVision(file: File): Promise<PreparedImage | null> {
  let original: string;
  try {
    original = await readAsDataUrl(file);
  } catch {
    return null;
  }
  const originalBytes = dataUrlBytes(original);

  const decoded = await decode(original);
  if (!decoded) return { dataUrl: original, width: 0, height: 0, bytes: originalBytes };

  const { bitmap, draw } = decoded;
  const longEdge = Math.max(bitmap.width, bitmap.height) || MAX_EDGE;
  const scale = Math.min(1, MAX_EDGE / longEdge);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  if (scale === 1 && originalBytes <= ALREADY_SMALL_BYTES && longEdge <= ALREADY_SMALL_EDGE) {
    bitmap.close?.();
    return { dataUrl: original, width, height, bytes: originalBytes };
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    // White matte: transparent PNGs would otherwise turn black in JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = "high";
    draw(ctx, width, height);

    // Heuristic: a screenshot/scan has large flat regions and very few
    // colours; keep its text crisp. Photos tolerate stronger compression.
    const isTextLike = file.type === "image/png" || /screenshot|scan|document|homework/i.test(file.name);
    const dataUrl = canvas.toDataURL("image/jpeg", isTextLike ? QUALITY_TEXT : QUALITY_PHOTO);
    bitmap.close?.();
    return { dataUrl, width, height, bytes: dataUrlBytes(dataUrl) };
  } catch {
    bitmap.close?.();
    return { dataUrl: original, width: 0, height: 0, bytes: originalBytes };
  }
}
