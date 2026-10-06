import type { Metadata } from "next";
import {
  SeoShell,
  ComparisonTable,
  Faq,
  FaqSchema,
  Eyebrow,
} from "@/components/seo-shell";

export const metadata: Metadata = {
  title: "Local-First Productivity Apps: Your Data Stays on Your Device",
  description:
    "Local-first productivity apps store your data on your device instead of the cloud. Here's why that matters, the best local-first apps in 2026, and why ORLEIA is the free AI-powered all-in-one option.",
  alternates: { canonical: "https://www.orleia.app/local-first-productivity" },
  openGraph: {
    title: "Local-First Productivity Apps: Your Data Stays on Your Device",
    description:
      "What local-first means, why it matters, the best local-first apps in 2026 - and where ORLEIA fits in.",
    url: "https://www.orleia.app/local-first-productivity",
  },
  twitter: {
    card: "summary",
    title: "Local-First Productivity Apps: Your Data Stays on Your Device",
    description: "What local-first means, why it matters, the best local-first apps in 2026 - and where ORLEIA fits in.",
  },
};

const faqs = [
  {
    q: "What does local-first mean exactly?",
    a: "Local-first means the software you use stores its data on your own device rather than on a company's servers. Your notes, tasks, and files live on your hard drive (or, for web apps, in your browser's storage). You can open them offline, you keep working if the company disappears, and nobody else has a copy unless you choose to sync or back up somewhere.",
  },
  {
    q: "Is ORLEIA really local-first?",
    a: "Yes, completely. All of ORLEIA - notes, habits, journal entries, tasks, analytics - is stored in your browser's IndexedDB and localStorage, on your device. There are no Orleia servers, no cloud database, and no account system. The only time data leaves your device is when you use the optional AI assistant, which sends your question (with relevant context) to a model API for processing - and even then, nothing is stored or used for training.",
  },
  {
    q: "What happens to my data if I clear my browser data?",
    a: "Your ORLEIA workspace is stored in browser storage, so clearing browser data erases it. That's why ORLEIA includes one-click full export (JSON) and import: keep a backup file somewhere safe, and you can restore your entire workspace - habits, streaks, journal entries, notes, tasks - at any time.",
  },
  {
    q: "Can I use ORLEIA offline?",
    a: "Yes. Because everything is local, the entire app works offline - notes, tasks, habits, journal, analytics. The only feature that needs a connection is the optional AI assistant (Noor), which calls an external model API when you ask it something. Everything you write and track works without internet.",
  },
  {
    q: "Is the AI in ORLEIA also local?",
    a: "The AI models run on NVIDIA's NIM API, not on your device - frontier models are far too large to run in a browser. When you chat with Noor, your question and relevant context from your own data are sent temporarily for processing, like any AI chat, but they are never stored or used to train anything. You can also bring your own API key for full control.",
  },
  {
    q: "What's the catch if ORLEIA is free?",
    a: "Every tool in ORLEIA is free: habits, tasks, notes, journal, calendar and more. The only paid thing is the daily Noor AI message limit - optional Plus, Pro and Ultra plans raise it. Your data is never sold; local-first means there is no data-selling business model. The free tier includes 30 Noor messages a day, forever.",
  },
];

const comparisonRows = [
  [
    "Where data lives",
    "Company servers",
    "Your device",
    "Your device (browser)",
  ],
  ["Works offline", "Usually not", "Yes", "Yes - fully"],
  ["Account required", "Usually yes", "No", "None"],
  ["Company can read your data", "Yes", "No", "No - zero servers"],
  ["You can lose access", "If account closes or service dies", "No", "Only if you clear browser data"],
  ["Built-in AI", "Often, on your data", "Rarely", "Yes - Noor, with context"],
  ["Price", "Subscription or ads", "Often free core, paid extras", "$0 - everything included"],
  ["Backup", "Handled by vendor", "You manage files", "One-click JSON export/import"],
  ["Apps covered", "Single app", "Single app", "Habits, documents, journal, tasks, analytics"],
  ["Analytics on you", "Common", "Rare", "Zero analytics, zero cookies"],
];

