"use client";

import { useAuth } from "@/components/AuthProvider";
import { useI18n } from "@/lib/i18n";
import { motion } from "framer-motion";
import { User, LogOut, Monitor, Smartphone, Tablet, Cloud, Check } from "lucide-react";

export function SyncSettings({ refresh }: { refresh: () => void }) {
  const { t } = useI18n();
  const { user, signOut, session } = useAuth();
  const isGuest = typeof window !== "undefined" && localStorage.getItem("orleia-guest-mode") === "1";

  const providerName = user?.app_metadata?.provider === "google" ? "Google"
    : user?.app_metadata?.provider === "apple" ? "Apple"
    : user?.app_metadata?.provider === "github" ? "GitHub"
    : user?.app_metadata?.provider === "azure" ? "Microsoft"
    : "Unknown";

  return (
    <motion.div className="space-y-4 settings-detail-enter">
      <div className="flex items-center gap-2 mb-1">
        <Cloud className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">{t("settings.sync")}</h2>
      </div>

      {isGuest ? (
        <div className="rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Guest Mode</p>
              <p className="text-xs text-muted-foreground">Data is stored locally on this device only</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Sign in with Google, Apple, GitHub, or Microsoft to sync your data across all devices.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Monitor className="h-3.5 w-3.5" /> Desktop</span>
            <span className="flex items-center gap-1"><Tablet className="h-3.5 w-3.5" /> Tablet</span>
            <span className="flex items-center gap-1"><Smartphone className="h-3.5 w-3.5" /> Mobile</span>
          </div>
        </div>
      ) : user ? (
        <div className="rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Check className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.email || "Signed in"}</p>
              <p className="text-xs text-muted-foreground">Synced via {providerName}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Your data syncs automatically across all devices where you&apos;re signed in.
          </p>
          <button
            onClick={async () => { await signOut(); refresh(); }}
            className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80 transition-colors"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      ) : null}
    </motion.div>
  );
}
