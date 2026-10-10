import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Changelog - Orleia",
  description:
    "What's new in Orleia: every release, from the latest features and fixes to the earliest foundations.",
  alternates: { canonical: "https://www.orleia.app/changelog" },
};

interface Release {
  version: string;
  date: string;
  tag: "Feature" | "Release" | "Fix";
  highlight: string;
  items: string[];
}

const RELEASES: Release[] = [
  {
    version: "2.7.0",
    date: "October 10, 2026",
    tag: "Feature",
    highlight: "Constellation mode. Noor that never cuts off.",
    items: [
      "New Constellation theme: a live starfield behind your workspace, picked from visual cards in Settings → Appearance.",
      "Adopting your pet now deserves a moment: confetti, your new companion front and centre, and a nudge to go look around Orleia.",
      "Editing a message in Noor takes the whole screen on mobile — a big field with your text on top, and one confirm drops you back into the chat.",
      "Noor replies stop cutting off mid-sentence: streams that hit the token cap continue seamlessly, and truncated actions are rescued and executed instead of apologising.",
      "Raw action JSON can never render as scrap — unmarked action blocks execute for real and show a proper confirmation.",
      "Leaked AI reasoning can no longer reach your thread: internal monologue is filtered to the hidden thinking channel, and any already-stored monologue is cleaned up when the conversation loads.",
      "\"Search my notes for …\" stays a local search instead of being hijacked to a web search.",
      "Mindfulness session controls move to the bottom on mobile, out from under the floating top bar.",
      "The theme picker wraps into a grid — Constellation no longer pokes out of the Appearance card.",
      "Onboarding polish: centred welcome flow, goals as a multi-select picker, bolder tour mockups, and a cookie banner that stays on the landing page.",
    ],
  },
  {
    version: "2.6.0",
    date: "October 2026",
    tag: "Feature",
    highlight: "Novella 5.0. Pets on duty 24/7.",
    items: [
      "One model, six efforts: Novella 5.0 replaces the old tiers. Pick Hyperfast, Low, Medium, High, Max or Ultra on a new Faster → Smarter slider — same brain, you just choose how hard it thinks.",
      "Pet agents are now always-on employees: hired pets work timed rounds while Orleia is open, keep a shift log with last-active stamps, and check in every 15 minutes even when nothing changed.",
      "Night shift: agents keep working overnight, silently — findings wait for morning instead of pinging you at 3am.",
      "Scout takes web research jobs around the clock and delivers findings notes without spending Noor messages; the Planner greets every morning with a huddle; the Wrangler sweeps overdue tasks in rounds.",
      "No more slanted text: Noor's replies render emphasis upright, and Noor is now asked to never write italics at all.",
      "The Pets tab got simpler: fewer animations, tighter copy, plain dialogs.",
      "Pets Chat in Noor: a WhatsApp-style team thread plus a private line to every employee, with @mentions to pull a specific pet into the reply.",
      "Grid retires for now: the spreadsheet tool leaves the app, global search and Noor's navigation map — Notes, Deck and Calendar carry the Office.",
      "Mobile top-bar buttons (menu, search, settings, reminders) stay pinned when the nav sheet opens instead of sliding off-screen.",
      "Hardened under the hood: every Noor request now falls through all three models instead of dead-ending, and a daily health probe checks the AI provider before you notice it.",
    ],
  },
  {
    version: "Spark 1.0",
    date: "September 2026",
    tag: "Release",
    highlight: "A browser that keeps secrets.",
    items: [
      "Orleia Spark is a standalone desktop browser built on Chromium, with a privacy stack that works before a page even loads: EasyList/EasyPrivacy-based tracker and ad blocking, third-party cookie blocking, HTTPS-only upgrades, and per-site fingerprint noise.",
      "Arc-style vertical sidebar with real tabs: pin, mute, duplicate, drag to reorder — plus private tabs that run in a separate session with their own cookies.",
      "Noor page actions: summarize the current page, list its key points, ask a question about it, or extract implied tasks — answered from the page's text, never beyond it.",
      "Send-to-Orleia: clip any text selection and it lands in your Orleia workspace as a note — or send it straight to Noor with one keystroke.",
      "Local-first like Orleia: history, bookmarks and clips live on your device only. No account, no sync server, no telemetry.",
      "First public build: the Windows installer is out now on the downloads page — macOS and Linux are coming. The web app stays exactly as it is.",
    ],
  },
  {
    version: "2.5.0",
    date: "September 17, 2026",
    tag: "Feature",
    highlight: "Noor, unlimited.",
    items: [
      "Orleia Plus, Pro and Ultra launch: optional subscriptions that raise your daily Noor message cap — 300, 1,000, or unlimited. Every tool stays free — only Noor's daily limit is raised by plans.",
      "Yearly billing with 20% off. Pay by card, Apple Pay, Google Pay or BLIK through Stripe.",
      "No accounts needed: plans are tied to your device, anonymously. Your workspace data never leaves your browser.",
      "The daily Noor cap is enforced server-side and resets at midnight — free users get 30 messages a day.",
      "New Billing tab in Settings: live usage meter, plan cards, and one-tap cancellation through the Stripe customer portal.",
      "New /pricing page with full plan details and FAQ.",
      "Legal updated: subscription terms, EU 14-day withdrawal right, and Stripe's role in the privacy policy.",
    ],
  },
  {
    version: "2.4.0",
    date: "September 16, 2026",
    tag: "Feature",
    highlight: "The OS speaks Orleia.",
    items: [
      "Your device's language is now Orleia's language — the app follows the operating system automatically and re-renders live when it changes. Missing translations fall back to English per string, so nothing is ever half-translated.",
      "The in-app language picker is gone. One source of truth, zero inconsistency.",
      "Native-feel pass: the app now draws edge-to-edge on iPhone and iPad — content flows under the status bar, floating buttons and the FAB respect the notch and home indicator, and the status bar follows the in-app theme instantly.",
      "Haptic feedback on buttons and navigation for Android devices, tuned to feel like native taps.",
      "Floating mobile buttons redesigned to a clean matte style — solid surfaces, hairline borders, springy press.",
      "Fixed the sidebar reminders bell on desktop and tablet (a rename leftover had silently disconnected it).",
      "Scrubbed the last traces of the old name from legal pages and translations.",
      "New /changelog page (you're here), linked from the landing footer.",
    ],
  },
  {
    version: "2.3.0",
    date: "September 12, 2026",
    tag: "Release",
    highlight: "The Orleia era begins.",
    items: [
      "Full rebrand from Lexis to Orleia across the entire product: app name, landing page, onboarding, policies, PWA metadata and SEO.",
      "Noor, Ethos, Logos and Verse keep their names. Everything you know stays exactly where it was — only the name changed.",
      "New domain: orleia.app for the landing, app.orleia.app for the workspace.",
      "New icon and wordmark.",
    ],
  },
  {
    version: "2.2.0",
    date: "September 2026",
    tag: "Release",
    highlight: "Web Search 2.0 and the tools that came with it.",
    items: [
      "Web Search 2.0 — deep research pipeline for Noor: planning, parallel search, page reading, and cited deliverables (reports, briefs, action items).",
      "Deck export: research results can become presentation slides.",
      "Voice mode removed in favor of a faster, more reliable Noor.",
      "Countless layout, speed and stability fixes across mobile and desktop.",
    ],
  },
  {
    version: "2.1.3",
    date: "August 2026",
    tag: "Fix",
    highlight: "Stability above all.",
    items: [
      "Noor got faster and more consistent — streaming, model behavior and context handling tightened.",
      "Image generation restored and hardened.",
      "Keyboard shortcuts, accessibility toggles (high contrast, reduced motion) and theme persistence fixed.",
    ],
  },
  {
    version: "2.0.0",
    date: "August 2026",
    tag: "Release",
    highlight: "The productivity workspace.",
    items: [
      "The full Lexis workspace: dashboard, habits, mindfulness journal, tasks, calendar, notes and Noor.",
      "Three Noor models — Ethos, Logos and Verse — with voice, image generation and workspace actions.",
      "Local-first by design: all data stays on your device.",
    ],
  },
];

