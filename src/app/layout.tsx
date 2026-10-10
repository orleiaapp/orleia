import type { Metadata, Viewport } from "next";
import ConsentedTelemetry from "@/components/ConsentedAnalytics";
import CookieConsent from "@/components/CookieConsent";
import "./globals.css";
// Self-hosted variable fonts (Fontsource) — served from our own origin, so
// no visitor IP is ever shared with Google Fonts (GDPR, Munich 2022 ruling).
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/fraunces/standard-italic.css";
import "@fontsource-variable/sora";
import "@fontsource-variable/jetbrains-mono";
import { ClientLayout } from "@/components/layout/ClientLayout";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.orleia.app"),
  verification: {
    // Google Search Console — domain property orleia.app (HTML-tag method)
    google: "VvjCm9LQrx48LEUVN8AEvskNl6QiDTsw8Dd7fbtYmo4",
  },
  title: "Orleia - AI Productivity Suite",
  description: "All-in-one productivity with habits, notes, journal, tasks, documents, and AI. Local-first. Private. Free.",
  keywords: ["productivity", "habits", "notes", "journal", "tasks", "AI", "local-first", "privacy", "notion alternative", "obsidian alternative", "free productivity app"],
  icons: {
    icon: [
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/icon-32.png",
  },
  openGraph: {
    title: "Orleia - AI Productivity Suite",
    description: "All-in-one productivity with habits, notes, journal, tasks, documents, and AI. Local-first. Private. Free.",
    url: "https://www.orleia.app",
    siteName: "Orleia",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "https://www.orleia.app/og.jpeg",
        width: 1200,
        height: 630,
        alt: "Orleia — Free, local-first AI productivity suite",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Orleia - AI Productivity Suite",
    description: "All-in-one productivity with habits, notes, journal, tasks, documents, and AI. Local-first. Private. Free.",
    images: ["https://www.orleia.app/og.jpeg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Orleia",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Self-hosted fonts (Fontsource) — bundled and served from our own origin.
  // No browser request ever reaches fonts.googleapis.com / fonts.gstatic.com,
  // so no visitor IP is shared with Google (GDPR: Munich court ruling on
  // Google Fonts, 2022). Same families, zero third-party calls.

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = JSON.parse(localStorage.getItem('orleia-data') || '{}');
                  var theme = saved.theme?.theme || 'dark';
                  var isDark = theme === 'dark' || theme === 'constellation' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  document.documentElement.classList.toggle('dark', isDark);
                  document.documentElement.setAttribute('data-theme-mode', theme);
                  var fontSize = saved.theme?.fontSize || 'md';
                  document.documentElement.setAttribute('data-font-size', fontSize);
                  var th = saved.theme || {};
                  document.documentElement.setAttribute('data-dyslexia', String(th.dyslexiaFriendly != null ? !!th.dyslexiaFriendly : localStorage.getItem('orleia-dyslexia') === 'true'));
                  document.documentElement.setAttribute('data-reduced-motion', String(th.reducedMotion != null ? !!th.reducedMotion : localStorage.getItem('orleia-reduced-motion') === 'true'));
                  document.documentElement.classList.toggle('high-contrast', th.highContrast != null ? !!th.highContrast : localStorage.getItem('orleia-high-contrast') === 'true');
                  document.documentElement.classList.toggle('underline-links', th.underlineLinks != null ? !!th.underlineLinks : localStorage.getItem('orleia-underline-links') === 'true');
                } catch(e) {}
              })();
            `,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "Orleia",
              "operatingSystem": "Web, Windows, macOS, Linux",
              "applicationCategory": "ProductivityApplication",
              "description": "A free, local-first AI productivity suite combining habits, notes, journal, tasks, documents, and an AI assistant. All data stays on your device.",
              "url": "https://www.orleia.app",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "featureList": [
                "Habit tracking with streaks and analytics",
                "Rich text notes with markdown",
                "Daily journaling with mood tracking",
                "Task management with priorities",
                "Document creation and management",
                "AI assistant (Noor) with multiple models",
                "Image generation",
                "Local-first — all data stays on device",
                "No sign-up required",
                "GDPR compliant",
                "Accessibility features",
                "Multi-language support (19 languages)"
              ],
              "softwareVersion": "2.7.0",
              "author": {
                "@type": "Organization",
                "name": "Orleia"
              },
              "keywords": "productivity, notes, habits, tasks, journal, AI assistant, local-first, privacy, notion alternative, obsidian alternative",
              "screenshot": "https://www.orleia.app/orleia-logo.png"
            })
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "Orleia",
              "url": "https://www.orleia.app",
              "logo": "https://www.orleia.app/orleia-logo.png",
              "description": "Orleia builds free, local-first productivity software. Our mission is to make privacy-respecting tools accessible to everyone.",
              "sameAs": [],
              "contactPoint": {
                "@type": "ContactPoint",
                "contactType": "customer support",
                "availableLanguage": "English"
              }
            })
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "name": "Orleia",
              "url": "https://www.orleia.app",
              "description": "Free, local-first AI productivity suite",
              "potentialAction": {
                "@type": "SearchAction",
                "target": "https://www.orleia.app/search?q={search_term_string}",
                "query-input": "required name=search_term_string"
              }
            })
          }}
        />
      </head>
      <body className="min-h-screen bg-background antialiased">
        <noscript>
          <div style={{ padding: "3rem 1.5rem", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
            <h1 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>Orleia needs JavaScript</h1>
            <p style={{ color: "#666", maxWidth: "32rem", margin: "0 auto" }}>
              Orleia is a local-first app: your workspace lives and runs in your browser, so JavaScript is required.
              Please enable it and reload the page.
            </p>
          </div>
        </noscript>
        {children}
        <CookieConsent />
        <ConsentedTelemetry />

      </body>
    </html>
  );
}
