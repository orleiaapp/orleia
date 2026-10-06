import { LegalPage } from "@/components/legal-page";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Disclaimer - Orleia",
  description: "Legal disclaimer for Orleia: independent product, AI output limitations and liability.",
  alternates: { canonical: "https://www.orleia.app/disclaimer" },
};

export default function DisclaimerPage() {
  return (
    <LegalPage title="Disclaimer" lastUpdated="September 23, 2026">
      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">1. General Information</h2>
        <p>
          Orleia is a free, non-profit, local-first productivity workspace. The information and functionality
          within the application are provided for general organizational purposes only. While we strive for
          accuracy and reliability, we make no representations or warranties of any kind. Any optional personal
          information you provide (such as the "about you" profile during setup) is used solely to personalize
          the application and is stored only on your device.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">2. No Professional Advice</h2>
        <p>
          Orleia is not a substitute for professional advice, including but not limited to medical, legal, financial,
          or mental health advice. Productivity tools and AI-generated suggestions should not be relied upon as
          professional guidance. Always consult qualified professionals for advice in these areas. Wellness
          features such as breathing exercises and meditation timers are general relaxation aids, not therapy
          or treatment of any kind.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">3. AI-Generated Content</h2>
        <p className="mb-3">
          Orleia uses Noor, an AI assistant powered by third-party AI providers, to provide suggestions, analysis,
          research reports, and reflections. AI-generated content:
        </p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>May contain inaccuracies, errors, or omissions</li>
          <li>Can produce confident-sounding but fabricated information (hallucinations)</li>
          <li>Web search and research features rely on third-party search providers and may return outdated, incomplete, or inaccurate results</li>
          <li>Should not be taken as fact without verification</li>
          <li>Reflects patterns in training data, not objective truth</li>
          <li>Is provided as a productivity aid, not authoritative guidance</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">4. Data Loss</h2>
        <p>
          Orleia is local-first: all of your data is stored in your browser's IndexedDB and localStorage on your
          device. It is subject to deletion if you clear your browser data, switch devices, or use private
          browsing modes. This includes habits, mindfulness journal entries, tasks, decks, calendars,
          and all other workspace data. We strongly recommend using the built-in export feature to maintain
          regular backups. Orleia is not responsible for data loss.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">5. No Warranty</h2>
        <p>
          Orleia is provided "as is" without any warranty, express or implied. We do not guarantee that the
          application will be uninterrupted, secure, error-free, or that defects will be corrected. Use of the
          application is at your own risk.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">6. Limitation of Liability</h2>
        <p>
          To the fullest extent permitted by law, Orleia shall not be liable for any direct, indirect, incidental,
          special, consequential, or punitive damages arising from your use of the application.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">7. External Links and Services</h2>
        <p>
          Orleia may contain links to third-party websites (such as Buy Me a Coffee) and relies on third-party
          services (such as AI inference providers and search providers). We have no control over and assume no
          responsibility for the content, availability, privacy policies, or practices of these sites and services.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">8. Orleia Spark and Third-Party Websites</h2>
        <p className="mb-3">
          Orleia Spark is a general-purpose web browser. Any website you open with Spark — including sites reached
          through search results, bookmarks, or clips — is a third-party website outside our control. We make no
          representations about any content you access through Spark and accept no liability for it.
        </p>
        <p>
          Spark's tracker and ad blocking, HTTPS-only upgrades and fingerprint noise reduce certain tracking
          techniques, but no browser can guarantee complete protection, anonymity, or security. You remain
          responsible for your own safety online, for complying with the laws that apply to you, and for the terms
          of any website or service you use through Spark.
        </p>
      </section>

    </LegalPage>
  );
}
