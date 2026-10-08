import type { Metadata } from "next";
import { SeoShell, Eyebrow, Faq, FaqSchema, ComparisonTable } from "@/components/seo-shell";

export const metadata: Metadata = {
  title: "What is Orleia? The Local-First AI Productivity App",
  description:
    "Orleia is a local-first AI productivity app combining tasks, habits, mindfulness, notes and calendar - with Noor, an AI assistant that knows you. Your data stays on your device.",
  alternates: { canonical: "https://www.orleia.app/what-is-orleia" },
  openGraph: {
    type: "website",
    title: "What is Orleia? The Local-First AI Productivity App",
    description:
      "Local-first AI productivity: tasks, habits, mindfulness, notes and calendar, plus Noor - an AI assistant that knows you. Your data stays on your device.",
    url: "https://www.orleia.app/what-is-orleia",
  },
  twitter: {
    card: "summary",
    title: "What is Orleia? The Local-First AI Productivity App",
    description:
      "Local-first AI productivity: tasks, habits, mindfulness, notes and calendar, plus an AI that knows you. Your data stays on your device.",
  },
};

const faq = [
  {
    q: "What is Orleia?",
    a: "Orleia is a local-first productivity suite that combines tasks, habits, mindfulness (journal + breathing and meditation), notes and a calendar in one app - with an AI assistant called Noor that can see all of it and act on it. Your data lives on your own device; there are no accounts and no ads or trackers.",
  },
  {
    q: "What can the Noor AI assistant do?",
    a: "Noor is Orleia's built-in assistant. It answers questions using your real workspace context, creates tasks, habits and calendar events for you, reads images (including photos taken in-app), supports research mode with cited sources, and can keep working in the background - you get a push notification with the answer even if you've left the app.",
  },
  {
    q: "Is Orleia free?",
    a: "Every Orleia tool - tasks, habits, mindfulness, notes, calendar, widgets and analytics - is free, with no feature paywalls. The only paid thing is heavier use of Noor: the free plan includes 30 Noor messages a day, and optional Plus, Pro or Ultra plans raise that daily limit.",
  },
  {
    q: "Where is my Orleia data stored?",
    a: "Orleia is local-first: your tasks, habits, journal entries, notes and settings are stored in your browser on your own device, and you can export or import everything as JSON at any time. When you chat with Noor, your message is processed in the moment to generate a reply - it is not used for advertising or model training.",
  },
  {
    q: "What platforms does Orleia run on?",
    a: "Orleia works in any modern browser on phone, tablet and desktop, can be installed as an app (PWA) on iOS and Android home screens, and ships as a native Windows desktop app. The local-first design means your data stays on whatever device you use it on.",
  },
  {
    q: "How is Orleia different from Notion or Obsidian?",
    a: "Notion stores your data in its cloud; Obsidian stores local Markdown files but needs plugins for almost everything else. Orleia is local-first like Obsidian and structured like Notion, but it ships habits, mindfulness, analytics and a built-in AI assistant out of the box - no plugins, no databases to configure, no account.",
  },
];

const comparison = {
  headers: ["", "Orleia", "Notion", "Obsidian"],
  rows: [
    ["AI assistant built in", "Yes - Noor (Fast & Core, research mode)", "Paid add-on", "Plugin needed"],
    ["Local-first (data on your device)", "Yes", "Cloud", "Local files"],
    ["Price", "Free tools; Noor plans from $8/mo", "Freemium", "Free core, paid sync"],
    ["Habits & mindfulness built in", "Yes - streaks, freezes, breathing, meditation", "No", "Community plugins"],
    ["Task management", "Yes - list, kanban and calendar views", "Databases (manual setup)", "Plugins"],
    ["No account required", "Yes", "No", "No"],
    ["Ads & trackers", "None", "Yes", "None"],
  ],
};

