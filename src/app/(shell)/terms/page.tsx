import { LegalPage } from "@/components/legal-page";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - Orleia",
  description: "The terms that govern your use of Orleia - the free, local-first productivity workspace for tasks, habits, notes and AI assistance.",
  alternates: { canonical: "https://www.orleia.app/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" lastUpdated="October 4, 2026">
      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">1. Acceptance of Terms</h2>
        <p>
          By using Orleia, you agree to these Terms of Service. If you do not agree, do not use the application.
          Orleia is provided as a free, non-profit productivity tool. By using Orleia, you confirm that you are at least 13 years old. Orleia is not directed at, and may not be used by, anyone under 13.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">2. Description of Service</h2>
        <p className="mb-3">
          The Orleia project provides two applications: the Orleia workspace (a browser-based productivity suite with
          tools for habits tracking, mindfulness journaling, note-taking, task management, and
          AI-powered assistance) and Orleia Spark, a desktop web browser. Key characteristics:
        </p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>All workspace data, and all Spark browsing data (history, bookmarks, clips), is stored locally on your device</li>
          <li>Your data is not stored on any Orleia server; optional sign-in identifies your session only</li>
          <li>The workspace is client-side; AI, search, and image features call external APIs from our server</li>
          <li>AI features are optional and use NVIDIA's NIM API</li>
          <li>Spark is built on Chromium and provided free of charge, with tracker blocking on by default</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">3. Optional Password</h2>
        <p className="mb-3">
          Orleia offers an optional local password feature. This is not an account system - the password is stored
          only on your device. You are responsible for:
        </p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Remembering your password (it cannot be recovered by us)</li>
          <li>Understanding that resetting the password does not delete your data</li>
          <li>Recognizing that this is a device-level lock, not a secure authentication system</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">4. Data Collection</h2>
        <p>
          Orleia does not sell, rent, or share your data - and cannot read your workspace content, which never
          leaves your device except when you deliberately use AI or search features (see the Privacy Policy).
          The site host receives basic anonymized visit metrics, and optional sign-in (Supabase) identifies your
          session only. There is no advertising of any kind.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">5. Optional Profile Information</h2>
        <p className="mb-3">
          During setup, Orleia may ask you for optional "about you" information - such as your name, pronouns, age
          range, time zone, work situation, interests, schedule, preferences, and goals. All of this information is
          <strong> entirely optional</strong> and can be skipped.
        </p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>It is stored only on your device, alongside the rest of your workspace data</li>
          <li>It is never uploaded, sold, or shared with any third party</li>
          <li>It is shared with Noor, Orleia's built-in AI assistant, so it can personalize its help; when you chat with Noor, your profile is sent to Noor's AI provider (NVIDIA) alongside your message for processing, under the same terms as your other chat content (see the Privacy Policy)</li>
          <li>You can leave every field empty and still use all of Orleia</li>
          <li>You can review or change this information at any time during setup or by clearing your browser data</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">6. User Responsibilities</h2>
        <p className="mb-3">You are responsible for:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Maintaining backups of your data via the export feature</li>
          <li>Your own API key if you choose to use one for AI features</li>
          <li>Understanding that clearing browser data will delete your workspace</li>
          <li>Using the AI features responsibly and in accordance with NVIDIA's terms</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">7. Intellectual Property</h2>
        <p>
          The Orleia name, logo, and application code are provided as an open, non-profit project. The content you
          create within Orleia is entirely your own. We claim no ownership over your data or content.
        </p>
        <p className="mt-3">
          <strong>Affiliation disclaimer.</strong> Orleia is an independent, non-profit project, built and
          maintained by its community. It is not affiliated with, sponsored by, or endorsed by any other
          company or product of a similar name.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">8. Eligibility and Age</h2>
        <p>
          You must be at least 13 years old to use Orleia. If you are under the age of digital consent in your
          country (for example, 16 in most EU member states), you may use Orleia only with the permission and
          supervision of a parent or legal guardian, who accepts these Terms on your behalf. Because Orleia is a
          free service, the UK ICO "information society services" exception applies: consent for optional
          processing (such as AI features) may be given by a child who is at least 13. Orleia does not knowingly
          collect personal data directly from children under 13; workspaces are stored on the user's own device.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">9. Third-Party Services</h2>
        <p className="mb-3">Orleia integrates with the following third-party services:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li><strong>NVIDIA NIM API</strong> - Provides Noor's AI model access. Subject to NVIDIA's own terms.</li>
          <li><strong>Web search</strong> - When you ask Noor to search the web, your query is sent to a third-party search provider (Bing) to fetch results. No workspace data is included.</li>
          <li><strong>Google Fonts</strong> - Provides typography. Subject to Google's privacy policy.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">10. Disclaimer of Warranties</h2>
        <p>
          Orleia is provided "as is" without warranty of any kind. We do not guarantee uninterrupted service or
          that your data will be preserved. Please maintain regular backups.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">11. Subscriptions and Billing</h2>
        <p>
          Orleia's core tools are free of charge. Optional paid subscriptions (Plus, Pro, Ultra) raise the daily
          limit of Noor AI messages and unlock Noor Coder (beta) — a coding mode still in beta that may change,
          be limited, or be withdrawn while in beta. Paid plans also include a daily Noor Coder budget measured in
          AI tokens (not messages), which resets daily at midnight (UTC) and scales with the effort level you
          choose. When you apply a Coder proposal, the proposed files and folders are created directly on your
          device, inside a folder you select — Orleia never uploads your workspace files. You are responsible for
          reviewing what is written to your device and for any command you choose to run yourself. Billing is
          handled by Stripe Payments Europe Ltd.; we never see or store your
          payment card details.
        </p>
        <p>
          Subscriptions renew automatically at the end of each billing period (monthly or yearly) unless cancelled
          before the renewal date. You can cancel at any time via Settings → Billing → Manage subscription, or by
          contacting us; access continues until the end of the period already paid for. Prices are shown inclusive
          of applicable taxes where required. Statutory consumer rights, including EU withdrawal rights, are
          described in our Refund Policy.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">12. Limitation of Liability</h2>
        <p>
          In no event shall Orleia be liable for any damages arising from use of the application, including data loss.
          Since all data is stored locally, data loss can only occur due to browser actions on your end.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">13. Changes to Terms</h2>
        <p>
          We reserve the right to update these terms. Continued use after changes constitutes acceptance. The
          "Last updated" date reflects the most recent revision.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">14. Governing Law</h2>
        <p>
          These terms shall be governed by applicable local laws. Given that Orleia is a non-profit tool with no
          commercial activity, disputes are expected to be minimal.
        </p>
      </section>
    </LegalPage>
  );
}