export default function LocalFirstProductivityPage() {
  return (
    <SeoShell>
      <FaqSchema items={faqs} />

      {/* HERO */}
      <section className="pt-16 pb-20 md:pt-24 md:pb-28">
        <Eyebrow>LOCAL-FIRST PRODUCTIVITY</Eyebrow>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground max-w-4xl leading-[1.05]">
          Local-first productivity: your data stays yours.
        </h1>
        <p className="mt-6 text-base md:text-lg text-muted-foreground font-body leading-relaxed max-w-2xl">
          A growing movement of apps keeps your data on your device - offline,
          private, and never treated as a product. Here's what local-first
          means, why it matters, and where ORLEIA fits in.
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
            NO SIGN-UP &middot; NO SERVERS &middot; FREE
          </span>
        </div>
      </section>

      {/* WHAT LOCAL-FIRST MEANS */}
      <section className="py-20 md:py-24 border-t border-border/50">
        <Eyebrow>THE BASICS</Eyebrow>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-6">
          What does local-first mean?
        </h2>
        <p className="text-sm md:text-base text-muted-foreground/70 font-body leading-relaxed max-w-3xl">
          Local-first software stores your data on your own device instead of
          on a company's servers. You can open it offline, keep working if the
          company disappears, and nobody else holds a copy unless you
          deliberately sync or back it up. It's the opposite of the default
          cloud model, where your files live on someone else's computer and
          your access depends on their servers, their policies, and their
          subscription prices.
        </p>
      </section>

      {/* WHY IT MATTERS */}
      <section className="py-20 md:py-24 border-t border-border/50">
        <Eyebrow>WHY IT MATTERS</Eyebrow>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-6">
          Why local-first matters
        </h2>
        <p className="text-sm md:text-base text-muted-foreground/70 font-body leading-relaxed max-w-3xl mb-10">
          The cloud made collaboration easy, but it quietly traded away
          ownership: your notes live on servers you don't control, behind
          accounts that can be closed, subscriptions that can rise, and
          analytics you never agreed to. Local-first restores ownership.
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          {[
            {
              title: "Privacy by default",
              desc: "If your data never leaves your device, there's nothing to leak, sell, or subpoena. No breach at rest, no data broker in the middle.",
            },
            {
              title: "Works without internet",
              desc: "Trains, planes, dead spots - local apps keep working. Cloud apps are useless the moment your connection drops.",
            },
            {
              title: "No lock-in",
              desc: "Your data is in a format you can export and keep. If the app changes direction, you leave with everything intact.",
            },
            {
              title: "Longevity",
              desc: "Cloud services shut down and get acquired. Local files don't disappear with a company's quarterly report.",
            },
            {
              title: "No accounts, no attack surface",
              desc: "No server to hack, no password database to leak, no account to lose. Local-first shrinks the attack surface to your own device.",
            },
            {
              title: "Costs stay honest",
              desc: "When there's no infrastructure bill, apps can be free or cheap. Local-first is why ORLEIA's tools cost nothing.",
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

      {/* THE LANDSCAPE */}
      <section className="py-20 md:py-24 border-t border-border/50">
        <Eyebrow>THE LANDSCAPE</Eyebrow>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-6">
          The local-first landscape in 2026
        </h2>
        <p className="text-sm md:text-base text-muted-foreground/70 font-body leading-relaxed max-w-3xl mb-10">
          The local-first movement has real, mature tools today. Most solve one
          problem brilliantly - notes, or files, or tasks. ORLEIA's bet is that
          you want a whole workspace that's local: notes, habits, journal,
          tasks, and AI in one place.
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          {[
            {
              title: "Obsidian",
              desc: "Local Markdown knowledge base with a passionate community. AI and sync require plugins and paid services. See our Obsidian comparison.",
            },
            {
              title: "Notion",
              desc: "Incredibly flexible - but cloud-hosted and subscription-based, not local-first. See our Notion comparison.",
            },
            {
              title: "Anytype, Logseq & Joplin",
              desc: "All serious local-first note tools. Strong in their niche, but they don't combine habits, journaling, tasks, and AI in one workspace.",
            },
            {
              title: "ORLEIA",
              desc: "An all-in-one local-first workspace: notes, habits, journal, tasks, analytics - plus Noor, an AI that understands all of it. Free, no accounts, zero analytics.",
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

      {/* CLOUD VS LOCAL */}
      <section className="py-20 md:py-24 border-t border-border/50">
        <Eyebrow>THE TRADE-OFF</Eyebrow>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-4">
          Cloud vs. local-first vs. ORLEIA
        </h2>
        <p className="text-sm md:text-base text-muted-foreground/70 font-body leading-relaxed max-w-3xl mb-10">
          Cloud apps win on multi-device convenience and collaboration. Local
          apps win on ownership and privacy. ORLEIA chooses the local side -
          and adds AI and full export so you don't lose the modern features
          either.
        </p>
        <ComparisonTable
          caption="Cloud vs local-first vs ORLEIA comparison"
          headers={["Feature", "Cloud apps", "Local-first", "ORLEIA"]}
          rows={comparisonRows}
        />
      </section>

      {/* WHY ORLEIA */}
      <section className="py-20 md:py-24 border-t border-border/50">
        <Eyebrow>WHY ORLEIA</Eyebrow>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-6">
          Why ORLEIA is built local-first
        </h2>
        <p className="text-sm md:text-base text-muted-foreground/70 font-body leading-relaxed max-w-3xl mb-10">
          ORLEIA was designed around one belief: a productivity tool should
          never hold your life hostage. Everything is stored in your browser -
          habits, streaks, journal entries, notes, tasks, analytics - and a
          one-click export backs it all up. There are no servers holding your
          data, no accounts to lock you out, and no analytics collecting your
          behavior.
        </p>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: "100% on your device",
              desc: "IndexedDB and localStorage, nothing else. No Orleia servers, no cloud database, no copies anywhere else.",
            },
            {
              title: "AI that respects it",
              desc: "Noor can answer questions about your data, but your data is never stored or used for training. Bring your own API key for full control.",
            },
            {
              title: "Free because it's local",
              desc: "No infrastructure bills means every ORLEIA tool is free - local-first is why the only paid option is an optional higher daily AI limit.",
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

      {/* FAQ */}
      <section className="py-20 md:py-24 border-t border-border/50">
        <Eyebrow>QUESTIONS</Eyebrow>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-4">
          Local-first - frequently asked
        </h2>
        <p className="text-sm text-muted-foreground/60 font-body leading-relaxed max-w-2xl mb-10">
          The questions people ask most about local-first apps and ORLEIA.
        </p>
        <Faq items={faqs} />
      </section>

      {/* MORE COMPARISONS */}
      <section className="py-20 md:py-24 border-t border-border/50">
        <Eyebrow>KEEP EXPLORING</Eyebrow>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-6">
          How ORLEIA stacks up
        </h2>
        <p className="text-sm md:text-base text-muted-foreground/70 font-body leading-relaxed max-w-3xl mb-10">
          Direct comparisons with the tools you might be coming from.
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
            href="/obsidian-alternative"
            className="group p-6 border border-transparent hover:border-border transition-all duration-300"
          >
            <h3 className="font-bold tracking-tight mb-2 group-hover:text-foreground/80">
              Obsidian alternative with AI built in
            </h3>
            <p className="text-sm text-muted-foreground/60 font-body leading-relaxed">
              Local-first knowledge management with AI that works out of the
              box.
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
