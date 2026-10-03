import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  format,
  formatDistanceToNow,
  isToday,
  isYesterday,
  isThisWeek,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  parseISO,
  differenceInDays,
  addDays,
} from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, fmt: string = "MMM d, yyyy"): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, fmt);
}

export function formatRelative(date: string | Date): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (isThisWeek(d)) return format(d, "EEEE");
  return formatDistanceToNow(d, { addSuffix: true });
}

export function getDaysInMonth(year: number, month: number): Date[] {
  const start = startOfMonth(new Date(year, month));
  const end = endOfMonth(new Date(year, month));
  return eachDayOfInterval({ start, end });
}

export function generateId(): string {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function getToday(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function getWeekRange(date: Date = new Date()): { start: string; end: string } {
  return {
    start: format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd"),
    end: format(endOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd"),
  };
}

export function getDateRange(days: number): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(format(addDays(new Date(), -i), "yyyy-MM-dd"));
  }
  return dates;
}

export function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len) + "...";
}

/**
 * Readable, short form of a URL for link text: host + first path segments,
 * no protocol, query or fragment ("openai.com/index/devday" instead of
 * "https://www.openai.com/index/devday-2026?utm_source=…"). The href keeps
 * the full URL - only the visible label is compacted.
 */
export function compactUrl(raw: string, max = 46): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    const segs = u.pathname.split("/").filter(Boolean);
    // Prefer the trailing slug (article titles live there); time-partitioned
    // paths like /2026/10/... read terribly as link text.
    const last = segs[segs.length - 1] || "";
    // Long separator-less tokens (Google News' CBMi… wrappers) are opaque
    // ids, not readable slugs - fall back to the leading path instead.
    const opaque = /^[a-z0-9]{20,}$/i.test(last);
    const slug =
      !opaque && /^[a-z0-9][a-z0-9._-]{3,47}$/i.test(last) && /[a-z]/i.test(last) ? last : "";
    const label = slug ? `${host}/${slug}` : segs.length ? `${host}/${segs.slice(0, 2).join("/")}` : host;
    return truncate(label, max);
  } catch {
    return truncate(raw.replace(/^https?:\/\//, ""), max);
  }
}

export function calculateStreak(logDates: string[]): { current: number; longest: number } {
  if (logDates.length === 0) return { current: 0, longest: 0 };

  const sorted = [...new Set(logDates)].sort().reverse();

  const today = getToday();
  const yesterday = format(addDays(parseISO(today), -1), "yyyy-MM-dd");

  // Current streak: consecutive days counted BACKWARD from the most recent
  // log, as long as that log is today or yesterday (streak still alive).
  // The old loop only assigned `current` when it hit a gap, so a perfectly
  // consecutive streak (the best users!) computed current = 0 — which
  // silently suppressed every habit reminder for exactly the people the
  // feature exists for.
  let current = 0;
  const lastLog = sorted[0];
  if (lastLog === today || lastLog === yesterday) {
    current = 1;
    for (let i = 1; i < sorted.length; i++) {
      const expectedPrev = format(addDays(parseISO(sorted[i - 1]), -1), "yyyy-MM-dd");
      if (sorted[i] === expectedPrev) current++;
      else break;
    }
  }

  // Calculate longest streak from all logs
  let longest = 1;
  let tempStreak = 1;
  const asc = [...sorted].reverse();
  for (let i = 0; i < asc.length - 1; i++) {
    const expectedNext = format(addDays(parseISO(asc[i]), 1), "yyyy-MM-dd");
    if (asc[i + 1] === expectedNext) {
      tempStreak++;
      longest = Math.max(longest, tempStreak);
    } else {
      tempStreak = 1;
    }
  }

  return { current, longest };
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getMoodScore(mood: string): number {
  const scores: Record<string, number> = {
    amazing: 100,
    good: 75,
    neutral: 50,
    bad: 25,
    terrible: 0,
  };
  return scores[mood] || 50;
}
