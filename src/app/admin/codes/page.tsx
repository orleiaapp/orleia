"use client";

// ============================================================
// /admin/codes — owner-only one-time code generator.
// Not linked from anywhere; gated by ORLEIA_GRANT_KEY (enforced
// server-side by POST /api/billing/codes — this page is just UI).
// The key is kept in sessionStorage under the same slot the
// BillingPanel grant prompt uses.
// ============================================================

import { useState } from "react";
import { KeyRound, Copy, Check, Loader2, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";

const TIERS = [
  { id: "plus", name: "Plus" },
  { id: "pro", name: "Pro" },
  { id: "ultra", name: "Ultra" },
] as const;

const DURATIONS = [
  { days: 7, label: "1 week" },
  { days: 30, label: "1 month" },
  { days: 90, label: "3 months" },
  { days: 365, label: "1 year" },
] as const;

interface MintedCode {
  code: string;
  tier: string;
  durationDays: number;
  note?: string;
}

export default function AdminCodesPage() {
  const [key, setKey] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [tier, setTier] = useState<string>("plus");
  const [durationDays, setDurationDays] = useState<number>(30);
  const [customDays, setCustomDays] = useState("");
  const [count, setCount] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [minted, setMinted] = useState<MintedCode[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const effectiveDays = durationDays === -1 ? Math.max(1, Math.floor(Number(customDays) || 0)) : durationDays;

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/billing/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-orleia-grant-key": key },
        body: JSON.stringify({ tier, durationDays: effectiveDays, count, note: note || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; codes?: MintedCode[]; error?: string };
      if (res.ok && data.ok && data.codes) {
        setMinted((prev) => [...data.codes!, ...prev]);
        setNote("");
      } else {
        setError(data.error || "Could not mint codes.");
        if (res.status === 404) setUnlocked(false); // wrong key
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  };

  if (!unlocked) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold">Code generator</h1>
          </div>
          <p className="text-xs text-muted-foreground">Owner only. Enter your grant key to continue.</p>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && key) setUnlocked(true);
            }}
            placeholder="ORLEIA_GRANT_KEY"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/60"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={() => setUnlocked(true)}
            disabled={!key}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Unlock
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="flex items-center gap-2">
          <Ticket className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">One-time codes</h1>
        </div>

        {/* Generator */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Tier</p>
            <div className="flex gap-2">
              {TIERS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTier(t.id)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    tier === t.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-muted-foreground/40"
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Duration</p>
            <div className="grid grid-cols-5 gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d.days}
                  onClick={() => setDurationDays(d.days)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                    durationDays === d.days ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-muted-foreground/40"
                  )}
                >
                  {d.label}
                </button>
              ))}
              <button
                onClick={() => setDurationDays(-1)}
                className={cn(
                  "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                  durationDays === -1 ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-muted-foreground/40"
                )}
              >
                Custom
              </button>
            </div>
            {durationDays === -1 && (
              <input
                type="number"
                min={1}
                max={730}
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                placeholder="Days (1–730)"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary/60"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">How many</p>
              <input
                type="number"
                min={1}
                max={10}
                value={count}
                onChange={(e) => setCount(Math.min(10, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary/60"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Note (optional)</p>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. phone, iPad"
                maxLength={80}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary/60"
              />
            </div>
          </div>

          <button
            onClick={() => void generate()}
            disabled={busy || (durationDays === -1 && effectiveDays < 1)}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Generate {count === 1 ? "code" : `${count} codes`}
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        {/* Minted codes */}
        {minted.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <p className="text-sm font-semibold">Your codes</p>
            <div className="space-y-2">
              {minted.map((c) => (
                <div key={c.code} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm tracking-wider">{c.code}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {c.tier} · {c.durationDays} days{c.note ? ` · ${c.note}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => void copy(c.code)}
                    className="shrink-0 rounded-lg border border-border p-2 transition-colors hover:border-primary/60"
                    aria-label={`Copy ${c.code}`}
                  >
                    {copied === c.code ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Each code burns on first redemption — the device that redeems it gets the plan until the date above.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
