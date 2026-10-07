# Coder Plan — "Coder mode inside Noor"

Status: **P1 SHIPPED** 2026-10-07 (rev 4). Mode + switch + server gate +
`/api/coder` + separate cap + foggy fade are live; P2–P4 pending.
Date: Oct 6, 2026 (rev 3 — free sees the switch but locked; labeled beta everywhere)

## 10. P1 implementation log (2026-10-07)

- **Gate is server-truth now.** The old client check (`billingConfigured()`
  in the browser) was always false — billing env never reaches the client
  bundle — so EVERY device saw the paid "beta arriving soon" card (the bug
  an ultra user reported as "it tells me I can't"). The switch now fetches
  `GET /api/billing/license`; `/api/coder` enforces 403 `coder_tier_locked`
  for free and 402 `coder_daily_cap`. Client gate fails open (network blips
  must not lock out payers); the server is the real gate either way.
- **Paid users enter the mode directly** — the "arrives soon" popover is
  gone (key `coder.soonBody` kept per the keep-schema-on-features rule).
- **Model:** `CODER_MODEL_PRIMARY` env, default
  `nvidia/nemotron-3-ultra-550b-a55b` (only nemotron endpoints answer on the
  current NIM key; kimi/glm return 403 until activated on build.nvidia.com —
  `FALLBACKS` entries are already wired so the walk lands on a live sibling).
- **Cap:** separate `channel: "coder"` counter = usage key `<deviceId>#coder`
  (works on both Supabase text keys and Blob; degrades coherently either way).
- **Quick actions deviation:** Explain / Debug / Write test / Refactor —
  no "Run" until a sandbox exists (P3). No token counter; server-truth usage
  chip instead.
- **Entry:** paid click = enter (foggy fade 2×250ms + veil peak, reduced
  motion → 150ms opacity-only); free click = lock popover. Always opens in
  Noor mode next session (open question 3 resolved: no persistence for v1).
- Transcript: `orleia.coderChat.v1` (localStorage, last 80 messages).
- **Rev 5 (2026-10-07, later):** visuals rebuilt on Noor's design tokens
  (forced mono/zinc/green dropped — same pill composer, bubbles, chips);
  the shared model + effort picker now drives Coder (allowlisted
  server-side, effort knobs = temperature/maxTokens/context); competitor
  feature pass (Claude Code / Codex / Antigravity / Freebuff):
  slash-command skills menu, thinking disclosure, retry-last-reply
  (/rewind-lite), starter cards, Esc = stop, conversation copy,
  one-click code-block copy, history capped to the effort profile.
  Default coding skills seeded once per device: Code review, Debug,
  Refactor, Write tests (editable/deletable like any skill).
  Deferred: plan mode, diffs, artifacts/preview, agent manager,
  local Ollama coder models (P2-P4).
- **Rev 6 (2026-10-07, later):** token economy + agency.
  - **Token budget replaces messages** (`CODER_DAILY_TOKENS`: free 0 /
    plus 500k / pro 2M / ultra ∞, counter `#coder`), checked pre-request
    (402 `coder_token_cap`) and charged post-reply from real usage;
    completion tokens are weighted by effort
    (`CODER_EFFORT_WEIGHT`, hyperfast 0.5 → ultra 2.5) so cost scales
    with effort/difficulty. Surface shows **% of today's tokens**.
  - **Web research:** a Web chip forces a server-side search for the
    prompt (also auto-fired for live queries); results are injected into
    the system prompt and returned as clickable **source chips** via an
    `orleia.sources` SSE frame (`orleia.usage` frame updates the % chip
    right after the charge).
  - **Multi-task queue:** prompts typed while a reply streams are queued
    (chip + clear) and drain in order when the reply settles; Stop/Esc
    aborts the stream AND empties the queue.
  - **Branches:** transcript store v2 (`orleia.coderChat.v2`) holds a
    thread tree — branch-from-any-message, thread switcher menu,
    per-thread delete; v1 migrates to a single thread.
  - **PC writes + terminal:** the model emits `orleia-action` fences
    (write_file / mkdir / shell) which render as action cards; the user
    connects ONE workspace folder (File System Access API, persisted
    handle) and applies writes directly to disk. Shell cards copy the
    command (browser can't execute) and every action lands in a
    terminal-style log panel.
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
- **Daily usage limits** — now TOKEN budgets, not message counts:
  `CODER_DAILY_TOKENS` (rev 6) replaced `CODER_DAILY_LIMIT` because
  message caps were trivially gameable with tiny prompts.
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
