# Changelog

All notable changes to Orleia are documented here.

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
