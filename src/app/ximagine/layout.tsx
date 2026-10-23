import type { Metadata, Viewport } from "next";

// The Ximagine web app lives here. It is unlisted (noindex + robots
// disallow) because the beta is distributed through the desktop
// installer, not advertised as a web destination.

export const metadata: Metadata = {
  title: "Ximagine (Beta) - Orleia",
  description:
    "Describe one small app in plain language; Ximagine plans it, builds it, and hands you the code. Runs only on your device.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#050508",
};

export default function XimagineLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
