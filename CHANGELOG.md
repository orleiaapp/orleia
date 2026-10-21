# Changelog

All notable changes to Orleia are documented here.

## Unreleased — October 14–17, 2026 (on master, ships with the next release)

### Navigation rework
- **Bottom primary nav on mobile** — dashboard, habits, journal, tasks and Noor live in a bottom bar; tabs merged, sidebar slimmed. The desktop sidebar was restored to its original form, so the redesign is scoped to mobile/portrait only.
- **Richer mobile sheet** — tools row sits higher, the Noor typing pill lower, pills spaced wider apart.

### i18n
- **10 complete languages, 9 broken ones removed** — every language now carries the full 1,338-key set (English, Spanish, French, German, Portuguese, Italian, Polish, Japanese, Chinese, Russian). Key parity is now enforced by `npm test` in CI, so a missing translation can never silently fall back to English again.

### Security & accounts
- Hardened **SSRF-safe fetching**, constant-time secret comparisons, and the push-notification endpoints.
- **One-time redeem codes** — mint endpoint, admin generator, and redemption flow for gifting Plus/Pro/Ultra.

### Fixes & polish
- Fixed **image generation and vision analysis** (both were returning failures).
- Fixed billing deep-links, the literal `\n` junk in Supabase billing env values, and Notes links pointing at `/documents`.
- **Pets rendered with volumetric shading** instead of flat fills; the plans takeover now plays right after the pet confetti (3 slides, before the pet pick).
- Onboarding: simplified goals step ("Something else" is a reveal link), feature swirl removed.
- The standing **ship loop** (typecheck → build → commit → push → deploy → verify) is now recorded in `AGENTS.md`.

## v2.7.0 — October 10, 2026

