# Pet Agent Plan — "always-on agents as the pets"

Status: DECIDED DIRECTION (user-validated) — no code written yet.
Date: Oct 1, 2026
Context: OpenAI DevDay 2026 (Sep 29) launched **Dots**; Meta launched **Muse**;
the Verge named the category "AI Tamagotchis". Orleia enters with a two-agent
architecture that is genuinely different: **Noor = operator, Pets = agents.**

---

## 1. Competitor teardown (what we learned)

| Product | Always-on? | Runs where | Avatar | Autonomy | Price | Weak spot |
|---|---|---|---|---|---|---|
| **OpenAI Dots** | yes, own cloud computer + browser | cloud | cute, customizable | high (4,000 apps, learns preferences) | paid tiers first | cloud permissions = trust surface; agent-hack headlines are the industry's open wound |
| **Meta Muse** | yes | cloud | cute, text-like chat | high | free | same trust surface |
| **Grok Bot** | yes | cloud | ? | high | ? | same category race |
| **Claude Cowork** | scheduled + chat | cloud + chat | none | connectors, skills, schedules | paid | no avatar/heartbeat; feels like a worker, not a companion |
| **OpenClaw** (OSS) | yes | user's machine | none | very high | free | power-user only; "serious security risks" per press |

**The pattern:** everyone races to give ONE cloud agent MORE access, MORE apps,
MORE autonomy — and takes the backlash for it (protests at DevDay, Altman
deferring IPO over safety claims).

---

## 2. The Orleia architecture (decided with user)

Two distinct agent tiers — this is the differentiator:

- **Noor = the Operator** (Notion-AI style). Sits above the whole workspace:
  answers, coordinates, delegates, manages the big picture. Free/standard
  product. Confirm-chips stay the interface for anything it proposes.
- **Pets = full Agents.** The user *hires* pets into roles from a **Job
  Catalog**. Each hired pet is a real agent: web tasks, real work, multi-step
  jobs (the agent-loop.ts brain already exists) — wrapped in our philosophy:
  show its work, confirm anything risky, earn autonomy over time.

**Positioning:** *Noor runs your workspace. Your pets run your errands.*

