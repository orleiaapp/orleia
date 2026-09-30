"use client";

import { useState, useEffect, useLayoutEffect, lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { storage } from "@/lib/storage";
import { haptic } from "@/lib/haptics";
import { cn, formatDate, getToday } from "@/lib/utils";
import { WIDGET_COMPONENTS } from "@/components/widgets/Widgets";
import { WidgetCatalog } from "@/components/widgets/WidgetCatalog";
import type { WidgetId } from "@/types";
import Link from "next/link";

const LandingPage = lazy(() => import("../(marketing)/landing/page"));

function useIsLandingDomain() {
  const [isLanding, setIsLanding] = useState(true);
  /* Layout effect (not useEffect): resolves the hostname BEFORE the first
     paint, so the landing page (and its vortex background) never flashes
     when the dashboard mounts. Isomorphic wrapper keeps SSR happy. */
  const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
  useIsoLayoutEffect(() => {
    setIsLanding(!window.location.hostname.startsWith("app."));
  }, []);
  return isLanding;
}

export default function DashboardPage() {
  const isLanding = useIsLandingDomain();
  const [data, setData] = useState(storage.getData());
  const profile = data.profile;
  const [greeting, setGreeting] = useState("Good morning");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [widgets, setWidgets] = useState<WidgetId[]>(      () => (storage.getData().dashboardWidgets as WidgetId[]) || ["productivity", "stats", "pet"]
  );

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 17) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  useEffect(() => {
    const unsub = storage.subscribe(() => {
      setData({ ...storage.getData() });
      setWidgets((storage.getData().dashboardWidgets as WidgetId[]) || ["productivity", "stats"]);
    });
    return unsub;
  }, []);

  if (isLanding) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <LandingPage />
      </Suspense>
    );
  }

  const toggleWidget = (id: WidgetId) => {
    setWidgets((prev) => {
      const next = prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id];
      const d = storage.getData();
      d.dashboardWidgets = next;
      storage.saveData();
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-1">{greeting}{profile?.name ? `, ${profile.name}` : ""}!</h1>
            <p className="text-sm text-muted-foreground">
              {formatDate(new Date(), "EEEE, MMMM d")}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Dynamic Widget Layout */}
      {widgets.map((id, index) => {
        const Widget = WIDGET_COMPONENTS[id];
        if (!Widget) return null;
        return (
          <motion.div
            key={id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + index * 0.04 }}
          >
            <Widget />
          </motion.div>
        );
      })}

      {/* Empty state */}
      {widgets.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-muted-foreground text-sm">No widgets active. Tap + to add some.</p>
        </div>
      )}

      {/* Edit Widgets — full width of the widget column, hugs its content */}
      <button
        onClick={() => { haptic.tap(); setCatalogOpen(true); }}
        className="mx-auto flex w-fit items-center justify-center gap-2 rounded-2xl border border-foreground/15 bg-transparent px-5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/35 hover:text-foreground active:scale-[0.99] dark:border-foreground/25 dark:hover:border-foreground/45"
      >
        <Plus className="h-4 w-4" strokeWidth={1.75} />
        <span>Edit Widgets</span>
      </button>

      {/* Widget Catalog Modal */}
      {catalogOpen && (
        <WidgetCatalog
          active={widgets}
          onToggle={toggleWidget}
          onClose={() => setCatalogOpen(false)}
        />
      )}
    </div>
  );
}
