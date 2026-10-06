import type { Metadata } from "next";
import {
  SeoShell,
  ComparisonTable,
  Faq,
  FaqSchema,
  Eyebrow,
} from "@/components/seo-shell";

export const metadata: Metadata = {
  title: "The Best Notion Alternative for Privacy - ORLEIA (Local-First)",
  description:
    "Looking for a Notion alternative that respects your privacy? ORLEIA is a local-first productivity suite - tasks, habits, mindfulness, notes and built-in AI - stored entirely on your device. No cloud, no accounts.",
  alternates: { canonical: "https://www.orleia.app/notion-alternative" },
  openGraph: {
    title: "The Best Notion Alternative for Privacy - ORLEIA (Local-First)",
    description:
      "Tasks, habits, mindfulness, notes and built-in AI - stored entirely on your device. No cloud, no accounts.",
    url: "https://www.orleia.app/notion-alternative",
  },
  twitter: {
    card: "summary",
    title: "The Best Notion Alternative for Privacy - ORLEIA (Local-First)",
    description: "Tasks, habits, mindfulness, notes and built-in AI - stored entirely on your device. No cloud, no accounts.",
  },
};

const faqs = [
  {
    q: "Is ORLEIA really a good Notion alternative?",
    a: "If what you value about Notion is organizing notes and tasks in one place, then yes - ORLEIA covers those needs with notes, tasks, habits, mindfulness and analytics in one connected workspace. The trade-off is deliberate: ORLEIA trades Notion's infinite customization for simplicity, privacy and a built-in AI that understands all your data. For people who want a tool that works immediately and keeps everything on their device, ORLEIA is an upgrade in privacy - and the tools cost nothing.",
  },
  {
    q: "Can I import my Notion data into ORLEIA?",
    a: "Not yet - there is no one-click Notion importer today. However, ORLEIA supports full JSON export and import, so you can move your notes and tasks over. We recommend exporting your Notion workspace and bringing over what matters most first. A dedicated Notion import flow is on the roadmap.",
  },
  {
    q: "Is ORLEIA free?",
    a: "Every tool is free with no feature paywalls. The only optional payment is for heavier use of the built-in AI assistant: Noor includes 30 free messages a day, and Plus ($8/mo), Pro ($15/mo) or Ultra ($50/mo) raise that daily limit. Yearly plans cost about 20% less.",
  },
  {
    q: "Where is my data stored if I leave Notion for ORLEIA?",
    a: "Entirely on your device, in your browser's storage. Nothing is sent to a server for safekeeping. That means no data breaches at rest and no account required - but it also means clearing your browser data erases your workspace, so exporting regular JSON backups is recommended.",
  },
  {
    q: "Does ORLEIA work offline?",
    a: "Yes - the entire app is local-first and works offline. Tasks, habits, notes, journal entries and analytics are all available without an internet connection. The only features that need a connection are Noor conversations and research mode, which process your message in the moment. Everything you write stays on your device either way.",
  },
  {
    q: "Can I use ORLEIA on my phone?",
    a: "Absolutely. ORLEIA works in any browser on phone, tablet, laptop and desktop, and can be installed to your home screen as an app on iOS and Android - with lock-screen worthy notifications for tasks and habits. There's also a native Windows desktop app. No app-store account needed.",
  },
];

const comparisonRows = [
  [
    "Data storage",
    "Cloud servers owned by Notion",
    "100% on your device (browser storage)",
  ],
  ["Price", "From ~$10/mo for paid plans", "Free tools; optional AI plans from $8/mo"],
  ["Account required", "Yes - sign-up and login", "None - open and use"],
  ["Offline support", "Limited", "Full - everything works offline"],
  ["Built-in AI", "Paid add-on", "Yes - Noor (Fast & Core) reads your data"],
  ["Habit tracking", "Needs templates or databases", "Built-in with streaks, freezes and analytics"],
  ["Mindfulness", "Needs templates", "Built-in journal, mood tracking, breathing and meditation"],
  ["Task management", "Powerful but complex databases", "Built-in list, kanban and calendar views with recurring tasks"],
  ["Analytics", "Manual setup", "Built-in productivity score, trends and charts"],
  ["Export", "Partial - limited export options", "Full JSON export and import"],
  ["Ads & trackers", "Business analytics", "Zero ads, zero trackers"],
];

