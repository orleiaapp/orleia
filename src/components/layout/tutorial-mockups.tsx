"use client";

/**
 * Miniature visual previews of every Orleia page, used to anchor the
 * onboarding slides and the tutorial walkthrough. Pure CSS/Tailwind —
 * no canvas, no images, no framer-motion — so they render identically
 * on phone, tablet and desktop.
 *
 * Dark-native by design: the tour lives on the near-black #050508 canvas,
 * so the frames are zinc-900 chrome with white accents instead of theme
 * tokens. Monochrome only — no green — with bold outer shapes (thick bars,
 * big check circles, high-contrast bubbles) and a deliberately sparse
 * interior so each slide reads at a glance.
 */

import {
  LayoutDashboard,
  CheckCircle2,
  FileText,
  BookOpen,
  ListTodo,
  Bot,
  Sun,
  Flame,
  Target,
  Zap,
  Heart,
  Wind,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Window frame                                                       */
/* ------------------------------------------------------------------ */

function Frame({
  children,
  className,
  title = "Orleia",
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/60",
        className
      )}
    >
      {/* Title bar */}
      <div className="flex items-center gap-1.5 border-b border-zinc-800 bg-zinc-950/70 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-zinc-700" />
        <span className="h-2 w-2 rounded-full bg-zinc-700" />
        <span className="h-2 w-2 rounded-full bg-zinc-700" />
        <span className="ml-2 flex-1 rounded-md bg-zinc-800 px-2 py-0.5 text-center text-[9px] font-medium text-zinc-400">
          {title}
        </span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

/* Tiny building blocks -------------------------------------------------- */

function Bar({ w, className }: { w: string; className?: string }) {
  return <div className={cn("h-2 rounded-full bg-zinc-700", className)} style={{ width: w }} />;
}

function Card({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-zinc-800 bg-zinc-950/60 p-2.5", className)}>
      {children}
    </div>
  );
}

function Dot({ color = "bg-zinc-600" }: { color?: string }) {
  return <span className={cn("h-2 w-2 rounded-full", color)} />;
}

/* ------------------------------------------------------------------ */
/* 1. Workspace shell                                                  */
/* ------------------------------------------------------------------ */

export function ShellMock() {
  return (
    <Frame title="Your workspace">
      <div className="flex gap-2.5">
        {/* Sidebar */}
        <div className="flex w-14 flex-col gap-2">
          <div className="mb-1 flex h-7 items-center justify-center rounded-lg bg-white">
            <span className="text-[11px] font-bold text-black">N</span>
          </div>
          {[LayoutDashboard, CheckCircle2, FileText, BookOpen, ListTodo].map((I, i) => (
            <div
              key={i}
              className={cn(
                "flex h-7 items-center justify-center rounded-lg",
                i === 0 ? "bg-zinc-700 text-white" : "text-zinc-600"
              )}
            >
              <I className="h-3.5 w-3.5" />
            </div>
          ))}
        </div>
        {/* Main */}
        <div className="flex-1 space-y-2">
          <Bar w="60%" className="h-2.5 bg-white/40" />
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i}>
                <Dot color="bg-white" />
                <Bar w="70%" className="mt-2 bg-zinc-600" />
              </Card>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Dashboard                                                        */
/* ------------------------------------------------------------------ */

export function DashboardMock() {
  return (
    <Frame title="Dashboard">
      <div className="space-y-2.5">
        {/* Productivity ring */}
        <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="space-y-2">
            <Bar w="80%" className="h-2.5 bg-white/40" />
            <Bar w="55%" className="bg-zinc-700" />
          </div>
          <div className="relative flex h-16 w-16 items-center justify-center">
            <svg viewBox="0 0 56 56" className="h-16 w-16 -rotate-90">
              <circle cx="28" cy="28" r="24" fill="none" strokeWidth="7" className="stroke-zinc-800" />
              <circle
                cx="28"
                cy="28"
                r="24"
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray="151"
                strokeDashoffset="55"
                className="stroke-white"
              />
            </svg>
            <span className="absolute text-xs font-bold text-white">62</span>
          </div>
        </div>
        {/* Today cards */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Sun, label: "Habits", n: "3/4" },
            { icon: Target, label: "Tasks", n: "2" },
            { icon: Heart, label: "Mood", n: "Good" },
          ].map((c, i) => (
            <Card key={i} className="flex flex-col items-center gap-1 py-2.5">
              <c.icon className="h-4 w-4 text-zinc-500" />
              <span className="text-[11px] font-bold text-white">{c.n}</span>
              <span className="text-[8px] text-zinc-500">{c.label}</span>
            </Card>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Habits                                                           */
/* ------------------------------------------------------------------ */

export function HabitsMock() {
  return (
    <Frame title="Habits">
      <div className="space-y-2.5">
        {[
          { name: "Morning run", streak: 12, done: true },
          { name: "Read 20 pages", streak: 5, done: true },
          { name: "Meditate", streak: 2, done: false },
        ].map((h, i) => (
          <Card key={i} className="flex items-center gap-2.5">
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                h.done ? "border-white/50 bg-white/15" : "border-zinc-700"
              )}
            >
              {h.done ? (
                <CheckCircle2 className="h-4 w-4 text-white" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-zinc-600" />
              )}
            </span>
            <div className="flex-1">
              <Bar w={h.done ? "75%" : "60%"} className={h.done ? "bg-white/40" : ""} />
              <div className="mt-1.5 flex items-center gap-1 text-[8px] text-zinc-500">
                <Flame className="h-2.5 w-2.5 text-white/80" />
                {h.streak} day streak
              </div>
            </div>
          </Card>
        ))}
        {/* Heatmap strip */}
        <div className="flex gap-[3px] pt-1">
          {Array.from({ length: 21 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-3 flex-1 rounded-[3px]",
                i % 4 === 0
                  ? "bg-white/80"
                  : i % 4 === 1
                  ? "bg-white/45"
                  : i % 4 === 2
                  ? "bg-white/20"
                  : "bg-zinc-800"
              )}
            />
          ))}
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Documents (Word-style)                                           */
/* ------------------------------------------------------------------ */

export function DocumentsMock() {
  return (
    <Frame title="Documents">
      {/* Toolbar */}
      <div className="mb-2 flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/60 px-2 py-1.5">
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[8px] font-bold text-zinc-300">B</span>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[8px] font-bold italic text-zinc-300">
          I
        </span>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[8px] font-bold text-zinc-300 underline">
          U
        </span>
        <span className="mx-1 h-3 w-px bg-zinc-700" />
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[8px] text-zinc-400">Aa</span>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[8px] text-zinc-400">16</span>
        <span className="ml-auto rounded bg-white px-1.5 py-0.5 text-[8px] font-bold text-black">
          A4
        </span>
      </div>
      {/* Paper */}
      <div className="mx-auto max-w-[240px] rounded-md border border-zinc-700 bg-zinc-100 p-3 shadow-xl shadow-black/50">
        <div className="mb-2.5 h-2.5 w-1/2 rounded-sm bg-zinc-400" />
        <div className="space-y-1.5">
          <Bar w="100%" className="h-1.5 bg-zinc-300" />
          <Bar w="92%" className="h-1.5 bg-zinc-300" />
          <Bar w="97%" className="h-1.5 bg-zinc-300" />
          <Bar w="64%" className="h-1.5 bg-zinc-300" />
        </div>
        <div className="mt-3 flex gap-1.5">
          <span className="h-6 w-6 rounded-sm bg-zinc-300" />
          <div className="flex-1 space-y-1.5">
            <Bar w="90%" className="h-1.5 bg-zinc-300" />
            <Bar w="55%" className="h-1.5 bg-zinc-300" />
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Journal                                                          */
/* ------------------------------------------------------------------ */

export function JournalMock() {
  return (
    <Frame title="Journal">
      <div className="space-y-2.5">
        {/* Mood faces */}
        <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 p-2.5">
          {["😞", "😐", "🙂", "😄", "🌟"].map((f, i) => (
            <span
              key={i}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full text-base",
                i === 3 ? "bg-white/15 ring-2 ring-white" : "bg-zinc-800"
              )}
            >
              {f}
            </span>
          ))}
        </div>
        {/* Entry */}
        <Card>
          <div className="flex items-center gap-1.5 text-[9px] font-medium text-zinc-400">
            <BookOpen className="h-2.5 w-2.5" /> Today · Feeling good
          </div>
          <div className="mt-2 space-y-1.5">
            <Bar w="100%" className="bg-zinc-600" />
            <Bar w="70%" className="bg-zinc-700" />
          </div>
        </Card>
        {/* Wellness */}
        <div className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 p-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
            <Wind className="h-4 w-4 text-black" />
          </span>
          <div className="flex-1">
            <Bar w="55%" className="bg-zinc-500" />
            <Bar w="35%" className="mt-1.5 bg-zinc-700" />
          </div>
          <span className="rounded-md bg-zinc-900 px-1.5 py-0.5 text-[8px] font-bold text-zinc-300">
            3 min
          </span>
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Tasks                                                            */
/* ------------------------------------------------------------------ */

export function TasksMock() {
  return (
    <Frame title="Tasks">
      <div className="space-y-2">
        {[
          { t: "Finish proposal", p: "high", done: true },
          { t: "Call the team", p: "urgent", done: false },
          { t: "Book flights", p: "medium", done: false },
          { t: "Review draft", p: "low", done: false },
        ].map((x, i) => (
          <Card key={i} className={cn("flex items-center gap-2.5 py-2.5", x.done && "opacity-45")}>
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
                x.done ? "border-white/60 bg-white/20" : "border-zinc-700"
              )}
            >
              {x.done && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
            </span>
            <div className="flex-1">
              <Bar w={x.done ? "70%" : "82%"} className={x.done ? "bg-zinc-700" : "bg-white/30"} />
            </div>
            <Dot
              color={
                x.p === "urgent"
                  ? "bg-white"
                  : x.p === "high"
                  ? "bg-zinc-400"
                  : x.p === "medium"
                  ? "bg-zinc-600"
                  : "bg-zinc-800"
              }
            />
          </Card>
        ))}
        {/* Quick add */}
        <div className="flex items-center gap-2 rounded-lg border-2 border-dashed border-zinc-800 px-2.5 py-2.5">
          <Zap className="h-3.5 w-3.5 text-zinc-600" />
          <Bar w="50%" className="bg-zinc-800" />
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* 8. Noor                                                             */
/* ------------------------------------------------------------------ */

export function NoorMock() {
  return (
    <Frame title="Noor">
      <div className="space-y-2.5">
        {/* Model chip */}
        <div className="flex items-center justify-center">
          <span className="flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[9px] font-semibold text-zinc-300">
            <Bot className="h-2.5 w-2.5" /> Ethos 4.7
          </span>
        </div>
        {/* Noor message */}
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-zinc-700 bg-zinc-800 px-3 py-2.5">
          <div className="space-y-1.5">
            <Bar w="100%" className="bg-zinc-500" />
            <Bar w="72%" className="bg-zinc-600" />
          </div>
        </div>
        {/* User message */}
        <div className="ml-auto max-w-[75%] rounded-2xl rounded-tr-sm bg-white px-3 py-2.5">
          <div className="space-y-1.5">
            <Bar w="90%" className="bg-black/25" />
            <Bar w="50%" className="bg-black/25" />
          </div>
        </div>
        {/* Action pill */}
        <div className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 px-2.5 py-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-white" />
          <span className="text-[9px] font-semibold text-zinc-200">
            Created: “10 push ups” habit
          </span>
        </div>
        {/* Composer */}
        <div className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950/60 px-2.5 py-2">
          <Bar w="60%" className="bg-zinc-800" />
          <span className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-white">
            <Zap className="h-3 w-3 text-black" />
          </span>
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* Registry                                                           */
/* ------------------------------------------------------------------ */
