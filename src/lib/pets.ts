"use client";

// ============================================================
// Orleia Pets (beta) — abstract companions, not realistic animals.
// Pure local-first cosmetic: the choice lives in profile.pet and
// drives the profile avatar everywhere. No cloud, no image files —
// each pet is a small generative SVG so it stays crisp at any size.
// Every body is rendered volumetrically rather than flat-filled: a
// radial body gradient (lifted top-left → base → shaded bottom-right),
// a soft top sheen, a core shadow clipped to the silhouette, and a
// blurred ground shadow, so the abstract shapes read as 3D objects.
// ============================================================

import type { UserProfile } from "@/types";

export interface OrleiaPet {
  id: string;
  name: string;
  /** Primary + secondary hex colors for the abstract body. */
  c1: string;
  c2: string;
  /** Compact SVG body of the abstract creature (viewBox 0 0 64 64). */
  svg: string;
}

/** Multiply a hex toward black (f = 0 keeps, f = 1 → black). */
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - f));
  const g = Math.round(((n >> 8) & 255) * (1 - f));
  const b = Math.round((n & 255) * (1 - f));
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** Mix a hex toward white by f (0 keeps, 1 → #fff). */
function lift(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * f);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/**
 * Shared volumetric layers for one silhouette: <defs> (body gradient,
 * clipPath, ground-shadow gradient), the soft ground shadow, the shaded
 * body, then a clipped top sheen + bottom-right core shadow.
 *
 * The {U} placeholder becomes the pet id in petSvg(), keeping ids
 * deterministic and hydration-safe (no counters). Every instance of a
 * pet carries byte-identical defs, so duplicate ids across instances
 * resolve to the same paint either way — and a lone instance always
 * still defines the ids it references.
 */
function shaded(
  sil: string,
  shadow: { cx: number; cy: number; rx: number },
): string {
  return (
    "<defs>" +
    '<radialGradient id="pb-{U}" cx="34%" cy="26%" r="95%">' +
    '<stop offset="0" stop-color="{L}"/>' +
    '<stop offset="0.48" stop-color="{C1}"/>' +
    '<stop offset="1" stop-color="{D}"/>' +
    "</radialGradient>" +
    `<clipPath id="pc-{U}"><path d="${sil}"/></clipPath>` +
    '<radialGradient id="ps-{U}"><stop offset="0" stop-color="#000" stop-opacity="0.32"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>' +
    "</defs>" +
    `<ellipse cx="${shadow.cx}" cy="${shadow.cy}" rx="${shadow.rx}" ry="${(shadow.rx * 0.24).toFixed(1)}" fill="url(#ps-{U})"/>` +
    `<path d="${sil}" fill="url(#pb-{U})"/>` +
    `<g clip-path="url(#pc-{U})">` +
    '<ellipse cx="48" cy="52" rx="21" ry="16" fill="#000" opacity="0.12"/>' +
    '<ellipse cx="21" cy="17" rx="13" ry="9" fill="#fff" opacity="0.16"/>' +
    "</g>"
  );
}

/**
 * Abstract creatures only: nothing that reads as a specific real
 * animal (deliberate brand choice). Each is a geometric composition
 * with "eye"s so it feels alive; the volumetric pass above gives the
 * shape depth without breaking the abstraction.
 */
export const PETS: OrleiaPet[] = [
  {
    id: "blob",
    name: "Blob",
    c1: "#6366f1",
    c2: "#a5b4fc",
    svg:
      shaded("M32 10c11 0 20 9 20 21s-9 23-20 23-20-11-20-23 9-21 20-21z", {
        cx: 32,
        cy: 57.5,
        rx: 13.5,
      }) +
      '<ellipse cx="24" cy="30" rx="6" ry="7" fill="{C2}" opacity="0.55"/>' +
      '<circle cx="40" cy="26" r="4" fill="#0f172a"/>' +
      '<circle cx="41.5" cy="24.5" r="1.3" fill="#fff"/>',
  },
  {
    id: "spike",
    name: "Spike",
    c1: "#8b5cf6",
    c2: "#c4b5fd",
    svg:
      shaded("M32 8l6 10h12l-8 10 4 14-14-6-14 6 4-14-8-10h12z", {
        cx: 32,
        cy: 45.5,
        rx: 12,
      }) +
      '<circle cx="27" cy="34" r="3.4" fill="#0f172a"/>' +
      '<circle cx="37" cy="34" r="3.4" fill="#0f172a"/>' +
      '<circle cx="28.2" cy="32.8" r="1.1" fill="#fff"/>' +
      '<circle cx="38.2" cy="32.8" r="1.1" fill="#fff"/>',
  },
  {
    id: "swirl",
    name: "Swirl",
    c1: "#06b6d4",
    c2: "#a5f3fc",
    svg:
      shaded(
        "M32 8a24 24 0 1 1-17 41 19 19 0 0 0 17-17 14 14 0 0 0-14-14 10 10 0 0 1 14-10z",
        { cx: 32, cy: 59, rx: 12.5 },
      ) +
      '<circle cx="40" cy="40" r="7" fill="{C2}" opacity="0.6"/>' +
      '<circle cx="22" cy="24" r="3.2" fill="#0f172a"/>' +
      '<circle cx="23" cy="23" r="1" fill="#fff"/>',
  },
  {
    id: "ghost",
    name: "Wisp",
    c1: "#10b981",
    c2: "#a7f3d0",
    svg:
      shaded(
        "M32 10c10 0 16 8 16 18v22l-6-5-5 5-5-5-5 5-5-5-6 5V28c0-10 6-18 16-18z",
        { cx: 32, cy: 53.5, rx: 12 },
      ) +
      '<circle cx="26" cy="30" r="3.2" fill="#0f172a"/>' +
      '<circle cx="38" cy="30" r="3.2" fill="#0f172a"/>' +
      '<circle cx="27" cy="29" r="1.1" fill="#fff"/>' +
      '<circle cx="39" cy="29" r="1.1" fill="#fff"/>',
  },
  {
    id: "diamond",
    name: "Gem",
    c1: "#f59e0b",
    c2: "#fde68a",
    svg:
      shaded("M32 8l16 16-16 32-16-32z", { cx: 32, cy: 59, rx: 11 }) +
      '<path d="M32 8l16 16H16z" fill="{C2}" opacity="0.55"/>' +
      '<path d="M32 8v48" stroke="{D}" stroke-width="0.8" opacity="0.35"/>' +
      '<circle cx="27" cy="36" r="3" fill="#0f172a"/>' +
      '<circle cx="37" cy="36" r="3" fill="#0f172a"/>' +
      '<circle cx="28" cy="35" r="1" fill="#fff"/>' +
      '<circle cx="38" cy="35" r="1" fill="#fff"/>',
  },
  {
    id: "bolt",
    name: "Bolt",
    c1: "#ef4444",
    c2: "#fecaca",
    svg:
      shaded("M28 6l16 20H34l6 22-20-26h10z", { cx: 32, cy: 51.5, rx: 8.5 }) +
      '<circle cx="30" cy="40" r="3.2" fill="#0f172a"/>' +
      '<circle cx="31" cy="39" r="1.1" fill="#fff"/>',
  },
];

export function petById(id: string | undefined): OrleiaPet | undefined {
  return PETS.find((p) => p.id === id);
}

export function petSvg(pet: OrleiaPet, className = ""): string {
  const L = lift(pet.c1, 0.42);
  const D = shade(pet.c1, 0.42);
  return (
    '<svg class="' +
    className +
    '" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' +
    pet.name +
    ' pet">' +
    pet.svg
      .replace(/\{U\}/g, pet.id)
      .replace(/\{C1\}/g, pet.c1)
      .replace(/\{C2\}/g, pet.c2)
      .replace(/\{L\}/g, L)
      .replace(/\{D\}/g, D) +
    "</svg>"
  );
}

/** Profile integration: pet lives on UserProfile (see types). */
declare module "@/types" {
  interface UserProfile {
    /** Beta: chosen Orleia Pet id (see lib/pets.ts). */
    pet?: string;
    /** Optional custom name for the pet (shown on the Habits page). */
    petName?: string;
  }
}
