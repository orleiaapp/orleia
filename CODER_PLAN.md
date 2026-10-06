# Coder Plan — "Orleia's coding tool, its own tab"

Status: PLAN ONLY — no code written yet.
Date: Oct 6, 2026
Analogy: ChatGPT ↔ Codex, Claude ↔ Claude Code — one product, a dedicated
coding surface with its own model, quota, and (later) its own agent powers.

---

## 1. What we're building

A first-class **Coder** tab in the Orleia app shell (same nav group as
Tasks / Notes / Mindfulness), gated to **Plus, Pro, Ultra**, with daily usage
limits mirroring Noor's, powered by a coding model from NVIDIA NIM.

User decisions (given):
- Separate tool in the nav — NOT a mode inside Noor.
- Name: **Coder**.
- Tiers: Plus / Pro / Ultra only (Free does not get it).
- Limits: "the same usage limits as Noor in billing" → same per-tier numbers.
- Model: a coder model from the NVIDIA NIM catalog (for now; plan only).

---

## 2. What already exists (everything expensive is already built)

| Piece | Where | Reused how |
|---|---|---|
| Nav rail + mobile nav | `src/components/layout/Sidebar.tsx` `navItems`, `MobileNavScreen.tsx` | One new entry + i18n keys |
| App route shell | `src/app/(app)/…` (tasks, noor, notes…) | New `src/app/(app)/coder/page.tsx` |
| Daily-cap billing | `src/lib/plans.ts` `NOOR_DAILY_LIMIT`, `src/lib/billing-store.ts` `checkLimit()` (UTC date key, `billingConfigured()` gate) | Add `CODER_DAILY_LIMIT` + a `channel` param |
| Tier source of truth | `billing-store.ts` license (free/plus/pro/ultra) | Same license, gate in UI + API |
| Chat SSE streaming | `src/lib/ai-stream.ts` + `/api/chat` | Point at coder model + coder system prompt |
| NIM provider fallback | `src/lib/ai-provider.ts` (sibling chain, health marks, 4-hop retry) | Add coder model + one sibling fallback |
| Model allowlist | `/api/chat` `ALLOWED_MODELS` | Add coder model id (or new allowlist in `/api/coder`) |
| Cap UX | Noor "messages left today" banner, `NoorCapError` | Same banner, coder channel |
| Security posture | `SECURITY.md`, `jailbreak-guard.ts`, react-markdown without `rehype-raw` | Applies unchanged |

Explicitly **not** in v1: agent execution (workspace tools), file upload,
local Ollama coder — phases 3–4 below.

---

## 3. Decisions (recommended)

### 3.1 Nav & route
- New route `src/app/(app)/coder/page.tsx`; entry in Sidebar `navItems`
  (icon `Code2` from lucide) placed right after Noor; same entry in
  `MobileNavScreen`; secondary group on collapsed rail mirrors Noor's.
- i18n: add `nav.coder` + page copy to all languages in `src/lib/i18n.ts`
  (en/es/fr/de/pt).
- `.orleia-notes-root`-style takeovers: Coder is a normal page inside the
  card — no full-screen takeover, so the desktop-softlock class of bug
  doesn't apply.

### 3.2 Billing gate
- `CODER_DAILY_LIMIT: Record<Tier, number>` in `plans.ts`:

  | tier | Noor (today) | Coder (planned) |
  |---|---|---|
  | free | 30 | **0 (no access)** |
  | plus | 300 | 300 |
  | pro | 1000 | 1000 |
  | ultra | ∞ | ∞ |

- **Recommendation: separate counter, identical numbers.** Sharing Noor's
  counter would mean a coding session silently drains chat quota; a separate
  `channel: "noor" | "coder"` key in `checkLimit()` keeps the story simple
  ("Coder has its own daily limit, same sizes as Noor"). One-line change
  later if we ever want a shared pool.
- Server-enforced in the coder API route (same pattern as `/api/chat`);
  `billingConfigured()` still skips enforcement pre-launch.