export default function WhatIsOrleiaPage() {
  return (
    <SeoShell>
      <FaqSchema items={faq} />

      {/* Hero - direct answer first (AI Overview-friendly) */}
      <section className="py-16 md:py-24">
        <Eyebrow>WHAT IS ORLEIA</Eyebrow>
        <h1 className="max-w-3xl text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
          What is Orleia? A local-first AI productivity app.
        </h1>
        <p className="mt-8 max-w-2xl text-base md:text-lg text-muted-foreground/70 font-body leading-relaxed">
          Orleia is a privacy-first productivity suite that brings tasks, habits, mindfulness,
          notes and a calendar together in one app - with an AI assistant called Noor
          that can see all of it and act on it. Unlike cloud tools, your data stays on your
          device: no accounts, no ads, no trackers.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a
            href="https://app.orleia.app"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-foreground text-background px-8 py-4 text-sm font-medium tracking-wide transition-all duration-300 hover:opacity-90 active:scale-[0.97]"
          >
            Try Orleia - no sign-up
          </a>
          <a
            href="/"
            className="text-sm font-medium tracking-wide text-muted-foreground/60 hover:text-foreground transition-colors underline underline-offset-4"
          >
            See the landing page
          </a>
        </div>
      </section>

      {/* What it does */}
      <section className="py-16 border-t border-border/50">
        <Eyebrow>ONE PRIVATE APP, EVERY TOOL</Eyebrow>
        <h2 className="max-w-2xl text-2xl md:text-3xl font-bold tracking-tight">
          Tasks, habits, mindfulness, notes, calendar - and Noor, the AI that connects them
        </h2>
        <p className="mt-6 max-w-2xl text-base text-muted-foreground/70 font-body leading-relaxed">
          Orleia is built around one idea: productivity tools work better when they share a single
          private brain. Your habit streaks, journal entries, notes and tasks live together, so
          Noor can ground every answer in your actual life - spotting a streak at risk, drafting
          tomorrow&apos;s plan from your notes, or logging your mood after a check-in.
        </p>
        <ul className="mt-8 grid gap-4 md:grid-cols-2 max-w-3xl">
          {[
            ["Tasks", "List, kanban and calendar views with priorities, due dates and recurring schedules."],
            ["Habits", "Daily tracking with streaks, freeze tokens, analytics and a personal stats page."],
            ["Mindfulness", "A private journal with mood tracking, plus guided breathing and meditation."],
            ["Notes", "Fast, searchable notes - your second brain without the setup."],
            ["Calendar", "A clean month and day view that keeps tasks and events in one place."],
            ["Noor (AI)", "Two model tiers (Fast and Core), research mode with cited sources, image understanding, charts - and actions that create real items in your workspace."],
            ["Widgets & analytics", "A customizable dashboard with widget catalog, productivity score and weekly trends."],
          ].map(([t, d]) => (
            <li key={t} className="border border-border/50 p-5">
              <span className="block text-sm font-semibold tracking-wide">{t}</span>
              <span className="mt-2 block text-sm text-muted-foreground/60 font-body leading-relaxed">
                {d}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* How it's different */}
      <section className="py-16 border-t border-border/50">
        <Eyebrow>LOCAL-FIRST</Eyebrow>
        <h2 className="max-w-2xl text-2xl md:text-3xl font-bold tracking-tight">
          How Orleia is different from Notion, Obsidian and other apps
        </h2>
        <p className="mt-6 max-w-2xl text-base text-muted-foreground/70 font-body leading-relaxed">
          Orleia is designed for people who want the power of a modern productivity suite without
          giving up control of their data. Every tool works without an account, your workspace
          lives on your device, and the only optional payment is for heavier Noor use - a
          fundamentally different approach from cloud suites that monetize attention and data.
        </p>
        <div className="mt-10">
          <ComparisonTable caption="Orleia vs Notion vs Obsidian" headers={comparison.headers} rows={comparison.rows} />
        </div>
        <p className="mt-6 max-w-2xl text-sm text-muted-foreground/50 font-body leading-relaxed">
          For deeper comparisons, see{" "}
          <a className="underline underline-offset-4 hover:text-foreground transition-colors" href="/notion-alternative">
            why people switch from Notion
          </a>{" "}
          and{" "}
          <a className="underline underline-offset-4 hover:text-foreground transition-colors" href="/obsidian-alternative">
            why Obsidian users choose Orleia
          </a>
          , or read about{" "}
          <a className="underline underline-offset-4 hover:text-foreground transition-colors" href="/local-first-productivity">
            the local-first movement
          </a>
          .
        </p>
      </section>

      {/* FAQ */}
      <section className="py-16 border-t border-border/50">
        <Eyebrow>FAQ</Eyebrow>
        <h2 className="max-w-2xl text-2xl md:text-3xl font-bold tracking-tight mb-10">
          Frequently asked questions about Orleia
        </h2>
        <Faq items={faq} />
      </section>
    </SeoShell>
  );
}