- **Constellation theme** with a visual picker (plus the onboarding welcome redesigned as a live starfield — wobble, twinkle, meteors).
- **Proof-of-privacy onboarding** — a live outbound-bytes counter that shows the claim, plus goals and acquisition-source steps and a rebuilt slide-by-slide tour.
- **Confetti send-off** when you adopt your pet.
- **Noor chat quality overhaul** — replies continue instead of cutting off, truncated actions are rescued and really run, local search stays local, and leaked model reasoning never reaches your thread.
- **Full-screen message editing** on mobile; Mindfulness controls moved to the bottom on mobile so nothing overlaps.
- **Noor Coder built out, then hidden** — whole-project scaffolds, background runs, Plan/Build modes, token billing and real PC writes shipped to beta, then the switch was hidden everywhere pending a redesign that fits the Orleia vibe (Vercel's 300s function limit was killing scaffolds mid-generation).
- **Skills** instructions grew 16×; the language switch (explicit English pick) is fixed.
- Projects retired product-wide (schema kept so it can return).
- Fixes: ignored reduced-motion, settings card blink, late starfield paint, desktop notes softlock, mobile top-bar/reminders overlap.

## v2.6.0 — October 4, 2026

- **Novella 5.0 — one model, six effort levels** (Hyperfast, Low, Medium, High, Max, Ultra) replace the Ethos/Logos/Verse tiers. Each level is a real preset: model, temperature, token budget, history depth and thinking mode, exposed through a new **effort slider**.
- **Pets on duty 24/7** — hire pets as always-on agents (paid slots, confirm-first proposals), Scout runs web research jobs, the Planner holds huddles, and **Pets Chat** gives every hired pet its own WhatsApp-style thread with @mention routing into Noor.
- **Research replies with cited sources** — compact clickable source links in Markdown surfaces.
- **Grid retires for now** (spreadsheet removed product-wide; landing links and policy pages refreshed).
- Under the hood: **model fallbacks hardened** (the cycle reaches all three NIM models, so no single dead endpoint can take down AI), a **daily AI health probe** cron, Noor chat rows no longer nest buttons, and the mobile top-bar stays pinned when the nav sheet opens.
- Dashboard greets you casually by name; onboarding reordered to welcome-first with a value-first paywall and Noor confirm chips.

## v2.5.0 — September 17, 2026

- **Orleia Plus, Pro and Ultra launch** — optional subscriptions raise the daily Noor AI message limit (Free 30 / Plus 300 / Pro 1,000 / Ultra unlimited), managed in Settings → Billing, yearly saves 20%. Every local tool stays free forever.
- **Orleia Spark** enters the repo — the "private browser with a brain": default-browser registration, launch-URL handling, a full settings surface and a working light theme + accent.
- **Pets across the web app** — pet surfaces on Habits, Dashboard and Noor; the pet widget is default for new users.
- **Translation fill** across the whole language set with a dedicated English-echo elimination pass, plus a language picker in Settings and hardened i18n tooling.
- **Mobile/iOS polish** — iOS under-sheet nav with a true under-reveal, frosted nav blur, pill tabs, Apple-style Notes rework, full-screen camera, no-bubble Noor replies and a reworked image preview.
- Landing: trust bar, why-us and pricing sections; "Most popular" unified through `plans.ts`.
- Git hooks now auto-install on `npm install`; the secret scanner's matching bug was fixed.

## v2.2.0 — Orleia Office — September 9, 2026

### New: Orleia Office suite
- **Tools is now Office** — renamed across the sidebar (desktop + mobile) in all shipped languages, with a Briefcase icon. Existing tool names (Notes, Documents, Grid, Deck) are unchanged.
- **Calendar** (new app) — month and week views, events with time/color/notes, daily/weekly/monthly recurrence, drag-to-reschedule, tasks with due dates shown automatically, day detail panel, and a **Noor weekly planner** that reads your open tasks and habits and drafts a day-by-day plan.
- **Forms** (new app) — question builder (text, multiple choice, checkboxes, rating, date), required-field validation, shareable links, in-app fill mode, per-question response charts, and CSV export. **Noor generates entire forms** from a one-line description.
- **Board** (new app) — freeform whiteboard with sticky notes (draggable, editable, 5 colors), freehand pen, rectangles, ellipses, and arrows on a dot grid. **Noor brainstorm** scatters AI idea stickies onto the board from a prompt.

### Upgraded tools
- **Documents** — new **Noor writing assistant** (select text or place the cursor: Continue / Improve / Summarize, then insert or replace inline) plus **Markdown import and export** with a purpose-built converter (headings, tables, code blocks, task lists, blockquotes, images).
- **Grid** — column **sorting** (asc/desc toggle per column) and **row filtering** (display-only, never mutates data), **bar/line/pie charts** rendered live from any label+value column pair, a new **AVERAGEIF** formula, and a **Noor formula helper** that turns plain language into a formula (aware of your sheet's actual contents) and can insert it into the selected cell.
- **Notes** — **markdown formatting toolbar** (bold, italic, headings, lists, checklists, quotes, code) with **live split preview**, star/favorite toggle, and **.md export**.

### Noor
- Workspace context now includes calendar events, forms, and boards.
- New actions: "schedule a meeting friday" → creates an event (parses dates and times), "create a feedback form" → creates a form, "new whiteboard for the kitchen" → creates a board.

### Infrastructure
- Version 2.2.0 across Settings, update checker, SEO metadata, and version.json.
- New routes verified: /calendar, /forms, /board.

### Noor (Aug 31 – Sept 6)
- **Fast Mode is actually fast now** — Verse 4 moved from the 120B Logos model to `nemotron-3.5-lightning-30b-a3b` (3B-active MoE) with thinking mode disabled at the template level. Measured time-to-first-token drops from ~6.7s to ~0.8s.
- **Live streaming replies** — Tokens now render into the thread as they arrive, with a blinking caret, instead of appearing only after the full response completes. Applies to every model.
- **Smarter fallbacks** — Lightning falls back to Super, Super falls back to Lightning before Ultra.
- **Web Search 2.0 fixes** — Added Google News + Bing News RSS engines, freshness-intent routing, homepage poison filter, null-result guard, and headline-as-evidence synthesis so research mode answers current-event questions correctly.

### Workspace (Aug 31 – Sept 6)
- **Modal fog fixed** — Every dialog overlay raised from z-50 to z-90 so it covers the mobile top bar, reminders, and toasts; fog darkened from black/50 to black/70 with a stronger blur.
- **Working keyboard shortcuts** — Ctrl+K global search (GlobalSearch now mounted app-wide), Ctrl+Shift+N new note, Ctrl+Shift+T new task, Ctrl+Shift+H new habit, Ctrl+B toggle sidebar, Ctrl+, settings. Deep links via ?new=1.
- **Settings cleanup** — Removed "How do you want to use Orleia?" mode picker, Cross-Device Sync, Change Password, and Biometric unlock sections. Shortcuts section now shows web shortcuts on all platforms plus desktop global shortcuts where available.

## v2.1.3 — September 2, 2026

### Fixes
- **Fixed dashboard crash on app.lexisapp.xyz** — React rules-of-hooks violation where hooks were called after a conditional early return. Moved all hooks above the conditional to fix the "Something went wrong" error.

### Performance
- **Noor system prompt trimmed by ~40%** — Removed redundancy in SHARED_GUIDANCE while keeping all safety rules, action definitions, and behavioral instructions. Saves ~1,100 tokens per request, which means faster time-to-first-token.
- **Ethos context messages reduced from 40 to 24** — Matches Logos. Less context to process = faster responses.
- **Ethos max tokens reduced from 1600 to 1200** — Shorter max response length for faster generation.

### Cleanup
- Removed `/noor-brand` route (Noor brand page)
- Removed `/store` route (Flux store) and all product pages
- Removed `src/lib/flux-products.ts`
- Removed `src/middleware.ts` (subdomain routing for noor/store)
- Removed "The Orleia Ecosystem" section from landing page
- Removed Flux section from landing page
- Removed unused `SocialCards` import
- Bumped service worker cache to v7

## v2.1.0 — September 1, 2026

### Landing Page
- Interactive neural vortex hero background with WebGL
- Scroll-animated features section with dark night photos
- Elastic gallery for AI model cards
- Competitor comparison table
- Logo marquee with tech stack partners
- CTA with vertical marquee of Orleia features
- Interactive app preview (sandboxed workspace demo)
- Flux product carousel section

### Workspace
- Mobile top bar with hamburger, ORLEIA branding, and reminders icon
- Sidebar navigation with swipe gestures
- Thinking orb animation for Noor voice mode
- Border beam effect on Noor pill
- Custom fonts: Instrument Sans (headings), Fraunces (body)

### Noor AI
- Voice mode with tap-to-respond orb
- Image generation via NVIDIA
- Three models: Ethos 4.7, Logos 4.5, Verse 4
- Streaming responses

### Infrastructure
- Brand architecture: Orleia (workspace), Noor (AI), Flux (accessories)
- Vercel deployment with custom domains
- Service worker for offline support