- Free tier UX: **show the tab with a lock** → opens the existing plan intro
  dialog (keeps Coder discoverable as an upgrade hook).
- Pricing copy: `plans.ts` perks say "300 Noor messages" — add one perk line
  per tier ("N Coder messages") when we ship, or generalize to "AI messages".
  Landing/pricing pages must stay in sync (single source is `PAID_PLANS`).

### 3.3 Model (NVIDIA NIM)
- Candidates from the live NIM catalog (verify exact IDs on
  build.nvidia.com the day we implement — IDs change; forum reports
  K2.6 removals/removals happen):
  - Primary: **Kimi K2.5/K2.7-class instruct** (`moonshotai/kimi-*`) —
    strongest open coding/agentic model on NIM per current reports.
  - Sibling fallback: **Qwen3-Coder-480B** (`qwen/qwen3-coder-480b-a35b-instruct`).
  - Secondary fallback: existing Novella model (degraded but alive — matches
    the "one dead model must not kill the feature" rule in `ai-provider.ts`).
- Env-driven: `CODER_MODEL_PRIMARY` / `CODER_MODEL_FALLBACK` so model swaps
  never need a redeploy (matches existing env-price-ID philosophy).
- Add chosen ids to the server allowlist; extend the `THINKING` map only if
  the endpoint supports `enable_thinking` (measured live, per ai-provider).

### 3.4 API shape
- **New `/api/coder` route** (mirror `/api/chat`): coder allowlist, tier
  gate (403 `coder_tier_locked` for free), coder channel cap
  (`NoorCapError`-style error code reused), server-side coding system prompt,
  then the same `ai-provider` call + SSE.
- Alternative considered: `mode: "coder"` inside `/api/chat` — rejected;
  separate route keeps the Noor gate untouched and lets Coder evolve
  (context files, agent tools) without touching Noor's hot path.

### 3.5 Client / UX
- New page modeled on Noor's chat structure (transcript, composer,
  streaming, effort slider) but distinct identity: Code2 icon, code-first
  empty states ("Debug this error", "Explain this function", "Write a test"),
  language-tagged code blocks (renderer already exists), copy-code button.
- Reuse `ai-stream.ts` SSE plumbing with the coder model + cap banner
  ("N Coder messages left today").
- Conversation storage: separate local key (e.g. `orleia.coderChat.v1`) so
  Coder history never collides with Noor's.

---

## 4. Phases

- **P1 — the tab (shippable v1):** route + nav + i18n, `/api/coder`,
  `CODER_DAILY_LIMIT` + channel cap, NIM coder model + fallback, chat UI,
  lock UX for free tier, SW bump → tsc gate → commit → deploy.
- **P2 — code-native UX:** attach file/selection as context (copy-paste →
  structured snippet blocks), "save snippet to Notes" action, effort
  presets per coder model, prompt library per language.
- **P3 — Coder Agent:** reuse `agent-loop.ts` with `workspace_*` tools
  scoped to a user-granted folder (plan → read → edit → observe), confirm
  chips for writes, receipts. This is where Coder stops being a chat and
  starts being Codex-like.
- **P4 — everywhere:** local Ollama coder models (`qwen2.5-coder`) as a free
  Local-AI option, and desktop `workspace_exec` (run tests) via the Electron
  bridge — the local-first wedge from the agent discussion.

---

## 5. Open questions (small, need user call before P1)

1. Shared counter with Noor vs separate (recommend: separate, same sizes).
2. Free tier: locked-visible tab (recommended) vs hidden entirely.
3. Coder messages in marketing copy: "N Noor messages" → generalize?
4. Final model pick after probing build.nvidia.com live catalog.

## 6. Kill metrics (borrowed from PET_AGENT_PLAN discipline)

- P1 success: Coder DAU among paid tiers + messages/day vs cap usage.
- If <5% of paid users touch Coder in 2 weeks post-launch → rework entry
  points (empty states, prompt library) before investing in P3.