const TAG_STYLES: Record<Release["tag"], string> = {
  Feature: "bg-emerald-500/10 text-emerald-500",
  Release: "bg-primary-500/10 text-primary-500",
  Fix: "bg-amber-500/10 text-amber-500",
};

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-24">
        <h1 className="text-4xl font-bold tracking-tight mb-2">Changelog</h1>
        <p className="text-sm text-muted-foreground/60 font-body mb-12">
          Every Orleia release — what shipped, what got fixed, what changed.
        </p>

        <div className="space-y-10">
          {RELEASES.map((r, idx) => (
            <article
              key={r.version}
              className={
                idx === 0
                  ? "rounded-2xl border border-border bg-card p-6 md:p-8"
                  : "border-t border-border/50 pt-8"
              }
            >
              <div className="flex flex-wrap items-center gap-3 mb-1">
                <span className="text-2xl font-bold tracking-tight">
                  {r.version}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${TAG_STYLES[r.tag]}`}
                >
                  {r.tag}
                </span>
                <span className="text-xs font-mono text-muted-foreground/40">
                  {r.date}
                </span>
              </div>
              <p className="text-sm font-medium text-foreground mb-4">
                {r.highlight}
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground/80 leading-relaxed list-disc pl-4">
                {r.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-border/50">
          <Link
            href="/"
            className="text-xs font-mono tracking-wider text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            orleia.app
          </Link>
        </div>
      </div>
    </div>
  );
}
