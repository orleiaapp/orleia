import type { Metadata } from "next";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { PAID_PLANS, NOOR_DAILY_LIMIT, fmtPrice } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Pricing — Orleia",
  description:
    "Orleia Free includes 30 Noor messages a day and every local tool. Upgrade to Plus, Pro or Ultra for more Noor. Monthly or yearly (20% off). Cancel anytime.",
  alternates: { canonical: "/pricing" },
};

const FREE_PERKS = [
  "Every tool: habits, tasks, notes, journal, calendar, deck…",
  `${NOOR_DAILY_LIMIT.free} Noor AI messages every day`,
  "Local-first: your data stays on your device",
  "Free to start — no account required",
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <Link
          href="/"
          className="group inline-flex items-center gap-1.5 text-xs font-mono tracking-wider text-muted-foreground/50 hover:text-muted-foreground transition-colors mb-12"
        >
          ← orleia.app
        </Link>

        <div className="text-center mb-14">
          <h1 className="text-4xl font-bold tracking-tight mb-3">Simple pricing. Serious Noor.</h1>
          <p className="text-sm text-muted-foreground/70 max-w-xl mx-auto">
            Every Orleia tool is free. Paid plans only raise how much you can talk to Noor — your AI that actually runs your workspace.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {/* Free */}
          <div className="rounded-2xl border border-border/60 p-6 flex flex-col">
            <p className="text-sm font-bold mb-1">Free</p>
            <p className="text-2xl font-bold mb-4">$0</p>
            <ul className="space-y-2.5 flex-1 mb-6">
              {FREE_PERKS.map((perk) => (
                <li key={perk} className="flex items-start gap-2 text-xs text-muted-foreground/80">
                  <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
                  {perk}
                </li>
              ))}
            </ul>
            <Link
              href="https://app.orleia.app"
              className="rounded-xl border border-border py-2.5 text-center text-sm font-medium transition-colors hover:border-foreground/50"
            >
              Start free
            </Link>
          </div>

          {/* Paid */}
          {PAID_PLANS.map((plan) => (
            <div
              key={plan.tier}
              className="rounded-2xl border border-border/60 p-6 flex flex-col relative"
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-background">
                  Most popular
                </span>
              )}
              <p className="text-sm font-bold mb-1">{plan.name}</p>
              <p className="mb-1">
                <span className="text-2xl font-bold">{fmtPrice(plan.monthly)}</span>
                <span className="text-xs text-muted-foreground/60">/mo</span>
              </p>
              <p className="text-[11px] text-muted-foreground/60 mb-4">
                or {fmtPrice(plan.yearly)}/yr — 20% off
              </p>
              <ul className="space-y-2.5 flex-1 mb-6">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-xs text-muted-foreground/80">
                    <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
                    {perk}
                  </li>
                ))}
              </ul>
              <Link
                href="https://app.orleia.app/settings"
                className="rounded-xl border border-border py-2.5 text-center text-sm font-medium transition-colors hover:border-foreground/50"
              >
                Get {plan.name}
              </Link>
            </div>
          ))}
        </div>

        {/* Data-use disclosure - EU consumer-law friendly */}
        <p className="mt-10 text-center text-[11px] text-muted-foreground/60 max-w-xl mx-auto leading-relaxed">
          Subscriptions are per device — Orleia is local-first and anonymous, so your plan is
          tied to your device ID, never an account. Payments are processed by Stripe; we never
          see your card details. Your workspace content stays in your browser and is never
          sent to us. See our{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</Link>,{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">Terms</Link> and{" "}
          <Link href="/refund" className="underline underline-offset-2 hover:text-foreground">Refund Policy</Link>.
        </p>

        {/* FAQ */}
        <div className="mt-20 max-w-2xl mx-auto space-y-6">
          <h2 className="text-xl font-bold text-center">Questions</h2>
          {[
            {
              q: "What counts as a Noor message?",
              a: "Any message you send Noor that needs an AI reply. Everyday quick actions he handles locally don't use your cap.",
            },
            {
              q: "What happens when I hit the cap?",
              a: "Noor tells you, and your cap resets at midnight. Nothing is deleted, nothing breaks — you just wait or upgrade.",
            },
            {
              q: "Can I cancel anytime?",
              a: "Yes. Manage or cancel from Settings → Billing → Manage subscription. You keep your plan until the end of the period you paid for.",
            },
            {
              q: "Do I need an account?",
              a: "No. Orleia is local-first and anonymous — your plan is tied to your device, not an email.",
            },
            {
              q: "What payment methods work?",
              a: "Cards, Apple Pay, Google Pay and BLIK — handled securely by Stripe. Orleia never sees your card details.",
            },
          ].map((item) => (
            <div key={item.q} className="rounded-xl border border-border/50 p-4">
              <p className="text-sm font-semibold mb-1.5 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {item.q}
              </p>
              <p className="text-xs text-muted-foreground/70 leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
