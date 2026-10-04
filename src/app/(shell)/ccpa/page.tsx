import { LegalPage } from "@/components/legal-page";
import { ORLEIA_EMAIL, GMAIL_COMPOSE_HREF } from "@/lib/contact";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CCPA Compliance - Orleia",
  description: "Your California Consumer Privacy Act rights when using Orleia: what we collect (almost nothing), and how local-first design protects you.",
  alternates: { canonical: "https://www.orleia.app/ccpa" },
};

export default function CcpaPage() {
  return (
    <LegalPage
      title="CCPA & California Privacy Rights"
      subtitle="California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA) information for users in California."
      lastUpdated="October 4, 2026"
    >
      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">1. Overview</h2>
        <p>
          Orleia is designed as a local-first productivity tool. It has no servers, no accounts, and no
          databases. All data you create is stored exclusively in your browser's IndexedDB and
          localStorage on your own device. Because Orleia does not collect, sell, or share personal
          information, the obligations of the California Consumer Privacy Act (CCPA), as amended by
          the California Privacy Rights Act (CPRA), are inherently satisfied. This page explains your
          California privacy rights and how they apply to Orleia.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">2. Personal Information We Collect</h2>
        <p>
          <strong>None.</strong> Orleia does not collect any personal information from California consumers
          or anyone else. There are no advertising or cross-site tracking scripts, no tracking pixels, and no telemetry. The host (Vercel) receives basic anonymized visit metrics only, and optional sign-in (Supabase) is used to identify your session - never to sell data.
          Orleia is intended for users aged 16 and over, so no personal information relating to minors is
          collected.
          The data you enter - habits, notes, journal entries, tasks, widgets, and other workspace data - never leaves your device except
          in the limited AI-processing case described in section 5. The only other connections are standard
          CDN requests (such as loading fonts from Google Fonts), which do not involve your content.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">3. Sale or Sharing of Personal Information</h2>
        <p className="mb-3">
          <strong>Orleia does not sell or share personal information.</strong> We do not disclose personal
          information for monetary or other valuable consideration, and we do not engage in cross-context
          behavioral advertising. Accordingly, the CCPA's "Do Not Sell or Share My Personal Information"
          opt-out does not apply - there is nothing to opt out of. No link or mechanism is required because
          no sale or sharing occurs.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">4. Your California Privacy Rights</h2>
        <p className="mb-3">Under the CCPA/CPRA, you have the following rights, all of which are inherently respected:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li><strong>Right to Know</strong> - All your data is already on your device. Export it anytime via Settings.</li>
          <li><strong>Right to Delete</strong> - Clear your browser data or use the "Clear All Data" option in Settings.</li>
          <li><strong>Right to Correct</strong> - Edit or delete any data directly within the application.</li>
          <li><strong>Right to Opt-Out of Sale/Sharing</strong> - Not applicable; Orleia does not sell or share personal information (see section 3).</li>
          <li><strong>Right to Limit Use of Sensitive Personal Information</strong> - Not applicable; no sensitive personal information is collected (see section 5).</li>
          <li><strong>Right to Non-Discrimination</strong> - Orleia does not treat users differently based on exercising any privacy right.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">5. Sensitive Personal Information & AI Features</h2>
        <p className="mb-3">
          Orleia does not collect sensitive personal information, as defined by the CPRA. Your notes and
          journal entries are stored only on your device and are not transmitted to any third party unless
          you choose to send them to Noor, the built-in AI assistant (standard CDN requests such as Google
          Fonts do not involve your content):
        </p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>When you send a message to Noor, your prompt and relevant context are sent to NVIDIA's NIM API for processing</li>
          <li>This happens only on your explicit action and can be avoided entirely by not using AI features</li>
          <li>This transient processing is not a "sale" or "sharing" under the CCPA - no information is disclosed for valuable consideration or for behavioral advertising</li>
          <li>Orleia does not store this data, and we cannot control NVIDIA's internal logging (NVIDIA's own terms govern)</li>
          <li>Voice dictation uses your browser's built-in speech recognition; Orleia never receives your audio, and transcripts are handled like typed text</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">6. Data Retention & Deletion</h2>
        <p>
          Because Orleia does not store your data on any server, there is no retention period and nothing for
          us to delete. Your data remains in your browser until you remove it - via export, "Clear All Data",
          or clearing your browser storage. Requests to delete personal information are trivially satisfied:
          the data is already in your control.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">7. Contact for California Inquiries</h2>
        <p>
          For CCPA-related questions or to exercise any California privacy right, email us at{" "}
          <a href={GMAIL_COMPOSE_HREF} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-primary transition-colors">
            {ORLEIA_EMAIL}
          </a>{" "}
          (opens Gmail) or reach out via the Buy Me a Coffee page. Since Orleia collects no personal
          information, formal requests are not applicable, but we are happy to address any concerns.
        </p>
      </section>
        </LegalPage>
  );
}
