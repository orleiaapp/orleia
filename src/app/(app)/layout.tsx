import type { Metadata } from "next";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { BootSplash } from "@/components/layout/BootSplash";

export const metadata: Metadata = {
  title: {
    default: "Orleia — Local-first AI productivity",
    template: "%s | Orleia",
  },
};

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Constellation theme: a static CSS-painted sky, part of the server
          HTML so it is on screen in the FIRST frame of any load — the live
          canvas (ThemeBackdrop) layers on top once React mounts. This closes
          the pre-hydration gap where the starfield only existed after JS
          loaded (a visible delay whenever the tab was reloaded/discarded). */}
      <div aria-hidden className="theme-sky" />
      {/* Pre-hydration cover: paints the wordmark while the bundle downloads,
          hands off to SplashScreen via orleia:splash-ready. */}
      <BootSplash />
      <ClientLayout>{children}</ClientLayout>
    </>
  );
}
