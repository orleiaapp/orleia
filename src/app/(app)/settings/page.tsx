"use client";

import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Upload,
  Trash2,
  RefreshCcw,
  Sparkles,
  Palette,
  Monitor,
  Check,
  AlertTriangle,
  Shield,
  ScrollText,
  ArrowUpRight,
  ArrowLeft,
  AudioLines,
  Accessibility as AccessibilityIcon,
  FileText,
  Eye,
  Bell,
  ChevronRight,
  Zap,
  PenTool,
  Copy,
  Hand,
  Lock,
  CreditCard,
  User,
  Fingerprint,
  Keyboard,
  FileDown,
  type LucideIcon,
} from "lucide-react";
import { storage } from "@/lib/storage";
import { exportNotesMarkdown, exportJournalMarkdown, exportTasksCsv, exportHabitsCsv } from "@/lib/export";
import { cn } from "@/lib/utils";
import { notificationPermission, requestReminderPermission } from "@/lib/reminders";
import { useI18n, LANGUAGES } from "@/lib/i18n";
import { verifyPassword, isPasswordSet, PasswordGate } from "@/components/layout/PasswordGate";

import { OrleiaSwitch } from "@/components/switch/OrleiaSwitch";
import { getShortcuts, setShortcuts, isDesktop, getAutoStart, setAutoStart } from "@/lib/desktop-bridge";
import { BillingPanel } from "@/components/settings/BillingPanel";
import { getDeviceId } from "@/lib/device-id";
import { ImportPanel } from "@/components/settings/ImportPanel";
import { PETS, petById, petSvg } from "@/lib/pets";
import { PowerEnginePanel } from "@/components/settings/PowerEnginePanel";



type SettingsCategory =
  | "profile"
  | "billing"
  | "appearance"
  | "accessibility"
  | "noor"
  | "mode"
  | "reminders"
  | "sync"
  | "shortcuts"
  | "data"
  | "security"
  | "legal"
  | "about"
  | "skills"
  | "import"
  | null;

const ORLEIA_VERSION = "2.6.0";

const legalLinks = [
  { href: "/privacy", tKey: "settings.linkPrivacy" },
  { href: "/terms", tKey: "settings.linkTerms" },
  { href: "/cookies", tKey: "settings.linkCookies" },
  { href: "/disclaimer", tKey: "settings.linkDisclaimer" },
  { href: "/gdpr", tKey: "settings.linkGdpr" },
  { href: "/ccpa", tKey: "settings.linkCcpa" },
  { href: "/refund", tKey: "settings.linkRefund" },
  { href: "/acceptable-use", tKey: "settings.linkAup" },
  { href: "/eula", tKey: "settings.linkEula" },
  { href: "/accessibility", tKey: "settings.linkAccessibility" },
];

/* ------------------------------------------------------------------ */
/* Toggle switch helper                                                */
/* ------------------------------------------------------------------ */
function Toggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "shrink-0 flex h-6 w-11 items-center rounded-full p-0.5 transition-colors",
        active ? "bg-primary-500" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "h-5 w-5 rounded-full bg-background shadow transition-transform",
          active && "translate-x-5"
        )}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Profile Editor (About You)                                          */
