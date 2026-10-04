import { LegalPage } from "@/components/legal-page";
import { ORLEIA_EMAIL, GMAIL_COMPOSE_HREF } from "@/lib/contact";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GDPR Compliance - Orleia",
  description: "Your rights under the EU General Data Protection Regulation when using Orleia, and how local-first architecture keeps us compliant.",
  alternates: { canonical: "https://www.orleia.app/gdpr" },
};

export default function GDPRPage() {
  return (
    <LegalPage
      title="GDPR & Data Processing"
      subtitle="General Data Protection Regulation compliance information for users in the European Economic Area."
      lastUpdated="October 4, 2026"
    >
      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">1. Data Controller</h2>
        <p>
          Orleia is an independent, non-profit project. As the application does not collect, store, or process
          personal data on any server, Orleia does not act as a data controller in the traditional sense. All
          data processing occurs locally on your device.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">2. Data We Collect</h2>
        <p>
          <strong>Your workspace data stays on your device.</strong> Orleia stores everything you create - habits,
          journal entries, notes, tasks, decks, and settings - exclusively in
          your browser's IndexedDB and localStorage on your device. We do not build advertising profiles. The only
          data that leaves your device is what you deliberately send: Noor prompts (to NVIDIA), search queries
          (to keyless search providers), and optional sign-in identity (to Supabase for authentication only). The
          site host (Vercel) receives standard, anonymized request metrics. Orleia is intended for users aged 16 and
          over, and we do not process personal data relating to minors.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">3. Lawful Basis for Processing</h2>
        <p>
          As we process no personal data, there is no lawful basis required. The data you create is processed
          locally by your own browser for the sole purpose of providing the application's functionality. Where you choose to use Noor’s AI features, your prompts are sent to NVIDIA’s NIM API on the basis of your consent (Article 6(1)(a) GDPR), given through the explicit act of sending a message. You can withdraw consent at any time by simply not using AI features.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">4. Your GDPR Rights</h2>
        <p className="mb-3">Under the GDPR, you have the following rights, all of which are inherently respected:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li><strong>Right to Access</strong> - All your data is already on your device. Export it anytime via Settings.</li>
          <li><strong>Right to Rectification</strong> - Edit or delete any data directly within the application.</li>
          <li><strong>Right to Erasure</strong> - Clear your browser data or use the "Clear All Data" option in Settings.</li>
          <li><strong>Right to Data Portability</strong> - Export your workspace as JSON from Settings anytime.</li>
          <li><strong>Right to Object</strong> - Stop using the application at any time. No data remains with us.</li>
          <li><strong>Rights Related to Automated Decision-Making</strong> - AI features are optional and assistive, not decision-making.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">5. International Transfers</h2>
        <p>
          No personal data is transferred internationally because no personal data leaves your device. If you use
          AI features via Noor, your prompts are sent to NVIDIA's NIM API servers which may be located outside
          the EEA. This is done with your explicit action (sending a message) and can be avoided by not using
          AI features.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">6. Data Processing Agreement (DPA)</h2>
        <p className="mb-3">
          As Orleia processes no personal data on its servers, a formal Data Processing Agreement is not required.
          For AI features via Noor, the processing is governed by NVIDIA's own terms. Optional profile information
          you provide (name, preferences, etc.) stays on your device and is not processed by us.
        </p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>NVIDIA acts as a data processor when you send prompts to Noor</li>
          <li>Prompts are handled under NVIDIA’s own API terms after processing; Orleia cannot control NVIDIA’s internal logging</li>
          <li>You can avoid this processing entirely by not using AI features</li>
          <li>All core tools (habits, journal, notes, tasks) work fully offline without AI</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">7. Contact for GDPR Inquiries</h2>
        <p>
          For GDPR-related questions, email us at{" "}
          <a href={GMAIL_COMPOSE_HREF} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-primary transition-colors">
            {ORLEIA_EMAIL}
          </a>{" "}
          (opens Gmail) or reach out via the Buy Me a Coffee page. Since we process no personal data,
          formal Data Subject Access Requests are not applicable, but we are happy to address any concerns.
        </p>
      </section>
    </LegalPage>
  );
}
