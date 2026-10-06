# Coder Plan — "Coder mode inside Noor"

Status: PLAN ONLY — no code written yet.
Date: Oct 6, 2026 (rev 3 — free sees the switch but locked; labeled beta everywhere)
Direction change: Coder is **not its own tab**. It is a **mode inside Noor**
(like ChatGPT ↔ Codex under one roof): same chat surface, a mode switch, a
**completely different UI/UX** while active, a **foggy fade** crossing
between the two modes, and **desktop only** (blocked on mobile and tablet).

---

## 1. What we're building

A **Coder mode** the user flips into from inside Noor:

- **Entry:** a segmented mode switch in Noor's header — `Noor | Coder β`.
- **Everyone sees the switch, free included — but free is locked.** The
  `Coder β` segment is visible to all desktop users; free users get a
  gate card ("Noor Coder is in beta and needs a paid plan") with a View
  plans button → `/pricing`. Paid tiers see the beta-access card. Beta
  messaging ships everywhere: plan perks (`PAID_PLANS` → in-app billing,
  pricing page, plan intro), landing ribbon + Noor card, what-is-orleia
  FAQ, refund + terms policies.
- **Daily usage limits identical in size to Noor's** (`CODER_DAILY_LIMIT`:
  free 0 / plus 300 / pro 1000 / ultra ∞).
- **Desktop only:** the switch and the mode itself exist at `lg+`
  (min-width 1024px) only. On mobile and tablet Noor is untouched — no
  switch, no Coder route, no deep-state activation. Enforced twice:
  CSS (`hidden lg:flex` on the switch) **and** a `matchMedia("(min-width:
  1024px)")` guard in the mode hook so nothing leaks below `lg`.
- **Completely different UI/UX while active:** dark editor canvas,
  monospace type, gutter-less code-first transcript, file/snippet blocks
  with copy buttons, "Run / Explain / Debug / Test" quick actions, token
  counter, no pet/wellness chrome. Same shell, unmistakably a different
  tool.
- **Foggy fade transition:** switching modes is a ~500ms crossfade through
  fog — outgoing surface fades + `blur(0→14px)`, a veil layer peaks at
  mid-transition (`backdrop-filter: blur(14px)` + white/dark wash), then
  the incoming surface resolves `blur(14px→0)`. Implemented with the
  already-installed framer-motion (`AnimatePresence`, mode="wait") plus a
  CSS veil element. `prefers-reduced-motion` → plain 150ms opacity fade.

---

## 2. What already exists (the expensive parts are built)

| Piece | Where | Reused how |
|---|---|---|
| Noor page as host | `src/app/(app)/noor/page.tsx` (3,281 lines) | Mode state + header switch live here; Coder mode is a sibling view, not a route |
| Chat SSE streaming | `src/lib/ai-stream.ts`, `/api/chat` | Same plumbing, coder model + coder system prompt |
| Daily-cap billing | `src/lib/plans.ts`, `billing-store.ts` `checkLimit()` | Add `CODER_DAILY_LIMIT` + `channel: "coder"` |
| Tier license (free/plus/pro/ultra) | `billing-store.ts` | Gate the switch (UI) and the route (API) |
| NIM provider fallback | `src/lib/ai-provider.ts` | Coder model + sibling fallback chain |
| Model allowlist | `/api/chat` `ALLOWED_MODELS` | Add coder ids (or new `/api/coder`) |
| Cap UX | "messages left today" banner, `NoorCapError` | Same banner, coder channel |
| Animation stack | framer-motion 11 / motion 13, existing nav transitions | Foggy fade |
| Security posture | `SECURITY.md`, `jailbreak-guard.ts`, markdown w/o `rehype-raw` | Applies unchanged |

Explicitly **not** in v1: agent execution (workspace tools), file upload,
local Ollama coder models — phases 3–4.

---

## 3. UX spec (the "completely different" part)

