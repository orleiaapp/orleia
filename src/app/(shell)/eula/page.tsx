import { LegalPage } from "@/components/legal-page";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "End User Licence Agreement - Orleia",
  description: "The licence terms for using Orleia - what you may do with the app, what you may not, and how the licence can end.",
  alternates: { canonical: "https://www.orleia.app/eula" },
};

export default function EulaPage() {
  return (
    <LegalPage title="End User License Agreement" lastUpdated="October 4, 2026">
      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">1. Grant of License</h2>
        <p>
          Orleia is provided as a free, non-profit application. You are granted a non-exclusive, non-transferable,
          revocable license to use the application for personal, non-commercial purposes. This license is provided
          free of charge.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">2. Ownership</h2>
        <p className="mb-3">
          The Orleia application, including its code, design, branding, and logo, is owned by the project maintainer.
          This license does not grant you any ownership rights to the application itself.
        </p>
        <p>
          Content you create within Orleia - including habits, journal entries, notes, tasks, widgets, Noor chats, and settings - remains
          your sole property. Orleia claims no ownership over your data or content.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">3. Permitted Uses</h2>
        <p className="mb-3">Under this license, you may:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Use Orleia for personal productivity and organization</li>
          <li>Access all features without payment or subscription</li>
          <li>Export and use your data outside the application</li>
          <li>Share Orleia with others (the application, not your data)</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">4. Scope — Orleia Spark</h2>
        <p className="mb-3">
          This license covers Orleia Spark, the desktop browser, on the same terms as the Orleia workspace.
          Spark is built on Chromium, which carries its own open source licenses; those licenses, not this
          agreement, govern the Chromium components themselves.
        </p>
        <p>
          Spark is a tool for accessing the internet. You use it under the same rules you would any browser:
          what you do on the web through Spark is your responsibility and subject to the laws and the terms of
          the sites you visit. Spark blocks trackers and ads by default, but no browser can promise complete
          protection — keep normal care online.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">5. Age Requirement</h2>
        <p>
          By accepting this license and using Orleia or Spark, you confirm that you are at least 13 years old.
          The applications are not directed at, and may not be used by, anyone under 13.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">6. Restrictions</h2>
        <p className="mb-3">You may not:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Sell, redistribute, or sublicense the Orleia applications</li>
          <li>Modify, decompile, or reverse-engineer the applications, except where applicable open source licenses grant that right</li>
          <li>Remove or alter any copyright or branding notices</li>
          <li>Use Orleia to provide a commercial service</li>
          <li>Claim ownership or authorship of the Orleia applications</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">7. Updates and Modifications</h2>
        <p>
          Orleia and Spark may be updated from time to time. Updates are provided at no cost. The project maintainer
          reserves the right to modify, suspend, or discontinue either application at any time without notice.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">8. Termination</h2>
        <p>
          This license is effective until terminated. It terminates automatically if you violate any terms. Upon
          termination, you must cease all use of the application. Your data remains on your device.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">9. Open Source Status</h2>
        <p>
          While Orleia is shared as an open, non-profit project, specific open source licensing terms may apply to
          the source code. The application is provided "as visible" - users are encouraged to explore, learn from,
          and contribute to the project within the bounds of applicable intellectual property laws.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">10. Governing Law</h2>
        <p>
          This EULA shall be governed by applicable local laws. Any disputes shall be resolved in the competent
          courts of the jurisdiction.
        </p>
      </section>
    </LegalPage>
  );
}