**Philosophy vs. Dots/Muse (our wedge):** local-first data (the only agent that
can't leak your workspace), visible work (chips/logs of what the pet did),
earned autonomy (trust ladder), cute-but-accountable (every job has receipts).

---

## 3. Flop-mode analysis (why agent products die, and our counter)

| # | How agents flop | Our structural counter |
|---|---|---|
| 1 | Destructive mistakes | Confirm-by-default; destructive types (delete_*) NEVER autonomous; receipts for every pet action |
| 2 | Cost blowup | Local rules for sensing; LLM only on hired-job work; jobs are capped-duration like agent-loop (5 turns / 3 min budget) |
| 3 | Notification fatigue | A hired pet works when dispatched/on triggers, doesn't spam; quiet hours (pet already sleeps 23–5) |
| 4 | Novelty toy, no utility | Catalog = concrete jobs with outcomes (cleaner, planner, reviewer, researcher), not vibes |
| 5 | Trust scandal | Local-first + visible receipts = provable story |
| 6 | Big-bang flop | Staged rollout below; every stage shippable and killable |

**Kill metric (pre-registered):** per-job hire retention + acceptance rate.
If a catalog job shows <20% acceptance (proposals) or is unhired after 2 weeks
of exposure → rework or delist.

---

## 4. The Job Catalog (v1)

Pets are hired into **roles** (user picks which + how many, within plan limits).
Each role = trigger set + capability set + its own agent-loop budget.

**Catalog v1:**
1. **Wrangler** (housekeeper) — overdue task sweeps, reschedule proposals →
   confirm batch. Local, deterministic, near-zero cost.
2. **Scout** (researcher) — "watch this topic / find me X", web_search +
   read_url via existing agent tools, digest delivered as a note/card.
3. **Planner** — builds today's plan (Morning Huddle) from tasks+habits+events;
   propose the day, one tap to apply.
4. **Auditor** (reviewer) — weekly review: stats recap + draft review note
   (create_note chip).

**Later / gated:** Inbox assistant (once email surfaces exist), File butler
(workspace_* jobs), Cross-pet delegation (Noor assigns jobs to pets).

## 5. Monetization: Pet Agents are PAID (decided)

- Hiring a pet agent = paid feature, mapped to existing tiers
  (`billing-store.ts`: free | plus | pro | ultra).
- **Slot model (recommended):** Plus = 1 pet slot, Pro = 3, Ultra = unlimited +
  priority model access. Catalog roles themselves included; slots are the limit
  (simple to explain, easy to upsell "hire another pet").
- Free tier: pets stay cosmetic + Noor operator intact — the upgrade path is
  "your pet can actually WORK for you", which is the strongest upsell surface
  we've ever had (better than message caps).
- Enforcement mirrors Noor cap: server check on billing tier when a job runs
  via API; local graceful degradation (pet shows "needs Plus" chip) when the
  device can't reach billing.

## 6. Trust ladder (the retention mechanic nobody else has)

- **L1 Suggest** (default everywhere): proposal card, one tap.
- **L2 Batch-act**: multi-action proposals behind one confirm (earned by trust
  points from accepted proposals).
- **L3 Autopilot** (per-role, harmless actions only, user-granted, default OFF):
  e.g., Wrangler auto-snoozes overdue → tomorrow, logs receipts.
- delete_* / destructive: confirm-forever, hard rule, never autonomous.
- Every proposal gets 👍/👎; 👍 accrues trust, 👎 lowers sensitivity.
- Line: *"Your pet doesn't get more power. It earns your trust."*

## 7. Architecture (fits existing code)

```
src/lib/pet-agent.ts         NEW  role definitions, triggers, evaluators,
                             dispatch (wraps runAgentLoop for Scout-type jobs)
src/lib/pet-jobs.ts          NEW  catalog + slot entitlement checks
src/components/layout/
  PetReactions.tsx           UPGRADE cosmetic toasts → proposal cards
                             (confirm/dismiss run executeAction pipeline)
src/app/(app)/habits or
  new pets/ surface          Pet home: roster, hire flow (catalog), receipts,
                             trust meter, per-pet toggles
src/lib/storage.ts           ADD petAgents: roster[] {petId, role, autonomy,
                             trust, metrics}, receipts[], seen-flags
src/lib/billing-store.ts     REUSE tier check → slot entitlement
src/lib/ai-actions.ts        REUSE ProposedAction + executeAction
public/sw.js                 BUMP v32 on ship
```

Triggers: app open / visibilitychange / storage subscribe (debounced) — no
background timers in v1. Pet jobs run in-tab with the agent-loop budget
(5 turns / ~3 min), abort-signal aware.

## 8. Rollout (each step shippable + deployable on its own)

| Stage | Contents | Size |
|---|---|---|
| **S1 "Hire your first agent"** | Catalog UI + Wrangler role (local, deterministic) + proposal cards + receipts + slot entitlement (Plus=1) | 1–2 sessions |
| **S2 "It plans"** | Planner role (Morning Huddle) + trust points + 👍/👎 | 1 session |
| **S3 "It works the web"** | Scout role on agent-loop (web_search/read_url → digest note) + Auditor weekly review | 1–2 sessions |
| **S4 "It reaches out"** | Morning push (VAPID), per-role autopilot (L3), more catalog | metrics-gated |

## 9. Decisions already made

- Noor stays operator (Notion-AI style) — pets do NOT replace Noor chat.
- Pets = full agents (web tasks, real work) inside our confirm/receipt philosophy.
- Paid: pet agent slots on Plus/Pro/Ultra via existing billing tiers.
- Pet-Noor persona chat: PARKED (user unsure) — revisit after S2.
- Autonomy: user unsure → default confirm-first, autopilot deferred to S4
  behind metrics (safest reading of "idk").