export default function NotionAlternativePage() {
  return (
    <SeoShell>
      <FaqSchema items={faqs} />

      {/* HERO */}
      <section className="pt-16 pb-20 md:pt-24 md:pb-28">
        <Eyebrow>NOTION ALTERNATIVE</Eyebrow>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground max-w-4xl leading-[1.05]">
          The Notion alternative that respects your privacy.
        </h1>
        <p className="mt-6 text-base md:text-lg text-muted-foreground font-body leading-relaxed max-w-2xl">
          ORLEIA gives you tasks, habits, mindfulness, notes and a built-in AI -
          all stored entirely on your device. No cloud, no accounts. Just a workspace
          that belongs to you.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a
            href="https://app.orleia.app"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative inline-flex items-center gap-2 bg-foreground text-background px-8 py-4 text-sm font-medium tracking-wide transition-all duration-300 hover:opacity-90 active:scale-[0.97]"
            style={{ fontFamily: "'Sora', system-ui, sans-serif" }}
          >
            <span>Try ORLEIA free</span>
            <span className="absolute inset-0 border border-foreground/20 -translate-x-1 translate-y-1 transition-transform duration-300 group-hover:translate-x-0 group-hover:translate-y-0" />
          </a>
          <span className="text-xs text-muted-foreground/40 font-mono tracking-wider">
            NO SIGN-UP &middot; WORKS IN YOUR BROWSER
          </span>
        </div>
      </section>

      {/* WHY SWITCH */}
      <section className="py-20 md:py-24 border-t border-border/50">
        <Eyebrow>THE WHY</Eyebrow>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-6">
          Why are people leaving Notion?
        </h2>
        <p className="text-sm md:text-base text-muted-foreground/70 font-body leading-relaxed max-w-3xl">
          Notion is powerful, but it is a cloud product: your data lives on
          Notion's servers, full features require a paid plan, and heavy
          databases can feel slow. A growing number of users want the same
          flexibility without surrendering their data or paying a monthly fee.
          That's exactly the gap local-first tools like ORLEIA fill.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Your data in their cloud",
              desc: "With Notion, every note you write is stored on Notion's servers. ORLEIA never sees your data - it never leaves your device.",
            },
            {
              title: "A subscription for features",
              desc: "Notion's best features sit behind a ~$10/month plan. ORLEIA's tools are free - the only paid thing is heavier use of the built-in AI.",
            },
            {
              title: "Complexity by default",
              desc: "Building a simple task list in Notion means learning databases, relations, and views. ORLEIA gives you working tools the moment you open it.",
            },
          ].map((item) => (
            <div key={item.title} className="card p-6">
              <h3 className="font-bold tracking-tight mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground/60 font-body leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* COMPARISON */}
      <section className="py-20 md:py-24 border-t border-border/50">
        <Eyebrow>HEAD TO HEAD</Eyebrow>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-4">
          Notion vs. ORLEIA
        </h2>
        <p className="text-sm md:text-base text-muted-foreground/70 font-body leading-relaxed max-w-3xl mb-10">
          The short version: Notion wins on deep customization; ORLEIA wins on
          privacy, price, and an AI that already understands your whole
          workspace. Here's the honest comparison, feature by feature.
        </p>
        <ComparisonTable
          caption="Notion vs ORLEIA comparison"
          headers={["Feature", "Notion", "ORLEIA"]}
          rows={comparisonRows}
        />
      </section>

      {/* WHAT YOU KEEP */}
      <section className="py-20 md:py-24 border-t border-border/50">
        <Eyebrow>WHAT YOU KEEP</Eyebrow>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-6">
          Everything you rely on from Notion, without the baggage
        </h2>
        <p className="text-sm md:text-base text-muted-foreground/70 font-body leading-relaxed max-w-3xl mb-10">
          You don't switch tools to lose capability. ORLEIA keeps the essentials
          of a Notion-style workspace - organized notes, structured tasks - and adds the parts Notion never had built in.
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          {[
            {
              title: "Clean notes",
              desc: "Fast, searchable notes with tags and folders - your second brain without the setup. Export everything as JSON whenever you want.",
            },
            {
              title: "Task boards, calendar & priorities",
              desc: "List, kanban and calendar views with priority levels, due dates, and recurring schedules. Built in - no database setup required.",
            },
            {
              title: "Everything connected",
              desc: "Notes reference tasks, journal entries inform habits, and analytics tie it all together. The same interconnected thinking Notion users love - automatic.",
            },
            {
              title: "Full portability",
              desc: "Export your entire workspace as JSON with one click. Your data is never locked in - it's yours, in a format you own.",
            },
          ].map((item) => (
            <div key={item.title} className="p-6 border border-transparent hover:border-border transition-all duration-300">
              <h3 className="font-bold tracking-tight mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground/60 font-body leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* WHAT YOU GAIN */}
      <section className="py-20 md:py-24 border-t border-border/50">
        <Eyebrow>WHAT YOU GAIN</Eyebrow>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-6">
          What switching to ORLEIA gives you
        </h2>
        <p className="text-sm md:text-base text-muted-foreground/70 font-body leading-relaxed max-w-3xl mb-10">
          Beyond privacy and price, ORLEIA adds a layer Notion simply doesn't
          have: an AI that lives inside your workspace and can both understand
          and act on your data.
        </p>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Built-in AI (Noor)",
              desc: "Two model tiers - Fast for instant answers, Core for deeper reasoning - plus a research mode with cited sources. Ask questions about your own data and get answers grounded in it.",
            },
            {
              title: "Habits & mindfulness",
              desc: "Streak tracking with freeze tokens, mood logging, guided breathing and meditation, and AI-generated reflection prompts - features that require manual template-building in Notion.",
            },
            {
              title: "Privacy by architecture",
              desc: "No servers holding your workspace, no accounts, no ads, no trackers. There is no business model built on your data - because your data never leaves your device.",
            },
          ].map((item) => (
            <div key={item.title} className="card p-6">
              <h3 className="font-bold tracking-tight mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground/60 font-body leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section className="py-20 md:py-24 border-t border-border/50">
        <Eyebrow>WHO IT'S FOR</Eyebrow>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-6">
          Who should make the switch?
        </h2>
        <p className="text-sm md:text-base text-muted-foreground/70 font-body leading-relaxed max-w-3xl mb-10">
          ORLEIA is a great fit if you're privacy-conscious, tired of
          subscriptions, or simply want a workspace that works from the first
          second. It's especially strong for anyone who wants AI without
          setting up integrations.
        </p>
        <ul className="max-w-2xl space-y-3">
          {[
            "Privacy-conscious users who don't want their notes on someone else's server",
            "Students and freelancers who want a serious workspace without a subscription",
            "Anyone who wants an AI assistant that already knows their notes, habits, and tasks",
            "Minimalists who found Notion's databases and plugins overwhelming",
            "Offline-first workers who need their tools to work without internet",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground/70 font-body">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      {/* FAQ */}
      <section className="py-20 md:py-24 border-t border-border/50">
        <Eyebrow>QUESTIONS</Eyebrow>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-4">
          Notion alternative - frequently asked
        </h2>
        <p className="text-sm text-muted-foreground/60 font-body leading-relaxed max-w-2xl mb-10">
          Honest answers to the questions people ask before switching from
          Notion.
        </p>
        <Faq items={faqs} />
      </section>

      {/* MORE COMPARISONS */}
      <section className="py-20 md:py-24 border-t border-border/50">
        <Eyebrow>KEEP EXPLORING</Eyebrow>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-6">
          More comparisons
        </h2>
        <p className="text-sm md:text-base text-muted-foreground/70 font-body leading-relaxed max-w-3xl mb-10">
          ORLEIA competes with more than Notion. See how it stacks up against
          other tools in the local-first and productivity space.
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <a
            href="/obsidian-alternative"
            className="group p-6 border border-transparent hover:border-border transition-all duration-300"
          >
            <h3 className="font-bold tracking-tight mb-2 group-hover:text-foreground/80">
              Obsidian alternative with AI built in
            </h3>
            <p className="text-sm text-muted-foreground/60 font-body leading-relaxed">
              Obsidian gives you a local knowledge base - but wiring up AI means
              plugins and services. ORLEIA builds the AI in from day one.
            </p>
          </a>
          <a
            href="/local-first-productivity"
            className="group p-6 border border-transparent hover:border-border transition-all duration-300"
          >
            <h3 className="font-bold tracking-tight mb-2 group-hover:text-foreground/80">
              Local-first productivity apps, explained
            </h3>
            <p className="text-sm text-muted-foreground/60 font-body leading-relaxed">
              What does local-first actually mean, why does it matter, and
              where ORLEIA fits in the movement.
            </p>
          </a>
        </div>
        <div className="mt-10 text-center">
          <a
            href="/what-is-orleia"
            className="inline-flex items-center gap-2 text-sm font-medium tracking-wide text-muted-foreground/60 hover:text-foreground transition-colors underline underline-offset-4"
          >
            New to ORLEIA? Start with: What is Orleia - the local-first AI productivity app
          </a>
        </div>
      </section>
    </SeoShell>
  );
}
