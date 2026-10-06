import type { Metadata } from "next";
import {
  SeoShell,
  ComparisonTable,
  Faq,
  FaqSchema,
  Eyebrow,
} from "@/components/seo-shell";

export const metadata: Metadata = {
  title: "The Best Obsidian Alternative with AI Built In - ORLEIA",
  description:
    "Want Obsidian-style local note-taking with AI that actually works out of the box? ORLEIA is a local-first workspace with tasks, habits, mindfulness, notes and built-in AI - no plugins, no sync services.",
  alternates: { canonical: "https://www.orleia.app/obsidian-alternative" },
  openGraph: {
    title: "The Best Obsidian Alternative with AI Built In - ORLEIA",
    description:
      "Local-first tasks, habits, mindfulness and notes with AI built in. No plugins to manage, no sync service required.",
    url: "https://www.orleia.app/obsidian-alternative",
  },
  twitter: {
    card: "summary",
    title: "The Best Obsidian Alternative with AI Built In - ORLEIA",
    description: "Local-first tasks, habits, mindfulness and notes with AI built in. No plugins to manage, no sync service required.",
  },
};

const faqs = [
  {
    q: "Is ORLEIA really an Obsidian alternative?",
    a: "Yes, for most people. Obsidian is a powerful local-first knowledge base, but its core value comes from plugins and community setups - and AI integration especially requires significant tinkering. ORLEIA is local-first in the same spirit, but it ships tasks, habits, mindfulness, notes, and a built-in AI assistant that already understands all of your data. If your Obsidian workflow is mostly collecting notes and connecting ideas, ORLEIA covers it with far less setup.",
  },
  {
    q: "Does ORLEIA support Markdown like Obsidian?",
    a: "ORLEIA uses a rich editor rather than raw Markdown files. You can bring text content over from Obsidian, and your whole workspace can be exported as JSON at any time. The trade-off: ORLEIA is more polished out of the box, but it doesn't give you direct access to a folder of .md files like Obsidian does.",
  },
  {
    q: "Is my data stored locally like Obsidian?",
    a: "Yes. Like Obsidian, ORLEIA is local-first: everything lives in your browser's storage, on your device. No servers, no cloud storage, no accounts. The practical difference is that Obsidian keeps plain Markdown files on your disk, while ORLEIA keeps structured data in your browser - with full JSON export/import for backups and migration.",
  },
  {
    q: "How does the AI work in ORLEIA?",
    a: "Noor, the built-in assistant, has two model tiers: Fast for instant answers and Core for deeper reasoning, plus a research mode that browses the web and returns cited sources. When you ask something, relevant context from your notes, habits, tasks, and journal can be included. Your data is sent temporarily for processing - just like any AI chat - but it is never used for advertising or model training.",
  },
  {
    q: "Do I need plugins to make ORLEIA useful?",
    a: "No. That's the point. Everything is included: note editor, task board, habit streaks with freeze tokens, journal with mood tracking, breathing and meditation, analytics, and AI. There are no plugins to install, no compatibility worries, and nothing to maintain when ORLEIA updates.",
  },
  {
    q: "Is ORLEIA free?",
    a: "Every tool is free and included. The built-in AI gives 30 free messages a day; optional Plus ($8/mo), Pro ($15/mo) and Ultra ($50/mo) plans raise that daily limit if you need more. Everything else is available without paying anything.",
  },
];

const comparisonRows = [
  [
    "AI integration",
    "Requires plugins, APIs and setup",
    "Built in - Noor (Fast & Core, research mode)",
  ],
  ["Data storage",
    "Local Markdown files on disk",
    "Local - in your browser",
  ],
  ["Price", "Free core; paid sync, paid add-ons, AI costs extra", "Free tools; optional AI plans from $8/mo"],
  ["Setup time", "Hours of plugin research and config", "Works the moment you open it"],
  ["Learning curve", "Steep - plugins, vaults, sync, graph", "Gentle - familiar tools, one workspace"],
  ["Notes", "Markdown with bidirectional links", "Fast searchable notes with global search"],
  ["Habits & mindfulness", "Community plugins", "Built in - streaks, freeze tokens, moods, breathing, meditation"],
  ["Tasks", "Plugins and manual systems", "Built-in list, kanban and calendar views"],
  ["Reminders & notifications", "Plugin-dependent", "Built-in push notifications that fire even when the app is closed"],
  ["Analytics", "None built in", "Productivity score, trends, charts"],
  ["Sync", "Paid service or manual setup", "Local-first; full JSON export/import for backup"],
];