/* ------------------------------------------------------------------ */
function ProfileEditor({
  data,
  refresh,
  t,
  onBack,
}: {
  data: ReturnType<typeof storage.getData>;
  refresh: () => void;
  t: (key: string) => string;
  onBack: () => void;
}) {
  const profile = data.profile || ({} as any);

  const [name, setName] = useState(profile.name || "");
  const [pet, setPet] = useState(profile.pet || "");
  const [commPrefs, setCommPrefs] = useState<string[]>(
    Array.isArray(profile.communicationPrefs) ? profile.communicationPrefs : []
  );
  const [goals, setGoals] = useState(profile.goals || "");
  const [saved, setSaved] = useState(false);

  const save = () => {
    storage.updateProfile({
      name: name.trim(),
      communicationPrefs: commPrefs,
      goals: goals.trim(),
      pet: pet || undefined,
      // Simplified About You: these fields are retired — clear them so
      // legacy data does not linger on the device or reach Noor.
      pronouns: "",
      ageRange: "",
      timeZone: "",
      workStudy: [],
      interests: [],
      schedule: "",
      productivityPrefs: [],
      helpWith: [],
    });
    refresh();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const none = "—";
  const talkOptions = [
    { key: "direct", label: t("opt.direct") },
    { key: "concise", label: t("opt.concise") },
    { key: "encouraging", label: t("opt.encouraging") },
    { key: "detailed", label: t("opt.detailed") },
  ];

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        {t("settings.title")}
      </button>
      <h2 className="text-lg font-bold">{t("settings.profile")}</h2>

      {/* Name */}
      <div className="space-y-1">
        <label className="text-sm font-medium">{t("onboarding.name")}</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("onboarding.namePh")}
          className="w-full rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary-500/40"
        />
      </div>

      {/* How Noor should talk */}
      <div className="space-y-1">
        <label className="text-sm font-medium">{t("onboarding.commPrefs")}</label>
        <div className="flex flex-wrap gap-2">
          {talkOptions.map((o) => (
            <button key={o.key} onClick={() => setCommPrefs((c) => (c.includes(o.key) ? c.filter((k) => k !== o.key) : [...c, o.key]))} className={`rounded-full border px-3 py-1 text-xs transition-all ${commPrefs.includes(o.key) ? "border-primary-500 bg-primary-500/10 text-primary-500" : "border-border text-muted-foreground hover:border-muted-foreground/40"}`}>{o.label}</button>
          ))}
          <button onClick={() => setCommPrefs([])} className={`rounded-full border px-3 py-1 text-xs transition-all ${commPrefs.length === 0 ? "border-primary-500 bg-primary-500/10 text-primary-500" : "border-border text-muted-foreground hover:border-muted-foreground/40"}`}>{none}</button>
        </div>
      </div>

      {/* Goals */}
      <div className="space-y-1">
        <label className="text-sm font-medium">{t("onboarding.goals")}</label>
        <textarea
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
          placeholder={t("onboarding.goalsPh")}
          rows={3}
          className="w-full resize-none rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary-500/40"
        />
      </div>

      {/* Orleia Pet (beta) */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Orleia Pet</label>
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">Beta</span>
        </div>
        <p className="text-xs text-muted-foreground">Pick an abstract companion — it becomes your profile picture. More pet magic coming later.</p>
        <div className="flex flex-wrap gap-2.5 pt-1">
          {PETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPet(pet === p.id ? "" : p.id)}
              aria-pressed={pet === p.id}
              aria-label={`${p.name} pet`}
              className={`flex h-16 w-16 items-center justify-center rounded-2xl border-2 p-1.5 transition-all active:scale-95 ${
                pet === p.id ? "border-primary-500 bg-primary-500/10" : "border-border bg-secondary/40 hover:border-foreground/30"
              }`}
              dangerouslySetInnerHTML={{ __html: petSvg(p, "h-full w-full") }}
            />
          ))}
        </div>
        {pet && (
          <p className="text-xs text-muted-foreground">{petById(pet)?.name} selected — tap again to go back to the default picture.</p>
        )}
      </div>

      {/* Save */}
      <button
        onClick={save}            className="w-full rounded-xl border border-foreground/20 bg-transparent px-4 py-2.5 text-sm font-medium text-foreground/70 transition-all hover:border-foreground/40 hover:text-foreground active:scale-[0.98]"
      >
        {saved ? "✓ Saved" : "Save"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings Page                                                       */
/* ------------------------------------------------------------------ */
export default function SettingsPage() {
  const [data, setData] = useState(storage.getData());
  const { t } = useI18n();
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(null);

  const [showConfirm, setShowConfirm] = useState(false);
  const [showSwitch, setShowSwitch] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearPassword, setClearPassword] = useState("");
  const [clearPasswordError, setClearPasswordError] = useState("");
  const [hasPassword, setHasPassword] = useState(isPasswordSet());
  const [shortcuts, setShortcutsState] = useState<Record<string, string>>({});
  const [editingShortcut, setEditingShortcut] = useState<string | null>(null);
  const [shortcutError, setShortcutError] = useState("");
  const [shortcutSaved, setShortcutSaved] = useState(false);
  const [autoStart, setAutoStartState] = useState(false);

  useEffect(() => {
    if (isDesktop()) {
      getShortcuts().then((s) => { if (s) setShortcutsState(s); });
      getAutoStart().then(setAutoStartState);
    }
    // Deep-link: /settings?cat=skills opens the Skills section directly
    // (linked from Noor's model picker "Manage skills").
    if (typeof window !== "undefined") {
      const cat = new URLSearchParams(window.location.search).get("cat");
      if (cat === "skills") {
        setActiveCategory("skills");
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);

  const handleShortcutChange = async (action: string, value: string) => {
    const updated = { ...shortcuts, [action]: value };
    setShortcutsState(updated);
    setShortcutError("");
    setShortcutSaved(false);
    const ok = await setShortcuts(updated);
    if (ok) {
      setShortcutSaved(true);
      setTimeout(() => setShortcutSaved(false), 2000);
    }
  };

  const resetShortcuts = async () => {
    const defaults: Record<string, string> = {
      "Focus Orleia": "CommandOrControl+Shift+L",
      "New Note": "CommandOrControl+Shift+N",
      "New Task": "CommandOrControl+Shift+T",
    };
    setShortcutsState(defaults);
    await setShortcuts(defaults);
    setShortcutSaved(true);
    setTimeout(() => setShortcutSaved(false), 2000);
  };
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    notificationPermission()
  );
  useEffect(() => {
    setHasPassword(isPasswordSet());
  }, []);

  const refresh = () => setData({ ...storage.getData() });
  useEffect(
    () => storage.subscribe(() => setData({ ...storage.getData() })),
    []
  );

  const handleExport = () => {
    const json = storage.exportData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orleia-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          if (storage.importData(content)) {
            refresh();
            alert(t("settings.importSuccess"));
          } else {
            alert(t("settings.importFail"));
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleClear = async () => {
    if (clearPassword) {
      setClearPasswordError("");
      const valid = await verifyPassword(clearPassword);
      if (!valid) {
        setClearPasswordError("Incorrect password.");
        setClearing(false);
        return;
      }
    } else if (isPasswordSet()) {
      setClearPasswordError("Enter your password to confirm.");
      return;
    }
    setClearing(true);
    try {
      await storage.clearAll();
      window.location.href = "/";
    } catch (e) {
      console.error("Failed to clear data", e);
      setClearing(false);
    }
  };

  /* ----- Category definitions ----- */
  const categories: {
    id: SettingsCategory & string;
    icon: LucideIcon;
    label: string;
    desc: string;
    color: string;
  }[] = [
    {
      id: "billing",
      icon: CreditCard,
      label: t("settings.billing"),
      desc: t("settings.billingDesc"),
      color: "text-primary",
    },
    {
      id: "profile",
      icon: User,
      label: t("settings.profile"),
      desc: t("settings.profileDesc"),
      color: "text-primary",
    },
    {
      id: "appearance",
      icon: Palette,
      label: t("settings.appearance"),
      desc: t("settings.theme"),
      color: "text-primary",
    },
    {
      id: "accessibility",
      icon: AccessibilityIcon,
      label: t("settings.accessibility"),
      desc: t("settings.dyslexia") + ", " + t("settings.contrast"),
      color: "text-primary",
    },
    {
      id: "noor",
      icon: Sparkles,
      label: t("settings.noorSees"),
      desc: t("settings.noorSeesDesc"),
      color: "text-primary",
    },
    {
      id: "skills",
      icon: Zap,
      label: t("skills.title"),
      desc: t("skills.categoryDesc"),
      color: "text-primary",
    },
    {
      id: "reminders",
      icon: Bell,
      label: t("settings.reminders"),
      desc: t("settings.remindersDesc"),
      color: "text-primary",
    },
    {
      id: "shortcuts",
      icon: Keyboard,
      label: t("settings.shortcuts"),
      desc: t("settings.shortcutsDesc"),
      color: "text-primary",
    },
    {
      id: "data",
      icon: Download,
      label: t("settings.data"),
      desc: t("settings.dataDesc"),
      color: "text-primary",
    },
    {
      id: "import",
      icon: FileDown,
      label: t("settings.import"),
      desc: t("settings.importDesc"),
      color: "text-primary",
    },
    {
      id: "legal",
      icon: ScrollText,
      label: t("settings.legal"),
      desc: t("settings.legalDesc"),
      color: "text-primary",
    },
    {
      id: "about",
      icon: FileText,
      label: t("settings.about"),
      desc: t("settings.aboutDesc"),
      color: "text-primary",
    },
  ];

  const visibleCategories = categories.filter(
    (c) => true
  );

  /* ----- Back button for detail view ----- */
  const DetailHeader = () => (
    <button
      onClick={() => setActiveCategory(null)}
      className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="h-4 w-4" />
      {t("settings.title")}
    </button>
  );

  /* ================================================================ */
  /* HUB VIEW                                                         */
  /* ================================================================ */
  if (!activeCategory) {  return (
    <div className="space-y-6 md:space-y-8 max-w-5xl">
        {/* ── User Profile Header ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-5"
        >
          {/* Avatar — shows the chosen Orleia Pet (beta) or the default person mark. */}
          {(() => {
            const pet = petById(data.profile?.pet);
            return pet ? (
              <div
                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-secondary"
                dangerouslySetInnerHTML={{ __html: petSvg(pet, "h-14 w-14") }}
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-secondary">
                <svg className="h-10 w-10 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
            );
          })()}
          <div className="min-w-0">
            <h1 className="text-xl font-bold md:text-2xl truncate">
              {data.profile?.name || t("onboarding.namePh") || "User"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Orleia {ORLEIA_VERSION} · <span className="text-emerald-400">{t("settings.upToDate")}</span>
            </p>
          </div>
        </motion.div>

        {/* Desktop: Grid of category cards (Windows Settings style) */}
        <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className="settings-enter group flex items-start gap-4 rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-muted-foreground/30 hover:bg-secondary/40 active:scale-[0.98]"
            >
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary",
                  cat.color
                )}
              >
                <cat.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{cat.label}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/30 mt-1 group-hover:text-muted-foreground transition-colors" />
            </button>
          ))}
        </div>

        {/* Mobile: List of category rows (iOS Settings style) */}
        <div className="md:hidden space-y-1">
          {visibleCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className="settings-enter-mobile flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition-colors active:bg-secondary/60"
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary",
                  cat.color
                )}
              >
                <cat.icon className="h-4 w-4" />
              </div>
              <span className="flex-1 text-sm font-medium">{cat.label}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/30" />
            </button>
          ))}
        </div>

        {/* Clear Confirmation Modal */}
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
            onClick={() => setShowConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-2xl p-6 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                  <AlertTriangle className="h-7 w-7 text-muted-foreground" />
                </div>
              </div>
              <h3 className="text-lg font-bold mb-2">
                {t("settings.clearTitle")}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t("settings.clearDesc")}
              </p>
              {isPasswordSet() && (
                <div className="mb-4">
                  <input
                    type="password"
                    value={clearPassword}
                    onChange={(e) => {
                      setClearPassword(e.target.value);
                      setClearPasswordError("");
                    }}
                    placeholder="Enter your password to confirm"
                    className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary-500/40"
                    autoFocus
                  />
                  {clearPasswordError && (
                    <p className="mt-1.5 text-xs text-red-400">
                      {clearPasswordError}
                    </p>
                  )}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowConfirm(false);
                    setClearPassword("");
                    setClearPasswordError("");
                  }}
                  className="btn-secondary flex-1"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleClear}
                  disabled={clearing}
                  className="flex-1 rounded-xl bg-zinc-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t("settings.deleteEverything")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showSwitch && (
          <OrleiaSwitch
            onClose={() => {
              setShowSwitch(false);
              refresh();
            }}
            onComplete={() => {
              setShowSwitch(false);
              refresh();
            }}
          />
        )}

      </div>
    );
  }

  /* ================================================================ */
  /* DETAIL VIEW — rendered per category                               */
  /* ================================================================ */
  return (
    <div className="space-y-6 md:space-y-8 max-w-2xl">
      {/* ---- PROFILE (About You) ---- — ProfileEditor renders its own back
           button; do NOT add <DetailHeader /> here (would double it). */}
      {activeCategory === "profile" && (
        <ProfileEditor data={data} refresh={refresh} t={t} onBack={() => setActiveCategory(null)} />
      )}

      {/* ---- APPEARANCE ---- */}
      {activeCategory === "appearance" && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="card"
        >
          <DetailHeader />
          <div className="flex items-center gap-2 mb-4">
            <Palette className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">{t("settings.appearance")}</h2>
          </div>
          <div className="space-y-5">
            {/* Language */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                {t("settings.language")}
              </label>
              <select
                value={data.theme.language || "en"}
                onChange={(e) => {
                  storage.updateTheme({ language: e.target.value });
                  refresh();
                }}
                className="w-full max-w-xs rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary-500/50"
                aria-label={t("settings.language")}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-muted-foreground/60">
                {t("settings.languageHint")}
              </p>
            </div>

            {/* Theme */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                {t("settings.theme")}
              </label>
              <div className="flex gap-2">
                {(["light", "dark", "system"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      storage.updateTheme({ theme: mode as any });
                      const isDark =
                        mode === "dark" ||
                        (mode === "system" &&
                          window.matchMedia("(prefers-color-scheme: dark)")
                            .matches);
                      document.documentElement.classList.toggle("dark", isDark);
                      refresh();
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-all",
                      data.theme.theme === mode
                        ? "border-primary-500 bg-primary-500/10 text-primary-500"
                        : "border-border hover:border-muted-foreground/30"
                    )}
                  >
                    <Monitor className="h-4 w-4" />
                    {t("settings." + mode)}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                {t("settings.fontSize")}
              </label>
              <div className="flex gap-2">
                {(["sm", "md", "lg"] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => {
                      storage.updateTheme({ fontSize: size });
                      document.documentElement.setAttribute(
                        "data-font-size",
                        size
                      );
                      refresh();
                    }}
                    className={cn(
                      "rounded-xl border px-4 py-2 text-sm transition-all",
                      data.theme.fontSize === size
                        ? "border-primary-500 bg-primary-500/10 text-primary-500"
                        : "border-border hover:border-muted-foreground/30"
                    )}
                  >
                    {size === "sm"
                      ? t("settings.fontSmall")
                      : size === "md"
                      ? t("settings.fontMedium")
                      : t("settings.fontLarge")}
                  </button>
                ))}
              </div>
            </div>

            {/* Accent Colour */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Accent Colour
              </label>
              <div className="flex gap-2">
                {(
                  [
                    { key: "slate", cls: "bg-zinc-400 dark:bg-zinc-500" },
                    { key: "amber", cls: "bg-amber-500 dark:bg-amber-400" },
                    {
                      key: "emerald",
                      cls: "bg-emerald-500 dark:bg-emerald-400",
                    },
                    { key: "sky", cls: "bg-sky-500 dark:bg-sky-400" },
                    {
                      key: "violet",
                      cls: "bg-violet-500 dark:bg-violet-400",
                    },
                    { key: "rose", cls: "bg-rose-500 dark:bg-rose-400" },
                    {
                      key: "orange",
                      cls: "bg-orange-500 dark:bg-orange-400",
                    },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.key}
                    onClick={() => {
                      storage.updateTheme({ accentColor: c.key });
                      document.documentElement.setAttribute(
                        "data-accent",
                        c.key
                      );
                      refresh();
                    }}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all",
                      (data.theme.accentColor || "slate") === c.key
                        ? "border-foreground scale-110"
                        : "border-transparent hover:scale-105"
                    )}
                    aria-label={c.key.charAt(0).toUpperCase() + c.key.slice(1)}
                  >
                    <span className={cn("h-5 w-5 rounded-full", c.cls)} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ---- ACCESSIBILITY ---- */}
      {activeCategory === "accessibility" && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="card"
        >
          <DetailHeader />
          <div className="flex items-center gap-2 mb-4">
            <AccessibilityIcon className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">{t("settings.accessibility")}</h2>
          </div>
          <div className="space-y-3">
            {(
              [
                {
                  key: "dyslexiaFriendly" as const,
                  label: t("settings.dyslexia"),
                  desc: t("settings.dyslexiaDesc"),
                },
                {
                  key: "highContrast" as const,
                  label: t("settings.contrast"),
                  desc: t("settings.contrastDesc"),
                },
                {
                  key: "reducedMotion" as const,
                  label: t("settings.reducedMotion"),
                  desc: t("settings.reducedMotionDesc"),
                },
                {
                  key: "underlineLinks" as const,
                  label: t("settings.underlineLinks"),
                  desc: t("settings.underlineLinksDesc"),
                },
              ] as const
            ).map((opt) => {
              const active = !!data.theme[opt.key];
              return (
                <button
                  key={opt.key}
                  onClick={() => {
                    storage.updateTheme({ [opt.key]: !active });
                    if (opt.key === "dyslexiaFriendly") {
                      document.documentElement.setAttribute("data-dyslexia", (!active).toString());
                    } else if (opt.key === "highContrast") {
                      document.documentElement.classList.toggle("high-contrast", !active);
                    } else if (opt.key === "underlineLinks") {
                      document.documentElement.classList.toggle("underline-links", !active);
                    } else {
                      document.documentElement.setAttribute("data-reduced-motion", (!active).toString());
                    }
                    refresh();
                  }}
                  className={cn(
                    "w-full flex items-center justify-between gap-4 rounded-2xl border p-4 text-left transition-all",
                    active
                      ? "border-primary-500 bg-primary-500/10"
                      : "border-border hover:border-muted-foreground/30"
                  )}
                >
                  <span>
                    <span className="block text-sm font-medium">
                      {opt.label}
                    </span>
                  </span>
                  <Toggle active={active} onToggle={() => {}} />
                </button>
              );
            })}
          </div>
        </motion.div>
      )}

      {activeCategory === "noor" && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          <DetailHeader />
          {/* Relationship */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">
                {t("onboarding.relationship")}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {t("onboarding.relationshipDesc")}
            </p>
            <div className="space-y-2">
              {(
                [
                  {
                    key: "observer",
                    icon: Eye,
                    name: t("rel.observer"),
                    desc: t("rel.observerDesc"),
                  },
                  {
                    key: "assistant",
                    icon: Sparkles,
                    name: t("rel.assistant"),
                    desc: t("rel.assistantDesc"),
                  },
                  {
                    key: "operator",
                    icon: Zap,
                    name: t("rel.operator"),
                    desc: t("rel.operatorDesc"),
                  },
                ] as const
              ).map((o) => {
                const active = data.noorRelationship === o.key;
                return (
                  <button
                    key={o.key}
                    onClick={() => {
                      storage.updateNoorRelationship(o.key);
                      refresh();
                    }}
                    className={cn(
                      "w-full flex items-center justify-between gap-4 rounded-2xl border p-4 text-left transition-all",
                      active
                        ? "border-primary-500 bg-primary-500/10"
                        : "border-border hover:border-muted-foreground/30"
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <o.icon
                        className={cn(
                          "h-5 w-5 shrink-0",
                          active ? "text-primary-500" : "text-muted-foreground"
                        )}
                      />
                      <span>
                        <span className="block text-sm font-medium">
                          {o.name}
                        </span>
                      </span>
                    </span>
                    {active && (
                      <Check className="h-4 w-4 shrink-0 text-primary-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* What Noor sees */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Eye className="h-5 w-5 text-emerald-500" />
              <h2 className="font-semibold">{t("settings.noorSees")}</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {t("settings.noorSeesDesc")}
            </p>
            <ul className="space-y-3 text-sm">
              {[
                t("settings.noorSeesLocal"),
                t("settings.noorSeesAi"),
                t("settings.noorSeesVoice"),
                t("settings.noorSeesNoTracking"),
                t("settings.noorSeesDelete"),
              ].map((text, i) => (
                <li key={i} className="flex gap-3">
                  <Check className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}

      {/* ---- REMINDERS ---- */}
      {activeCategory === "reminders" && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="card"
        >
          <DetailHeader />
          <div className="flex items-center gap-2 mb-4">
            <Bell className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">{t("settings.reminders")}</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {t("settings.remindersDesc")}
          </p>

          {perm === "unsupported" ? (
            <p className="text-xs text-muted-foreground mb-4">
              {t("settings.remindersUnsupported")}
            </p>
          ) : perm === "granted" ? (
            <div className="flex items-center gap-2 text-sm text-emerald-400 mb-4">
              <Check className="h-4 w-4" />
              {t("settings.remindersEnabled")}
            </div>
          ) : perm === "denied" ? (
            <p className="text-xs text-muted-foreground mb-4">
              {t("settings.remindersDenied")}
            </p>
          ) : (
            <button
              onClick={async () => {
                await requestReminderPermission();
                setPerm(notificationPermission());
              }}
              className="btn-secondary flex items-center gap-2 mb-4"
            >
              <Bell className="h-4 w-4" />
              {t("settings.remindersEnable")}
            </button>
          )}

          <div className="space-y-3">
            {(
              [
                {
                  key: "remindersEnabled" as const,
                  label: t("settings.remindersMaster"),
                  desc: t("settings.remindersMasterDesc"),
                },
                {
                  key: "remindEvents" as const,
                  label: t("settings.remindEvents"),
                  desc: t("settings.remindEventsDesc"),
                },
                {
                  key: "remindHabits" as const,
                  label: t("settings.remindHabits"),
                  desc: t("settings.remindHabitsDesc"),
                },
                {
                  key: "remindTasks" as const,
                  label: t("settings.remindTasks"),
                  desc: t("settings.remindTasksDesc"),
                },
                {
                  key: "remindMentions" as const,
                  label: t("settings.remindMentions"),
                  desc: t("settings.remindMentionsDesc"),
                },
                {
                  key: "remindWellness" as const,
                  label: t("settings.remindWellness"),
                  desc: t("settings.remindWellnessDesc"),
                },
              ] as const
            ).map((opt) => {
              const active = !!data.theme[opt.key];
              return (
                <button
                  key={opt.key}
                  onClick={() => {
                    storage.updateTheme({ [opt.key]: !active });
                    refresh();
                  }}
                  className={cn(
                    "w-full flex items-center justify-between gap-4 rounded-2xl border p-4 text-left transition-all",
                    active
                      ? "border-primary-500 bg-primary-500/10"
                      : "border-border hover:border-muted-foreground/30"
                  )}
                >
                  <span>
                    <span className="block text-sm font-medium">
                      {opt.label}
                    </span>
                  </span>
                  <Toggle active={active} onToggle={() => {}} />
                </button>
              );
            })}
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4">
              <span>
                <span className="block text-sm font-medium">
                  {t("settings.wellnessTime")}
                </span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  {t("settings.wellnessTimeDesc")}
                </span>
              </span>
              <input
                type="time"
                value={data.theme.wellnessTime || "15:00"}
                onChange={(e) => {
                  storage.updateTheme({ wellnessTime: e.target.value });
                  refresh();
                }}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm tabular-nums focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>
        </motion.div>
      )}

      


      {/* ---- LEGAL ---- */}
      {activeCategory === "billing" && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          <DetailHeader />
          <h2 className="text-lg font-bold">{t("settings.billing")}</h2>
          <BillingPanel />
        </motion.div>
      )}
      {activeCategory === "skills" && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          <DetailHeader />
          <h2 className="text-lg font-bold">{t("skills.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("skills.desc")}</p>
          <PowerEnginePanel />
        </motion.div>
      )}
      {activeCategory === "import" && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          <DetailHeader />
          <h2 className="text-lg font-bold">{t("settings.import")}</h2>
          <ImportPanel />
        </motion.div>
      )}
      {activeCategory === "legal" && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="card"
        >
          <DetailHeader />
          <div className="flex items-center gap-2 mb-4">
            <ScrollText className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">{t("settings.legal")}</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {t("settings.legalDesc")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {legalLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="group flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground/30 transition-all duration-200"
              >
                {t(l.tKey)}
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200" />
              </Link>
            ))}
          </div>
        </motion.div>
      )}

      {/* ---- DATA ---- */}
      {activeCategory === "data" && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          <DetailHeader />
          <h2 className="text-lg font-bold">{t("settings.data")}</h2>

          {/* Export */}
          <button
            onClick={handleExport}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary-500/40 hover:bg-secondary/40 active:scale-[0.98]"
          >
            <Download className="h-4 w-4 text-primary-500" />
            <div>
              <p className="text-sm font-medium">{t("settings.exportData")}</p>
              <p className="text-xs text-muted-foreground">.json</p>
            </div>
          </button>

          {/* Import */}
          <button
            onClick={handleImport}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary-500/40 hover:bg-secondary/40 active:scale-[0.98]"
          >
            <Upload className="h-4 w-4 text-primary-500" />
            <div>
              <p className="text-sm font-medium">{t("settings.importData")}</p>
              <p className="text-xs text-muted-foreground">.json</p>
            </div>
          </button>

          {/* Danger zone */}
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <p className="text-sm font-medium text-red-400">{t("settings.clearAll")}</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{t("settings.clearDesc")}</p>
            <button
              onClick={() => setShowConfirm(true)}
              className="rounded-xl bg-red-500/90 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 active:scale-[0.98]"
            >
              {t("settings.deleteEverything")}
            </button>
          </div>
        </motion.div>
      )}

      {/* ---- SHORTCUTS ---- */}
      {activeCategory === "shortcuts" && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          <DetailHeader />
          <h2 className="text-lg font-bold">{t("settings.shortcuts")}</h2>
          <p className="text-sm text-muted-foreground">{t("settings.shortcutsDesc")}</p>

          {/* In-app web shortcuts - always available */}
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {[
              { keys: "Ctrl + K", action: "Search" },
              { keys: "Ctrl + Shift + N", action: "New note" },
              { keys: "Ctrl + Shift + T", action: "New task" },
              { keys: "Ctrl + Shift + H", action: "New habit" },
              { keys: "Ctrl + B", action: "Toggle sidebar" },
              { keys: "Ctrl + ,", action: "Settings" },
            ].map((s) => (
              <div key={s.keys} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm">{s.action}</span>
                <kbd className="rounded-lg border border-border bg-secondary/60 px-2 py-0.5 font-mono text-xs text-muted-foreground">{s.keys}</kbd>
              </div>
            ))}
          </div>

          {/* Desktop global shortcuts - Electron only */}
          {isDesktop() && Object.keys(shortcuts).length > 0 && (
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {Object.entries(shortcuts).map(([action, value]) => (
                <div key={action} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm">{action}</span>
                  <kbd className="rounded-lg border border-border bg-secondary/60 px-2 py-0.5 font-mono text-xs text-muted-foreground">{value}</kbd>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* ---- UPDATE ---- */}
      {activeCategory === "about" && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          <DetailHeader />
          <h2 className="text-lg font-bold">{t("settings.about")}</h2>

          {/* Version + Status */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Version</span>
              <a
                href="https://orleia.app/changelog"
                target="_blank"
                rel="noreferrer"
                className="text-sm font-mono font-medium underline underline-offset-2 decoration-foreground/20 hover:decoration-foreground transition-colors"
              >
                {ORLEIA_VERSION}
              </a>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <span className="text-sm text-emerald-500 font-medium">{t("settings.upToDate")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">AI Model</span>
              <span className="text-sm font-medium">Novella 5.0</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Framework</span>
              <span className="text-sm font-medium">Next.js + Electron</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Privacy</span>
              <span className="text-sm font-medium">All data local</span>
            </div>
          </div>

          {/* Check for updates */}
          <button
            onClick={async () => {
              try {
                const res = await fetch("/version.json?t=" + Date.now(), { cache: "no-store" });
                const json = await res.json();
                if (json.version && json.version !== ORLEIA_VERSION) {
                  window.dispatchEvent(new CustomEvent("orleia:update-available", { detail: { version: json.version } }));
                  alert(t("settings.updateAvailable") + " — v" + json.version);
                } else {
                  alert(t("settings.upToDate") + " (v" + ORLEIA_VERSION + ")");
                }
              } catch {
                alert("Could not check for updates.");
              }
            }}
            className="w-full rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary-500/40 hover:bg-secondary/40 active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <RefreshCcw className="h-4 w-4 text-primary-500" />
              <div>
                <p className="text-sm font-medium">{t("settings.updateCheck") || "Check for updates"}</p>
                <p className="text-xs text-muted-foreground">{t("settings.updateCheckDesc") || "See if a newer version of Orleia is available"}</p>
              </div>
            </div>
          </button>

          {/* Download update */}
          <a
            href="https://app.orleia.app/downloads"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary-500/40 hover:bg-secondary/40 active:scale-[0.98]"
          >
            <Download className="h-4 w-4 text-primary-500" />
            <div>
              <p className="text-sm font-medium">{t("settings.updateDownload")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.updateDownloadDesc") || "Download the latest version for your device"}</p>
            </div>
          </a>
        </motion.div>
      )}

      {/* ---- ABOUT (legacy, now merged above) ---- */}
      {/* ---- Modals ---- */}
      {showConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
          onClick={() => setShowConfirm(false)}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-2xl p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <AlertTriangle className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <h3 className="text-lg font-bold mb-2">
              {t("settings.clearTitle")}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t("settings.clearDesc")}
            </p>
            {isPasswordSet() && (
              <div className="mb-4">
                <input
                  type="password"
                  value={clearPassword}
                  onChange={(e) => {
                    setClearPassword(e.target.value);
                    setClearPasswordError("");
                  }}
                  placeholder="Enter your password to confirm"
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary-500/40"
                  autoFocus
                />
                {clearPasswordError && (
                  <p className="mt-1.5 text-xs text-red-400">
                    {clearPasswordError}
                  </p>
                )}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowConfirm(false);
                  setClearPassword("");
                  setClearPasswordError("");
                }}
                className="btn-secondary flex-1"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleClear}
                disabled={clearing}
                className="flex-1 rounded-xl bg-zinc-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("settings.deleteEverything")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {showSwitch && (
        <OrleiaSwitch
          onClose={() => {
            setShowSwitch(false);
            refresh();
          }}
          onComplete={() => {
            setShowSwitch(false);
            refresh();
          }}
        />
      )}

    </div>
  );
}