| | Noor mode | Coder mode |
|---|---|---|
| Canvas | light/dark app theme, card surface | deep editor dark, `bg-zinc-950` feel, code-green/amber accents |
| Type | app sans | JetBrains Mono (already bundled) for transcript chrome; prose stays readable |
| Composer | rounded pill, voice, images | square editor input, language tag, `⏎ to run` hint |
| Messages | chat bubbles, pets, warmth | terminal-style blocks: prompt `›`, responses in panes, code blocks with line numbers + copy |
| Quick actions | suggestions chips | Run / Explain / Debug / Write test |
| Empty state | Noor greeting | "Paste an error, a function, or a repo question" |
| Billing chip | N messages left today | same counter, coder channel |

Transcript histories stay separate (`orleia.coderChat.v1` vs Noor's key).

---

## 4. Billing (decided: same numbers as Noor, separate counter)

| tier | Noor | Coder |
|---|---|---|
| free | 30/day | **0 — switch hidden, API 403 `coder_tier_locked`** |
| plus | 300/day | 300/day |
| pro | 1000/day | 1000/day |
| ultra | ∞ | ∞ |

- Separate `channel: "coder"` counter in `checkLimit()` — a coding session
  must not silently drain chat quota. Server-enforced; `billingConfigured()`
  still skips enforcement pre-launch (same as Noor).
- Pricing copy: add one perk line per tier when shipping ("N Coder messages
  daily"), or generalize "Noor messages" → "AI messages" in `PAID_PLANS`.

---

## 5. Model (NVIDIA NIM)

- Candidates (verify exact ids on build.nvidia.com at implementation —
  NIM ids churn):
  - Primary: **Kimi K2.5/K2.7-class instruct** (`moonshotai/kimi-*`).
  - Sibling fallback: **Qwen3-Coder-480B**.
  - Last-resort fallback: existing Novella model (degraded but alive).
- Env-driven: `CODER_MODEL_PRIMARY` / `CODER_MODEL_FALLBACK` — model swaps
  must never need a redeploy.
- Add ids to the server allowlist; extend the `THINKING` map only if the
  endpoint supports `enable_thinking` (measured live).

---

## 6. API shape

- **New `/api/coder`** (mirrors `/api/chat`): coder allowlist, tier gate
  (403 for free), `CODER_DAILY_LIMIT` on the coder channel, coder system
  prompt, same `ai-provider` call + SSE.
- Rejected: `mode:` flag inside `/api/chat` — keeps Noor's hot path and
  caps untouched while Coder evolves.

---

## 7. Phases

- **P1 — the mode (shippable v1):** mode state + header switch in Noor,
  foggy-fade transition (framer-motion + veil, reduced-motion fallback),
  `lg`-only gating (CSS + matchMedia), Coder UI/UX surface, `/api/coder`,
  `CODER_DAILY_LIMIT`, NIM coder model + fallback, separate transcript
  store, i18n, SW bump → tsc gate → commit → deploy.
- **P2 — code-native depth:** file/selection context attach, snippet →
  Notes, effort presets, prompt library per language.
- **P3 — Coder Agent:** `agent-loop.ts` with `workspace_*` tools scoped to
  a user-granted folder, confirm chips, receipts (Codex-like).
- **P4 — everywhere:** local Ollama coder models as a free Local-AI option;
  desktop `workspace_exec` via the Electron bridge.

---

## 8. Open questions

1. Desktop gate: `lg` (1024px) — is that the line you want, or `xl`?
2. Separate counter (recommended) vs shared pool with Noor.
3. Coder mode persists across sessions (reopen in Coder) vs always opens
   in Noor mode?
4. Final model pick after probing build.nvidia.com.

## 9. Kill metrics (pre-registered, PET_AGENT_PLAN discipline)

- P1: mode-switch rate among paid users + coder messages/day vs cap usage.
- If <5% of paid users flip to Coder within 2 weeks → rework entry point
  and empty states before investing in P3.