export default function ObsidianAlternativePage() {
  return (
    <SeoShell>
      <FaqSchema items={faqs} />

      {/* HERO */}
      <section className="pt-16 pb-20 md:pt-24 md:pb-28">
        <Eyebrow>OBSIDIAN ALTERNATIVE</Eyebrow>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground max-w-4xl leading-[1.05]">
          The Obsidian alternative with AI built in - no plugins required.
        </h1>
        <p className="mt-6 text-base md:text-lg text-muted-foreground font-body leading-relaxed max-w-2xl">
          Obsidian proved that local-first knowledge management works. ORLEIA
          takes that idea further: tasks, habits, mindfulness, notes, and an AI
          assistant that already understands everything - out of the
          box, with the tools free.
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
            NO SIGN-UP &middot; LOCAL-FIRST &middot; AI INCLUDED
          </span>
        </div>
      </section>

      {/* WHY AI MATTERS */}
      <section className="py-20 md:py-24 border-t border-border/50">
        <Eyebrow>THE GAP</Eyebrow>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-6">
          Why Obsidian users keep looking for AI
        </h2>
        <p className="text-sm md:text-base text-muted-foreground/70 font-body leading-relaxed max-w-3xl">
          Obsidian's power is a local knowledge base built on Markdown and
          links. Its weakness is that AI isn't part of that world: connecting
          an assistant usually means installing plugins, paying for sync,
          configuring APIs, and maintaining it all. People want the benefits
          of a local, connected knowledge system and an AI that can actually
          use it - without a weekend of setup.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              title: "AI is an afterthought",
              desc: "In Obsidian, AI lives in plugins and external services. In ORLEIA, Noor is the center of the workspace - it reads your notes, habits, journal, and tasks.",
            },
            {
              title: "Setup tax",
              desc: "Every plugin is a version to update, a conflict to resolve, a workflow to relearn. ORLEIA ships one integrated system that just works.",
            },
            {
              title: "Cost creeps in",
              desc: "Sync, publishing, and AI add-ons stack up fast. ORLEIA's tools are free - and the optional AI plans cost less than most single Obsidian add-ons.",
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
          Obsidian vs. ORLEIA
        </h2>
        <p className="text-sm md:text-base text-muted-foreground/70 font-body leading-relaxed max-w-3xl mb-10">
          Obsidian is the gold standard for raw local note files and
          power-user customization. ORLEIA trades that flexibility for an
          integrated, AI-native experience. Here's the honest breakdown.
        </p>
        <ComparisonTable
          caption="Obsidian vs ORLEIA comparison"
          headers={["Feature", "Obsidian", "ORLEIA"]}
          rows={comparisonRows}
        />
      </section>

      {/* CONNECTED KNOWLEDGE */}
      <section className="py-20 md:py-24 border-t border-border/50">
        <Eyebrow>CONNECTED KNOWLEDGE</Eyebrow>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-6">
          The connected second brain, without the manual work
        </h2>
        <p className="text-sm md:text-base text-muted-foreground/70 font-body leading-relaxed max-w-3xl mb-10">
          Obsidian's graph only exists because you build the links by hand.
          ORLEIA connects your data automatically: journal entries inform habit
          insights, notes cross-reference tasks, and analytics tie everything
          together. The connections are there from day one - and Noor can
          navigate them for you.
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          {[
            {
              title: "Notes that know your context",
              desc: "Write a note and related habits, tasks, and journal entries are already part of the picture. No #tags to maintain, no links to chase.",
            },
            {
              title: "Ask questions about your data",
              desc: "\"Why have I been tired lately?\" Noor reads your journal, sleep-related habits, and task load to give you an answer grounded in your actual life.",
            },
            {
              title: "Habits and mindfulness as first-class citizens",
              desc: "In Obsidian these need plugins and templates. In ORLEIA they're core modules with streaks, freeze tokens, moods, and guided breathing.",
            },
            {
              title: "Everything exportable",
              desc: "Full JSON export/import of your entire workspace. Your knowledge is never locked in - it's portable and yours.",
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

      {/* LOCAL-FIRST SPIRIT */}
      <section className="py-20 md:py-24 border-t border-border/50">
        <Eyebrow>THE SAME SPIRIT</Eyebrow>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-6">
          Your data stays yours - that part never changes
        </h2>
        <p className="text-sm md:text-base text-muted-foreground/70 font-body leading-relaxed max-w-3xl">
          The thing Obsidian got right - and the reason its users are so loyal
          - is local ownership of data. ORLEIA shares that conviction
          completely. Everything lives on your device. There are no servers
          holding copies of your notes, no accounts that can be locked, no
          analytics collecting what you write. Local-first isn't a feature of
          ORLEIA; it's the architecture.
        </p>
      </section>

      {/* WHO IT'S FOR */}
      <section className="py-20 md:py-24 border-t border-border/50">
        <Eyebrow>WHO IT'S FOR</Eyebrow>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-6">
          Who should consider switching from Obsidian?
        </h2>
        <p className="text-sm md:text-base text-muted-foreground/70 font-body leading-relaxed max-w-3xl mb-10">
          If you've spent more time configuring Obsidian than using it - or
          you want AI on your knowledge without the plugin maze - ORLEIA is
          worth a look.
        </p>
        <ul className="max-w-2xl space-y-3">
          {[
            "People who want AI over their notes without setting up plugins and APIs",
            "Obsidian users tired of maintaining plugin configurations",
            "Anyone who wants habits, mindfulness, and tasks in the same local-first home as their notes",
            "Knowledge workers who want insights, not just storage",
            "Users who want push notifications and reminders without a sync subscription",
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
          Obsidian alternative - frequently asked
        </h2>
        <p className="text-sm text-muted-foreground/60 font-body leading-relaxed max-w-2xl mb-10">
          Honest answers for Obsidian users evaluating ORLEIA.
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
          See how ORLEIA compares to other tools in the productivity and
          local-first space.
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <a
            href="/notion-alternative"
            className="group p-6 border border-transparent hover:border-border transition-all duration-300"
          >
            <h3 className="font-bold tracking-tight mb-2 group-hover:text-foreground/80">
              Notion alternative that's private and free
            </h3>
            <p className="text-sm text-muted-foreground/60 font-body leading-relaxed">
              Notion's flexibility without the cloud, the subscription, or the
              complexity.
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
              What local-first means, why it matters, and where ORLEIA fits in
              the movement.
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
