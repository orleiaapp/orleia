import { LegalPage } from "@/components/legal-page";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ximagine Beta Terms & Policies - Orleia",
  description:
    "The rules for the Ximagine public beta from Orleia - an experimental app that builds you a small personal app from a plain-language description.",
  alternates: { canonical: "https://www.orleia.app/ximagine-beta" },
};

export default function XimagineBetaPage() {
  return (
    <LegalPage
      title="Ximagine Beta Terms & Policies"
      subtitle="The rules for the Ximagine public beta - an experimental Orleia app that builds you a small personal app from a plain-language description."
      lastUpdated="October 22, 2026"
    >
      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">1. What Ximagine is</h2>
        <p>
          Ximagine is an experimental application from the Orleia project. You describe a small app in plain
          language - one tool that does exactly your job - and Ximagine writes that app and runs it on your own
          computer. It is offered as a public beta so we can learn what works. Ximagine is a separate program
          from the Orleia workspace, and it is governed by these terms in addition to our Terms of Service.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">2. Beta software - what that means</h2>
        <p className="mb-3">
          Ximagine is experimental software. In plain terms:
        </p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>It may change, misbehave, or stop working at any time, including mid-use</li>
          <li>Features, limits, and models may change or disappear without notice</li>
          <li>We do not guarantee availability, and there is no service level commitment of any kind</li>
          <li>We may limit, pause, or withdraw the beta for everyone, at any time, without notice</li>
          <li>Beta builds are provided as they are; there is no obligation to release updates or to keep older versions compatible</li>
          <li>Beta builds may not be code-signed yet, so Windows SmartScreen may warn you when installing; choosing to install anyway is your decision and your risk</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">3. Eligibility and age</h2>
        <p>
          The same age rules as Orleia apply: you must be at least 13 years old, and if you are under the age of
          digital consent in your country you may use Ximagine only with the permission and supervision of a
          parent or legal guardian who accepts these terms for you. Ximagine is not directed at, and may not be
          used by, anyone under 13.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">4. Your apps belong to you</h2>
        <p className="mb-3">
          We claim no ownership over the apps Ximagine builds for you, or over the prompts and content you create.
          They are yours. A few honest caveats:
        </p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Generated apps may include third-party and open-source code, which arrives with its own license terms - it is your responsibility to read those licenses before you use, modify, or share an app</li>
          <li>Generated code can be similar to code that exists elsewhere; we do not warrant that an app is novel or free of third-party rights</li>
          <li>If you share feedback or ideas with us, we may use them freely, without restriction or compensation</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">5. Review before you run</h2>
        <p className="mb-3">
          AI-generated code can be wrong, incomplete, insecure, or simply different from what you asked for.
          Because of that:
        </p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>You are responsible for reviewing what Ximagine generates before you run it, and for everything an app does once it runs</li>
          <li>Do not run generated apps for anything where failure could cause harm - medical, legal, financial, safety-critical, or anything that handles other people&apos;s data without a lawful basis to do so</li>
          <li>Generated apps run with the same access to your computer as any program you install - read what they do, and keep backups of anything you care about</li>
          <li>Ximagine is a productivity toy, not professional advice or a substitute for a developer reviewing code you intend to rely on</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">6. Acceptable use</h2>
        <p className="mb-3">You may not ask Ximagine to build, and may not use it to build, apps that:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Are malware of any kind - viruses, ransomware, spyware, keyloggers, credential stealers, botnets, cryptominers</li>
          <li>Infringe copyright, trademark, patent, or another person&apos;s privacy or publicity rights</li>
          <li>Facilitate fraud, phishing, scams, impersonation, or the trading of stolen data</li>
          <li>Violate applicable laws and regulations, or circumvent security, DRM, or access controls you do not own</li>
          <li>Harass, stalk, or threaten people, or target children in any way</li>
          <li>Are intended to be offered to other people as a service that harms them</li>
        </ul>
        <p className="mt-3">
          Ximagine runs on your device, so enforcement here relies on your good faith - the same as the rest of
          Orleia. Misuse of the AI features may still be rate-limited or blocked by the AI provider under its own
          terms.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">7. Data and privacy</h2>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Your description of the app you want is sent to our AI provider (NVIDIA, via its NIM API) for processing, under the same terms as Noor chats - see the Privacy Policy</li>
          <li>Generated apps run locally on your computer; Ximagine follows the same local-first rules as the rest of Orleia</li>
          <li>What a generated app does with your data is up to that app and to you - review it before you trust it with anything</li>
          <li>Orleia never receives the data your generated apps handle</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">8. No warranty</h2>
        <p>
          Ximagine is provided &quot;as is&quot; without warranty of any kind. We do not warrant that it will be
          uninterrupted, error-free, secure, or fit for any purpose, and we make no representation about the
          accuracy or reliability of what it generates. Because it is beta software, it may corrupt data or
          damage files - keep backups.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">9. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, the Orleia project shall not be liable for any damages arising
          from Ximagine or from any app it generates - including data loss, device damage, or losses resulting
          from an app doing something you did not expect. Our total liability, if any, is capped at the greater
          of what you paid for Ximagine (it is free) or 25 EUR. You use generated apps at your own risk.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">10. Responsibility for what you build</h2>
        <p>
          You are responsible for the apps you generate, run, and share. To the extent permitted by law, you agree
          to hold the Orleia project harmless from claims arising from apps you built with Ximagine, from how you
          use them, or from your misuse of Ximagine itself. If you distribute an app to other people, their
          relationship is with you, not with us.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">11. Security reports</h2>
        <p>
          If you find a vulnerability in Ximagine, please report it to orleia.workspace@gmail.com rather than
          publishing it first. Beta software will have holes; we would rather fix them than read about them.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">12. Changes and termination</h2>
        <p>
          We may update these terms at any time; the &quot;Last updated&quot; date reflects the current version,
          and continued use after a change means you accept it. We may also end the beta, or your access to it,
          at any time - it is an experiment, not a commitment.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">13. Governing law</h2>
        <p>
          These terms are governed by applicable local laws, on the same basis as the rest of Orleia. Given that
          Orleia is a non-profit tool with no commercial activity, disputes are expected to be minimal.
        </p>
      </section>
    </LegalPage>
  );
}
