import { LegalPage } from "@/components/legal-page";
import { ORLEIA_EMAIL, GMAIL_COMPOSE_HREF } from "@/lib/contact";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - Orleia",
  description: "How Orleia handles your data: local-first storage, no accounts required, no trackers. What leaves your device and what never does.",
  alternates: { canonical: "https://www.orleia.app/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="September 23, 2026">
      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">1. Introduction</h2>
        <p>
          Orleia is built on a fundamental belief: your data belongs to you. This Privacy Policy explains how Orleia
          handles your information. Orleia is designed as a local-first, non-profit productivity tool. We do not operate
          servers, maintain databases, or collect personal data.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">2. Data Storage & Location</h2>
        <p className="mb-3">
          <strong>Everything is local.</strong> All data you create within Orleia is stored exclusively in your browser's
          IndexedDB and localStorage. This means:
        </p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Your data never leaves your device</li>
          <li>No servers receive or store your information</li>
          <li>No accounts or cloud storage are involved</li>
          <li>Clearing your browser data will erase your Orleia workspace</li>
          <li>Exporting a backup is your responsibility (we provide the tools)</li>
        </ul>
        <p className="mt-3">
          <strong>Optional "about you" profile.</strong> During setup, Orleia may ask optional questions about you
          (name, pronouns, age range, time zone, work situation, interests, schedule, preferences, and goals). Every
          field can be skipped. This profile is stored only on your device in the same local storage as the rest of
          your workspace, is never uploaded or shared, and is only ever sent to a third party if you explicitly
          include it in a message to Noor.
        </p>
        <p className="mt-3">
          <strong>Orleia Spark (the browser).</strong> Spark applies the same architecture to your browsing. Your
          browsing history, bookmarks and clips are stored only on your device, in Spark's own profile folder — never
          on an Orleia server. Spark collects no telemetry, has no account, and phones home for nothing. The tracker
          and ad blocker, third-party cookie blocking and HTTPS-only upgrades are engine mechanics, not data
          collection — blocked requests are counted locally as a number and the count never leaves your device.
        </p>
        <p className="mt-3">
          <strong>What leaves your device when you use Spark:</strong> only the same things any browser must send —
          your requests to the websites you visit (through your chosen search engine when you search), and, if you
          use a Noor page action, the sanitized text of the page you are reading sent to NVIDIA under the same terms
          as section 4. Spark's requests to Orleia's API carry a random per-install device identifier so Noor's
          daily-cap counting works; it is not linked to any identity and stores nothing about you. Websites you
          visit see your IP address and standard browser headers, exactly as with any browser — Spark's fingerprint
          noise makes that data less identifying, not more.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">3. Optional Password Protection</h2>
        <p className="mb-3">
          Orleia offers an <strong>optional</strong> local password feature. This is entirely optional - you can use
          the full app without setting one. If you choose to set a password:
        </p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>The password is stored only on your device in localStorage</li>
          <li>It is never sent to any server or third party</li>
          <li>It cannot be recovered if lost - only your data can be preserved by resetting it</li>
          <li>It acts as a simple lock, not an account system</li>
          <li>You can reset it at any time from the lock screen</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">4. Noor AI & NVIDIA NIM</h2>
        <p className="mb-3">
          Orleia integrates with NVIDIA’s NIM API to power Noor, its built-in AI assistant. Noor runs on a single model — Novella 5.0 — with six effort levels (Hyperfast, Low, Medium, High, Max, Ultra) that control how deeply it reasons. When you use Noor:
        </p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Your prompts and relevant context are sent to NVIDIA’s NIM API for processing</li>
          <li>If you filled in the optional "about you" profile during setup, it is included in that context so Noor can personalize its help (for example, using your name, time zone, or goals). It is never shared with anyone else, and you can leave it empty</li>
          <li>This data is transmitted to NVIDIA for processing and is handled under NVIDIA’s API terms; Orleia does not store it, but we cannot control NVIDIA’s internal logging</li>
          <li>You can bring your own API key for full control</li>
          <li>AI features are optional - all core tools work without them</li>
        </ul>
        <p className="mt-3">
          Noor Coder (beta) adds two things on top of this. First, when web research runs — either because you
          switched the Web toggle on or your question needs live facts — only an excerpt of your prompt (up to
          300 characters) is sent as a search query to the keyless search providers listed in section 8; no
          workspace data is included. Second, when you apply a Coder proposal, your browser writes the selected
          files and folders directly into a folder you choose on your own device, and those files never pass
          through Orleia — the app only keeps a local handle to that folder. To enforce plan limits, Orleia stores
          a per-device daily counter of AI tokens (numbers only, never your content).
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">5. Voice Input & Speech Recognition</h2>
        <p className="mb-3">
          Voice dictation in Noor lets you speak to your assistant. When you use the microphone, your speech is
          transcribed to text by your own browser's built-in speech recognition engine. Depending on your browser,
          that engine may process audio on your device or pass it to the browser vendor's speech service (for
          example Chrome uses Google's speech service) under that vendor's terms. Orleia never receives your audio.
        </p>
        <p className="mb-3">
          The transcribed text is handled exactly like text you type -
          it stays on your device and is only sent to NVIDIA's NIM API when you choose to send it
          as a message to Noor (see section 4). You can revoke microphone access at any time through your browser's
          site permissions.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">6. Analytics & Tracking</h2>
        <p>
          Orleia uses no advertising or cross-site tracking of any kind. On your first visit we ask for your consent
          before loading any analytics: our optional analytics counter (Vercel Analytics — aggregate page views,
          approximate region, browser family, not linked to your identity or your workspace content) is loaded
          only if you click "Accept" in the consent banner. If you click "Reject" — or ignore the banner — no
          analytics load at all, and nothing about Orleia's functionality changes. Your workspace content never
          reaches us either way: your habits, tasks, notes, journal and documents live in your browser. There are
          no embedded third-party ad scripts, no tracking pixels, and no fingerprinting.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">7. Payments</h2>
        <p>
          Optional Noor subscriptions are processed by Stripe Payments Europe Ltd. If you subscribe, Stripe receives
          your payment details directly and processes them under its own privacy policy; we only receive a payment
          confirmation and an anonymous device reference — never your card number or billing address. Orleia
          accounts do not exist: subscriptions are tied to an anonymous device identifier generated locally in your
          browser and containing no personal data.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">8. Third-Party Services</h2>
        <p className="mb-3">
          Orleia itself has no third-party dependencies that process your personal data. The only external service
          integrations are:
        </p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li><strong>NVIDIA NIM API</strong> - Powers Noor's AI features (optional), including chat (Nemotron models), image generation (FLUX.1-dev), and image understanding (Llama 3.2 Vision). When you use Noor, your prompts and relevant context are processed by NVIDIA. See section 4 for details.</li>
          <li><strong>Web search engines</strong> - When you ask Noor to search the web, only your search query is sent to keyless search providers (DuckDuckGo, Mojeek, Wikipedia, Bing RSS, Google News RSS) to fetch results. No workspace data is included. The same applies to Noor Coder's web research (see section 4).</li>
          <li><strong>Vercel</strong> - Hosts the application and provides aggregate, anonymized visit metrics. See section 6.</li>
          <li><strong>Push reminder store (Vercel Blob)</strong> - If you enable reminders while the app is closed, Orleia stores the minimal data needed to deliver them: a push subscription endpoint, your device identifier, and the upcoming reminder times with their titles. This store contains no workspace content, is overwritten on every schedule sync, and expires after delivery. Deleting the app data or disabling notifications removes it.</li>
          <li><strong>Web push services</strong> - Delivering a push notification involves your browser vendor's push service (e.g. Mozillaautopush for Firefox, Apple's APNs for Safari, Google's FCM for Chrome). Only the encrypted notification payload and your subscription endpoint pass through them; they cannot read your data.</li>
          <li><strong>Supabase</strong> - Used only for optional sign-in (Google, Apple, GitHub, Microsoft) and only to identify your session. Your workspace data is not stored in Supabase and sync between devices happens peer-to-peer directly between your devices.</li>
          <li><strong>Google Fonts</strong> - Loaded from the Google Fonts CDN for typography.</li>
          <li><strong>Google STUN</strong> - When you use device-to-device sync, public Google STUN servers help your devices find each other; only connection metadata passes through, never your data.</li>
        </ul>
        <p className="mt-4">
          <strong>How Orleia's API layer is protected.</strong> Orleia's server endpoints only exist to relay your own
          requests to the AI providers listed above. They enforce: an origin allowlist (requests are accepted only from
          Orleia's own domains — scripts and other sites are rejected), per-IP rate limits and daily caps on every
          endpoint, and strict payload-size limits. The endpoints never see, store, or forward your workspace data —
          the local-first architecture means your notes, tasks and files are only ever in your browser and are never
          uploaded to Orleia's servers. There are no user accounts or login tokens to protect: there is nothing to
          leak, because nothing about you is stored server-side.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">9. Data Export & Deletion</h2>
        <p>
          Since we don't store your data, there's nothing for us to delete. You can export your entire workspace as
          JSON from the Settings page, or clear your browser data to remove everything. Individual notes can be
          exported as .docx files.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">10. Children's Privacy</h2>
        <p className="mb-3">
          Orleia is intended for users aged <strong>13 and older</strong>. During setup, Orleia asks you to confirm you
          are 13 or older, and you may not use Orleia if you are under 13.
        </p>
        <p>
          We do not knowingly collect any personal information from children or minors. Because all data is stored on
          your own device and never sent to us, Orleia has no mechanism to receive or process children's data.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-foreground mb-3">11. Contact</h2>
        <p>
          For privacy-related questions, email us at{" "}
          <a href={GMAIL_COMPOSE_HREF} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-primary transition-colors">
            {ORLEIA_EMAIL}
          </a>{" "}
          (opens Gmail), reach out via the Buy Me a Coffee page, or open an issue on our GitHub repository.
        </p>
      </section>
        </LegalPage>
  );
}
