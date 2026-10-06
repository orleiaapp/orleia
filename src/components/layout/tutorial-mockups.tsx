"use client";

/**
 * Miniature visual previews of every Orleia page, used to anchor the
 * onboarding slides and the tutorial walkthrough. Pure CSS/Tailwind -
 * no canvas, no images, no framer-motion (which is disabled on touch
 * devices) - so they render identically on phone, tablet and desktop.
 *
 * All mockups are grayscale/zinc with emerald accents for "done" states,
 * matching the real app's design language exactly.
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
        "w-full overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/40",
        className
      )}
    >
      {/* Title bar */}
      <div className="flex items-center gap-1.5 border-b border-border bg-secondary/50 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/25" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/25" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/25" />
        <span className="ml-2 flex-1 rounded-md bg-muted px-2 py-0.5 text-center text-[9px] text-muted-foreground/50">
          {title}
        </span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

/* Tiny building blocks -------------------------------------------------- */

function Bar({ w, className }: { w: string; className?: string }) {
  return <div className={cn("h-1.5 rounded-full bg-muted", className)} style={{ width: w }} />;
}

function Card({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-secondary/40 p-2.5", className)}>
      {children}
    </div>
  );
}

function Dot({ color = "bg-muted-foreground/30" }: { color?: string }) {
  return <span className={cn("h-1.5 w-1.5 rounded-full", color)} />;
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
          <div className="mb-1 flex h-6 items-center justify-center rounded-lg bg-primary-500/15">
            <span className="text-[10px] font-bold text-primary-500">N</span>
          </div>
          {[LayoutDashboard, CheckCircle2, FileText, BookOpen, ListTodo].map((I, i) => (
            <div
              key={i}
              className={cn(
                "flex h-6 items-center justify-center rounded-lg",
                i === 0 ? "bg-primary-500/10 text-primary-500" : "text-muted-foreground/40"
              )}
            >
              <I className="h-3 w-3" />
            </div>
          ))}
        </div>
        {/* Main */}
        <div className="flex-1 space-y-2">
          <Bar w="60%" className="h-2 bg-foreground/20" />
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i}>
                <Dot color="bg-emerald-500/50" />
                <Bar w="70%" className="mt-2" />
                <Bar w="45%" className="mt-1" />
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
        <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 p-3">
          <div className="space-y-1.5">
            <Bar w="80%" className="h-2 bg-foreground/20" />
            <Bar w="55%" />
          </div>
          <div className="relative flex h-14 w-14 items-center justify-center">
            <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
              <circle cx="28" cy="28" r="24" fill="none" strokeWidth="5" className="stroke-muted" />
              <circle
                cx="28"
                cy="28"
                r="24"
                fill="none"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray="151"
                strokeDashoffset="60"
                className="stroke-emerald-500"
              />
            </svg>
            <span className="absolute text-[11px] font-bold">62</span>
          </div>
        </div>
        {/* Today cards */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Sun, label: "Habits", n: "3/4", ok: true },
            { icon: Target, label: "Tasks", n: "2", ok: false },
            { icon: Heart, label: "Mood", n: "Good", ok: false },
          ].map((c, i) => (
            <Card key={i} className="flex flex-col items-center gap-1 py-2">
              <c.icon className="h-3.5 w-3.5 text-muted-foreground/60" />
              <span className="text-[10px] font-semibold">{c.n}</span>
              <span className="text-[8px] text-muted-foreground/50">{c.label}</span>
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
                "flex h-6 w-6 items-center justify-center rounded-full border",
                h.done ? "border-emerald-500/40 bg-emerald-500/15" : "border-border"
              )}
            >
              {h.done ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
              )}
            </span>
            <div className="flex-1">
              <Bar w={h.done ? "75%" : "60%"} className={h.done ? "bg-foreground/25" : ""} />
              <div className="mt-1 flex items-center gap-1 text-[8px] text-muted-foreground/50">
                <Flame className="h-2 w-2 text-emerald-500/70" />
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
                "h-2.5 flex-1 rounded-[2px]",
                i % 4 === 0
                  ? "bg-emerald-500/70"
                  : i % 4 === 1
                  ? "bg-emerald-500/40"
                  : i % 4 === 2
                  ? "bg-emerald-500/20"
                  : "bg-muted"
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
      <div className="mb-2 flex items-center gap-1 rounded-lg border border-border bg-secondary/40 px-2 py-1.5">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[8px] font-semibold text-muted-foreground/70">
          B
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[8px] font-semibold italic text-muted-foreground/70">
          I
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[8px] font-semibold text-muted-foreground/70 underline">
          U
        </span>
        <span className="mx-1 h-3 w-px bg-border" />
        <span className="rounded bg-muted px-1.5 py-0.5 text-[8px] text-muted-foreground/70">Aa</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[8px] text-muted-foreground/70">16</span>
        <span className="ml-auto rounded bg-primary-500/15 px-1.5 py-0.5 text-[8px] font-semibold text-primary-500">
          A4
        </span>
      </div>
      {/* Paper */}
      <div className="mx-auto max-w-[240px] rounded-sm border border-border bg-white p-3 shadow-lg shadow-black/30">
        <div className="mb-2 h-2 w-1/2 rounded-sm bg-zinc-300" />
        <div className="space-y-1">
          <Bar w="100%" className="bg-zinc-200" />
          <Bar w="92%" className="bg-zinc-200" />
          <Bar w="97%" className="bg-zinc-200" />
          <Bar w="64%" className="bg-zinc-200" />
          <Bar w="100%" className="bg-zinc-200" />
          <Bar w="80%" className="bg-zinc-200" />
        </div>
        <div className="mt-2.5 flex gap-1">
          <span className="h-5 w-5 rounded-sm bg-zinc-200" />
          <div className="flex-1 space-y-1">
            <Bar w="90%" className="bg-zinc-200" />
            <Bar w="55%" className="bg-zinc-200" />
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
        <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 p-2.5">
          {["😞", "😐", "🙂", "😄", "🌟"].map((f, i) => (
            <span
              key={i}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-sm",
                i === 3 ? "bg-emerald-500/15 ring-1 ring-emerald-500/40" : "bg-muted"
              )}
            >
              {f}
            </span>
          ))}
        </div>
        {/* Entry */}
        <Card>
          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/60">
            <BookOpen className="h-2.5 w-2.5" /> Today · Feeling good
          </div>
          <div className="mt-2 space-y-1">
            <Bar w="100%" />
            <Bar w="88%" />
            <Bar w="60%" />
          </div>
        </Card>
        {/* Wellness */}
        <div className="flex items-center gap-2 rounded-xl border border-border bg-emerald-500/5 p-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15">
            <Wind className="h-3.5 w-3.5 text-emerald-500" />
          </span>
          <div className="flex-1">
            <Bar w="55%" className="bg-emerald-500/30" />
            <Bar w="35%" className="mt-1" />
          </div>
          <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-semibold text-emerald-500">
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
          <Card
            key={i}
            className={cn(
              "flex items-center gap-2.5 py-2",
              x.done && "opacity-50"
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-md border",
                x.done ? "border-emerald-500/40 bg-emerald-500/15" : "border-muted-foreground/25"
              )}
            >
              {x.done && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
            </span>
            <div className="flex-1">
              <Bar w={x.done ? "70%" : "82%"} className={x.done ? "bg-foreground/15" : "bg-foreground/25"} />
            </div>
            <Dot
              color={
                x.p === "urgent"
                  ? "bg-emerald-500"
                  : x.p === "high"
                  ? "bg-zinc-300"
                  : x.p === "medium"
                  ? "bg-zinc-500"
                  : "bg-zinc-700"
              }
            />
          </Card>
        ))}
        {/* Quick add */}
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/25 px-2.5 py-2">
          <Zap className="h-3 w-3 text-muted-foreground/40" />
          <Bar w="50%" className="bg-muted" />
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
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-[9px] font-semibold text-muted-foreground/70">
            <Bot className="h-2.5 w-2.5" /> Ethos 4.7
          </span>
        </div>
        {/* Noor message */}
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-secondary/40 px-3 py-2">
          <div className="space-y-1">
            <Bar w="100%" className="bg-foreground/20" />
            <Bar w="72%" className="bg-foreground/20" />
          </div>
        </div>
        {/* User message */}
        <div className="ml-auto max-w-[75%] rounded-2xl rounded-tr-sm bg-foreground px-3 py-2">
          <div className="space-y-1">
            <Bar w="90%" className="bg-background/40" />
            <Bar w="50%" className="bg-background/40" />
          </div>
        </div>
        {/* Action pill */}
        <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-1.5">
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          <span className="text-[9px] font-medium text-emerald-500/90">
            Created: “10 push ups” habit
          </span>
        </div>
        {/* Composer */}
        <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-2.5 py-2">
          <Bar w="60%" className="bg-muted" />
          <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/80">
            <Zap className="h-2.5 w-2.5 text-background" />
          </span>
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* Registry                                                           */
/* ------------------------------------------------------------------ */
