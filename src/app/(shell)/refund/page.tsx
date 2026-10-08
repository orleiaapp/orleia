import { LegalPage } from "@/components/legal-page";
import { ORLEIA_EMAIL, GMAIL_COMPOSE_HREF } from "@/lib/contact";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy - Orleia",
  description: "Refunds for Orleia subscriptions (Plus, Pro, Ultra): 14-day EU withdrawal right, cancellations, and what to do if you were charged in error.",
  alternates: { canonical: "https://www.orleia.app/refund" },
};

export default function RefundPolicyPage() {
  return (
    <LegalPage title="Refund Policy" lastUpdated="September 17, 2026">
      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">1. Summary</h2>
        <p>
          Orleia&apos;s tools are free. The only paid products are the optional Noor subscriptions — Plus, Pro and
          Ultra — which raise your daily Noor AI message limit and unlock Noor Coder (beta), whose usage is metered
          by a daily AI-token budget. While in beta, Noor
          Coder may change, be limited, or be withdrawn at any time. This policy explains cancellations and refunds
          for those subscriptions.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">2. The Free Product</h2>
        <p>
          Every core feature in Orleia — habits, tasks, notes, journal, Deck, Calendar and all Office
          tools — is provided at no cost, and the free tier of Noor (30 messages a day) is free forever. We never
          see your payment card details; subscription payments are processed by Stripe.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">3. Voluntary Donations</h2>
        <p>
          If Orleia operates a voluntary donation page (for example, a &quot;buy me a coffee&quot; link), donations are
          exactly that: voluntary, one-way, and non-refundable by nature. Donations are not payment for goods or
          services, do not unlock any feature, and do not create a contract. If you believe a donation was made in
          error, contact us within 14 days and we will review the request in good faith.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">4. Subscriptions — Cancellation and Renewal</h2>
        <p>
          Subscriptions renew automatically until cancelled. You can cancel anytime via Settings → Billing →
          Manage subscription. Cancelling stops future charges; your plan stays active until the end of the period
          you already paid for. No partial-period refunds are issued for cancellations made mid-period, unless
          required by law.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">5. EU Withdrawal Right (14 Days)</h2>
        <p>
          If you live in the European Union, you have the statutory right to withdraw from a subscription purchase
          within 14 days of the initial purchase, without giving a reason, for a full refund. To exercise it, email
          us before the 14 days end with the email address or device reference used at checkout. If you asked for
          the service to begin immediately during checkout and acknowledge losing the withdrawal right for the
          consumed portion, that portion is not refundable — the remainder is.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">6. Other Refunds</h2>
        <p>
          Billing errors, duplicate charges, or a service that was materially unavailable: contact us and we will
          make it right, including full refunds where appropriate. Refunds are issued via Stripe to the original
          payment method and typically appear within 5–10 business days.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">7. If You Were Charged Unexpectedly</h2>
        <p>
          You should never be charged for Orleia itself. If you see any charge that claims to be from Orleia, it is
          not authorized by us — treat it as suspicious, contact your payment provider, and notify us at the address
          below so we can investigate.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">8. Third-Party Purchases</h2>
        <p>
          If you obtain Orleia through an app store or another distributor in the future, that distributor&apos;s own
          refund policy applies to any transaction processed through it. This policy covers only interactions with us
          directly.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">6. Changes</h2>
        <p>
          If Orleia ever introduces paid products or plans, this policy will be updated and the change will be
          announced in the app before any payment is accepted.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">7. Contact</h2>
        <p>
          Questions about this policy? Email{" "}
          <a href={GMAIL_COMPOSE_HREF} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-primary transition-colors">
            {ORLEIA_EMAIL}
          </a>{" "}
          (opens Gmail).
        </p>
      </section>
    </LegalPage>
  );
}
