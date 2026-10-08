# FIndress — prompts to paste into Claude Code

Paste **Prompt 0** first. When Claude Code finishes a phase it pushes to GitHub and stops; then paste
the next phase prompt. If a session gets long, start a fresh one with `/clear` and paste the next
phase — `CLAUDE.md` and `docs/` carry the context.

---

## Prompt 0 — Kickoff (paste this first)

```
You are building FIndress, my personal AI/ML conference & workshop explorer. Read CLAUDE.md,
docs/SPEC.md and docs/DESIGN.md fully before doing anything. They are the source of truth.

How I want you to work:
1. First, give me a short build plan for the phases below and list any questions that would change
   the architecture. Then wait for my "go".
2. Build phase by phase. After each phase: run pnpm build (and tests), commit with clear messages,
   push to origin main, then summarize what you built, what I should check on the Vercel preview, and stop.
3. Before writing a data adapter, actually fetch the upstream source and inspect real files; write
   fixtures from them and test the normalizer. Never invent data.
4. The design must match docs/DESIGN.md. After building any page, run the dev server, take screenshots
   (Playwright) in dark and light at 390px and 1440px, critique them against the brief, and fix what's off.
5. If anything needs me (env vars, Vercel/Neon setup, API keys, gh auth), tell me exactly what to do
   step by step, then continue.

Phases:
1. Foundation
2. Data ingestion
3. Explorer + detail pages
4. Insights dashboard + landing page
5. AI assistant
6. Workspace + access gate
7. Polish, tests, README, launch check

Start with the plan.
```

---

## Phase 1 — Foundation

```
Phase 1: Foundation.
- Scaffold Next.js (App Router, TS strict, src/ dir) with pnpm, Tailwind, shadcn/ui, Framer Motion,
  ESLint, Prettier, Vitest, Playwright.
- Implement the design system from docs/DESIGN.md: CSS variable tokens for dark + light, fonts
  (Instrument Serif, Geist Sans, Geist Mono via next/font), theme toggle, base components
  (Button, Badge/Chip, Card, Sheet, Command palette shell, Skeleton, CountdownChip with the heat scale).
- App shell: top nav (FIndress wordmark, Explore, Insights, Workspace, Sources, ⌘K), footer, ambient background.
- Drizzle + Neon setup per SPEC §9 with migrations; .env.example with every variable.
- A /styleguide page showing all tokens and components in both themes.
- Commit, build, push. Tell me how to connect the repo to Vercel and add Neon from the Vercel Marketplace.
```

## Phase 2 — Data ingestion

```
Phase 2: Data ingestion (SPEC §5).
- Build the adapter framework, then adapters in this order: ccfddl, Hugging Face ai-deadlines,
  WikiCFP RSS (+ polite event-page enrichment), OpenReview enrichment, CFP page text extraction,
  keyword topic tagging. Inspect each real upstream source first; save fixtures; unit-test normalizers.
- Dedupe/merge across sources with per-field provenance; AoE/timezone handling tested.
- Geocoding with cache. source_runs logging.
- scripts/ingest.ts (pnpm ingest), /api/ingest?source= protected by CRON_SECRET, vercel.json daily cron,
  .github/workflows/ingest.yml every 6h.
- Run ingestion locally against my Neon DB and report counts per source, number of workshops, and
  10 sample upcoming deadlines so I can sanity-check them.
- Commit, build, push.
```

## Phase 3 — Explorer + detail pages

```
Phase 3: /explore and /c/[slug] exactly as SPEC §3 and §4, styled per DESIGN.md.
- URL-synced filters, list/cards toggle, virtualized rows, side-sheet preview, keyboard shortcuts,
  live countdowns, timezone conversion (default Asia/Kolkata), .ics export, command palette search.
- Detail page: timeline ribbon, CFP section with topic chips, workshops, history/acceptance stats,
  sources. Leave a placeholder column for the AI assistant.
- Empty/loading/error states. Screenshot review in both themes and both widths; fix issues.
- Commit, build, push.
```

## Phase 4 — Insights + landing

```
Phase 4: /insights and the landing page /.
- Insights per SPEC §2 and DESIGN.md charts section: 12-month deadline heatmap, events per month by
  subfield, world map of venues, rank mix, acceptance-rate trends, topic trends. Every chart filterable
  by subfield and clickable through to /explore with that filter applied.
- Landing: cobe globe with upcoming venue points, next-5-deadlines strip, stats, quick search.
- /sources page with live source health and "Refresh now" (owner only, wire to gate in phase 6).
- Screenshot review; commit, build, push.
```

## Phase 5 — AI assistant

```
Phase 5: "Ask FIndress" assistant per SPEC §6.
- Vercel AI SDK streaming chat; provider/model from env in src/lib/ai/model.ts (default Anthropic).
- Grounded system prompt with the event record + CFP text (chunk and pick relevant parts when long)
  + workshops. Tools: getEvent, searchEvents, fetchPage (domain allow-list), searchArxiv.
- Docked panel on /c/[slug] (bottom sheet on mobile) with suggested prompts including
  "Elaborate the problem statement"; global assistant on /explore and in the command palette.
- Citations as source pills; markdown + math rendering; chat history saved per event; rate limit + token cap.
- Test it on ICML, NeurIPS and one small workshop: show me the answers to "Elaborate the problem
  statement" so I can judge grounding quality.
- Commit, build, push. Tell me which env vars to add in Vercel.
```

## Phase 6 — Workspace + access gate

```
Phase 6: SPEC §8 access gate and /workspace.
- APP_PASSWORD unlock page, signed cookie, middleware protecting workspace, chat, notes, refresh.
- Bookmarks with status pipeline (Kanban drag-and-drop), markdown notes per event with autosave,
  combined .ics feed of all bookmarked deadlines, "my upcoming deadlines" timeline.
- Commit, build, push.
```

## Phase 7 — Polish & launch

```
Phase 7: Polish and launch check.
- Lighthouse on /explore (mobile) ≥ 90 perf and a11y; fix regressions.
- Full keyboard and screen-reader pass; reduced-motion pass.
- Final screenshot review of every page in both themes; tighten spacing, typography and motion.
- README with screenshots, architecture diagram, env vars, ingestion docs and the public /api/events
  docs (for optional OpenCode/agent use later).
- Verify the production deployment on Vercel: cron registered, ingestion ran, chat works.
- Commit, build, push, and give me a final checklist.
```
