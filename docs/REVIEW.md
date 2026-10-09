# FIndress — review notes & owner to-dos

## Verified locally (2026-10-09)

- Ingestion against a local Postgres (`pnpm db:local`): ccfddl 537 editions · Hugging Face 127 ·
  WikiCFP 189 · OpenReview 513 → **1,225 merged events (545 workshops)**, 670 with CFP text,
  1,098 geocoded, 2,018 deadlines, 313 acceptance-rate rows.
- Lighthouse (mobile) on `/explore`: performance 92, accessibility 100.
- 148 unit tests passing (`pnpm test`); production build passing (`pnpm build`).
- Owner flow (unlock → bookmark → Kanban → notes autosave → .ics feed) checked in a browser.
- Playwright smoke suite (`pnpm build && pnpm test:e2e`): 12/12 passing, desktop 1440 + mobile 390.
- Keyboard pass (automated, both themes): skip link is the first stop on every page, every focused
  control shows a visible focus ring and has an accessible name (labels via `<label for>`).

## Run once keys are added

1. **Neon:** add Neon in Vercel (Storage → Neon), then locally `npx vercel env pull .env.local`
   (or paste `DATABASE_URL` into `.env.local`), then:
   ```
   pnpm db:migrate
   pnpm ingest            # first run ~35 min (WikiCFP 5 s/page, CFP pages, geocoding)
   ```
2. **Anthropic:** set `ANTHROPIC_API_KEY` in `.env.local` and in Vercel. Then sample answers:
   `pnpm dev`, unlock at `/unlock`, open `/c/icml-2026`, `/c/neurips-2026` and a workshop
   (e.g. `/c/simbiochem-2026`) and click **"Elaborate the problem statement"**.
   (Not run here: no API key was available.)

## Blocked on you

- **Push:** `gh` is installed but not logged in → run `gh auth login`, then push (see below).
- **Vercel env vars:** `DATABASE_URL` (auto from Neon), `CRON_SECRET`, `APP_PASSWORD`,
  `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SITE_URL`. Copy the generated secrets from
  `.env.local` (never commit it).
- **GitHub Actions secrets:** `CRON_SECRET` and `SITE_URL` for `.github/workflows/ingest.yml`.

## Known limits / notes

- WikiCFP RSS is a rolling "latest 20 per category" window; coverage grows with each scheduled run
  (items are never pruned just for leaving the feed). WikiCFP dates have no timezone — shown as
  end of day AoE and labelled so.
- On Vercel Hobby each `/api/ingest` call has a 270 s budget; the GitHub Action runs one source per call.
- `ENABLE_LLM_TAGGING=true` re-tags untagged events each topics run (costs tokens).
- `NEXT_PUBLIC_SITE_URL` in `.env.local` is `http://localhost:3000` for dev; set the real URL in Vercel.
- Still worth doing by hand: a quick NVDA/VoiceOver listen-through, and the production deploy check
  (cron listed under Vercel → Settings → Cron Jobs, `/sources` shows fresh runs, chat answers) after
  the first deploy.

## Update 2026-10-09 — missing conferences fixed, journals added

### Root cause: "only workshops show up"

Nothing was wrong with ingestion. Every adapter's last run was OK, ccfddl and Hugging Face
normalize to `type = "conference"`, and the merge never overwrote a type (670 conferences vs
545 workshops in the DB). The cause was the **default "Hide passed deadlines" filter** in `/explore`:

- It hid every edition whose abstract/paper deadline had passed, even when the event itself
  was still ahead. In October that is every flagship: NeurIPS 2026 (December), ICLR 2027 (paper
  deadline Sep 26) and others.
- The next editions (ICML 2027, NeurIPS 2027) aren't in any source yet.
- OpenReview workshops have late-year deadlines, so the default view and searches were dominated
  by workshops. Searching "icml" or "iclr" returned 0 rows and "neurips" returned one workshop.
- My Phase 7 server-side prefilter applied the same rule, so search couldn't find them either.

**Fix** (`editionStatus()` in `src/lib/explore/filters.ts`, shared by the server prefilter, client
filters, sort and `/api/events`):

- The default view now hides only _past editions_.
- Closed calls for upcoming events stay listed ("call closed").
- The latest edition of every series stays listed for a year ("next edition TBA").
- The rail toggle now reads "Hide past editions".

Two data bugs found while checking dates:

- Hugging Face's `uai26` entry still carries 2025's dates. The merge now prefers a source whose
  start year matches the edition, so UAI 2026 shows Aug 18–20, 2026 (from ccfddl).
- ccfddl spells KDD 2027 as "SIGKDD". The merge now uses one display acronym per series.

Regression tests (`src/lib/ingest/conference-type.test.ts`, `src/lib/explore/filters.test.ts`) use
real ICML, NeurIPS, ICLR, UAI and KDD upstream files.

Flagship check after the fix (all appear in the default `/explore` with correct dates):

| Venue   | Edition shown | Dates                                                                 |
| ------- | ------------- | --------------------------------------------------------------------- |
| NeurIPS | 2026          | Dec 6–12, 2026 (call closed)                                          |
| ICML    | 2026          | Jul 6–11, 2026 (2027 not announced)                                   |
| ICLR    | 2027          | Apr 26–30, 2027                                                       |
| AAAI    | 2027          | Feb 16–23, 2027                                                       |
| IJCAI   | 2027          | Aug 7–17, 2027                                                        |
| CVPR    | 2027          | Jun 19–26, 2027                                                       |
| ICCV    | 2027          | Oct 2–8, 2027                                                         |
| ECCV    | 2026          | Sep 8–12, 2026                                                        |
| ACL     | 2027          | Aug 17–22, 2027                                                       |
| EMNLP   | 2026          | Oct 24–29, 2026                                                       |
| NAACL   | 2027          | Jun 1–5, 2027                                                         |
| KDD     | 2027          | Aug 1–5, 2027                                                         |
| AISTATS | 2027          | May 3–6, 2027                                                         |
| UAI     | 2026          | Aug 18–20, 2026                                                       |
| COLT    | 2027          | Jun 28–Jul 2, 2027                                                    |
| CoRL    | 2026          | Nov 9–12, 2026                                                        |
| WACV    | 2027          | Jan 4–8, 2027                                                         |
| BMVC    | 2026          | Nov 23–26, 2026                                                       |
| ECAI    | 2027          | Oct 2–7, 2027                                                         |
| ACML    | 2026          | **Not announced** — ccfddl (the only source) lists its dates as "TBD" |

### Counts after the full re-ingest (all 12 steps OK)

| Type       | In DB | Current editions* |
| ---------- | ----- | ----------------- |
| Conference | 670   | 172               |
| Workshop   | 546   | 222               |
| Symposium  | 10    | 8                 |

\*Event not yet over, or no dates known.

- **Events per source:** ccfddl 537 · OpenReview 514 · WikiCFP 171 · Hugging Face 127.
- **Events by type and source:**
  - Conferences: ccfddl 537, Hugging Face 127, WikiCFP 124, OpenReview 15.
  - Workshops: OpenReview 499, WikiCFP 54.
- **Journals:** 116 seeded.
  - 115 have OpenAlex metrics; DMLR isn't in OpenAlex yet.
  - 38 have aims & scope text; 24 have a published impact factor; 28 publish time to first decision.
  - Ranks: 64 have a CCF rank and 65 a CORE2020 rank.
- **Special issues:** 21 in total.
  - Springer: 15, all matched to a journal, 1 open (IJCV, Feb 1, 2027).
  - WikiCFP: 6, 2 matched to a journal, 2 open (LRE, Nov 2, 2026; IEEE TSC, Oct 31, 2026).

### Journals: what was skipped and why

- **SJR quartile:** skipped. scimagojr.com puts automated clients behind a Cloudflare challenge
  (HTTP 403), so automated use isn't permitted in practice. The column exists and stays empty
  ("not tracked").
- **CORE journal ranks:** CORE discontinued journal rankings in Feb 2022. The final CORE2020 list
  is used and labelled as such. robots.txt only blocks named AI crawlers, not FIndressBot.
- **CCF journal ranks:** CCF publishes no machine-readable list. The ranks come from the
  MIT-licensed CCFrank4dblp data, updated to the CCF 2026 list.
- **No aims & scope or calls for 78 journals:** ScienceDirect (all Elsevier journals), the ACM
  Digital Library and MIT Press Direct return 403 to bots. They show OpenAlex topics and a link
  instead. IEEE Computer Society's call-for-papers pages render with JavaScript, so IEEE special
  issues only arrive via WikiCFP.
- **DMLR:** the journal's site says its ISSN is pending, so no ISSN is stored. It isn't in OpenAlex
  yet, so it has no metrics.
- **Seed journals dropped:** none. All 116 titles verified against OpenAlex (one by title search:
  ACM TOPML 2836-8924). Print/online ISSN types come from Crossref, and every ISSN passes its
  check digit (tested).
- **Diamond-OA facts:** JMLR, TMLR, TACL, JAIR and DMLR are marked "full OA, no APC" in the seed,
  because their sites say so and OpenAlex under-reports them.

### New env vars (optional)

- `OPENALEX_API_KEY` — free key; raises the OpenAlex daily budget 10×. Not needed for ~120
  lookups/day, since single-record lookups cost 0 credits.
- `OPENALEX_EMAIL` — sent as `mailto=` so OpenAlex can contact you.

### Still to try with an API key

- On `/j/mlj`: "Does my paper fit the scope?", "Compare with TMLR and JMLR", "Summarize this
  special issue's call". Not run here: no `ANTHROPIC_API_KEY`.
- The second daily cron (`/api/ingest?source=journals,journal-ranks,journal-pages,special-issues`)
  registers on the first Vercel deploy. The GitHub Action already includes the journal steps.

## Update 2026-10-09 (b) — text restored after the typography pass

How this was checked: `git diff 7fdc4c8..56765c4` (the typography/clutter commit) over every
file in `src/`, plus a scripted pass listing each removed line that differs from its replacement
by more than class names. What came back:

| What                                                                                                                       | Status before this fix                                                                                                                                                                                              | Restored                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Landing hero "FIndress" title                                                                                              | Not removed by that commit: `git log -S"FIndress"` finds it in no landing file in any commit. The only "FIndress" on the page was the header wordmark, which went from 23px serif to 20px Geist with the same text. | Added as the hero's `<h1>`: "FIndress", Geist 600, 40px (largest step), tight tracking, above "Every AI/ML venue on Earth. One view." |
| Timeline milestone descriptions ("Abstract registration deadline", "Reviews released to authors", …) on the desktop ribbon | Moved into a hover tooltip                                                                                                                                                                                          | Shown again under each milestone title                                                                                                |
| CFP topics 13–24 (`/c/…`) and journal topics 13–16 (`/j/…`)                                                                | Folded into "+N more" text                                                                                                                                                                                          | The text list shows the same counts as before (24 and 16). The preview sheet shows every topic.                                       |
| "community-listed" marker, deadline captions, rank labels, OA labels                                                       | Restyled (chip → text, uppercase → sentence case), wording unchanged                                                                                                                                                | —                                                                                                                                     |

Allowed removals that stay: the serif font, and row/card chips beyond 3 (shown as "+N", with the
rest in the tooltip). Subfield chips on detail pages also follow the 3 + "+N" rule.

Landing globe: cobe v2 raises markers 0.05 above the sphere by default (`markerElevation`), so
markers near the edge drew outside the globe. They now sit on the surface (`markerElevation: 0`,
smaller dots), and back-face markers are hidden by cobe.

## Update 2026-10-09 (c) — lighting, whole-app login, React Bits visuals

### What changed

- **Lighting system** (DESIGN.md → Lighting system):
  - One `--screen` accent per route (`src/lib/theme/route-accents.ts`).
  - Tint-ladder utilities for rows, nav, tabs, filters, badges and table headers; a 220px top glow
    on `<main>`; 0.035 grain.
  - `lift` on raised surfaces; chrome darker than content. The star-field is gone.
- **Whole-app login:**
  - `/login` replaces `/unlock`. Every page redirects to `/login?next=…` and API routes answer 401.
  - Remember me: 30-day cookie; unchecked: browser-session cookie.
  - 5 wrong passwords lock that IP for 15 minutes (Postgres `login_attempts`).
  - Log out from the header, the mobile menu, the command palette and the workspace.
- **React Bits:**
  - Crystal globe on `/`: CrystalizedBall plus the interactive cobe globe.
  - RippleDistortion on `/login`; PixelSwap white→dark hand-off after sign-in.
  - Strands band behind the footer.
  - All four are in `src/components/react-bits/`, unchanged except the allowed Strands edits.
- **Performance work to keep Lighthouse ≥ 85 on `/` and `/explore`:**
  - Decorative WebGL starts on first interaction or 3s after load.
  - `/explore` ships its rows as a columnar payload (HTML 656 KB → 369 KB).
  - The title and intro are in the static shell, the desktop rail renders only on desktop, and the
    row stagger is CSS.

### Bugs found by this verification, and fixed

- **Routes kept alive leaked state.** Next keeps visited routes mounted but hidden (React Activity),
  so their accent markers stayed in the DOM. After signing in, the hidden `/login` marker kept the
  site header hidden. After a few navigations the tint could come from the wrong route.
  `RouteAccentSync` now sets `--screen` and the header/footer visibility from the pathname after
  every navigation. The first paint still comes from CSS. E2E test: "route tint follows client-side
  navigation".
- **cobe moved its canvas.** cobe v2 wraps its canvas in a new div, which crashed React on mobile
  (`insertBefore`). The globe now renders an empty host and creates the canvas imperatively.
- **Ball wrapper positioning.** The CrystalizedBall wrapper's `relative` class beat `absolute`,
  pushing the globe 600px down. The ball now sits in its own absolute wrapper.
- **Hero layout shift.** The hero shifted when the browser-only globe chunk arrived (CLS 0.3 → 0).
- **Accessibility fixes:** a `<p>` inside a `<dl>` on journal stat tiles; an Insights link
  distinguished by colour alone; 18px-tall legend links (now 24px targets).
- **Timeline "today" marker.** The vertical timeline (used for long schedules such as NeurIPS) had
  no "today" marker; it has one now.
- **Duplicate globe places.** Clusters now fold accents and merge places within ~30 km
  ("Montréal" / "Montreal" / "Palais des congrès de Montréal").

### Part 5 checklist (final run, 2026-10-09)

Automated by `.data/verify.mts`, `.data/globe-check.mts`, `.data/textdiff.mts`, the Playwright e2e
suite and Lighthouse 12.

| #   | Check                                               | Result             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | typecheck, lint, test, build                        | PASS               | 241 unit tests; 20 e2e (1 desktop-only skip on mobile); 0 build warnings. React Bits files are vendor code, excluded from Prettier/ESLint.                                                                                                                                                                                                                                                                                                                                            |
| 2   | No console errors / hydration warnings              | PASS               | 12 routes + `/login` × dark/light × 360/390/1440, motion on.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 3   | Landing hero content                                | PASS               | "FIndress" h1, headline, tagline, search, Explore button, all 4 stats, deadlines/sources line.                                                                                                                                                                                                                                                                                                                                                                                        |
| 4   | No text lost vs the pre-typography build            | PASS               | Visible text of 11 pages diffed against 7fdc4c8 (built in a worktree): 0 lines lost on `/`, ICML, NeurIPS, JMLR, MLJ, Insights, Sources, Workspace and the Special-issues tab. On `/explore` the only differences are topic chips past the third (now "+N", allowed) and rows that fall below the first viewport because rows are taller (EvoMUSART, IJRR are still listed; checked by search). Lines the new layout splits in two (acronym / name, date / time) are counted as kept. |
| 5   | Logged-out redirects and exceptions                 | PASS               | Pages 307 → `/login?next=…`. APIs 401 (JSON, not a redirect, so fetch callers don't receive HTML). Open: `/login`, `/api/auth/*`, `/api/ingest` and `/api/revalidate` (own CRON_SECRET check), `/api/workspace/ics` (own token), `_next/static`, favicon, public images.                                                                                                                                                                                                              |
| 6   | Wrong password / lockout countdown                  | PASS               | Inline error; the 5th wrong attempt → "Try again in 14:59" ticking, button disabled; row in `login_attempts`.                                                                                                                                                                                                                                                                                                                                                                         |
| 7   | PixelSwap hand-off → `?next`, no blank flash        | PASS               | Overlay seen, lands on `/sources` and `/j/jmlr`; next page's heading paints 0.5–0.8s after the URL change, over the dark panel.                                                                                                                                                                                                                                                                                                                                                       |
| 8   | Remember me / session cookie / logout               | PASS               | 30.00 days, httpOnly, SameSite=Lax, Secure; unchecked = session cookie (token capped at 24h); logout from nav and palette both land on `/login` with the cookie cleared.                                                                                                                                                                                                                                                                                                              |
| 9   | RippleDistortion                                    | PASS (placeholder) | Renders and reacts to the mouse. `public/hero.jpg` is missing, so the generated `public/hero-placeholder.jpg` is used.                                                                                                                                                                                                                                                                                                                                                                |
| 10  | Crystal ball + whole globe at 360/390/768/1440/1920 | PASS               | Globe box and canvas inside the viewport at every width, no horizontal scroll; markers on the surface (unit test: every projected marker within the 0.8 radius).                                                                                                                                                                                                                                                                                                                      |
| 11  | Drag, hover, click popover, links, See all          | PASS               | Drag changes the frame; hover "Helsinki, Finland · 1 event"; click → popover IUI 2027 → `/c/iui-2027`; "See all" → `/explore?country=FI&q=Helsinki` (filters correctly). Clicking off the sphere opens nothing. Clusters hold conferences and workshops only: special issues have no location data, so they can't be placed.                                                                                                                                                          |
| 12  | Keyboard + no-WebGL fallback                        | PASS               | Arrows rotate; Tab walks "Browse by location"; Enter opens the popover. With WebGL disabled: still ball and 12 city links, no errors.                                                                                                                                                                                                                                                                                                                                                 |
| 13  | Per-route `--screen` + top glow                     | PASS               | All 8 accents verified, and again after client-side navigation; glow 220px, isolated, ends at 70%.                                                                                                                                                                                                                                                                                                                                                                                    |
| 14  | Tint ladder, grain, lift, chrome                    | PASS               | Classes in use (rows, nav, tabs, filters, badges, table headers, Kanban); grain 0.035; chrome `#03050a` / header `#080c14` / content `#0a0e16` / cards `#0d121b`.                                                                                                                                                                                                                                                                                                                     |
| 15  | AA contrast                                         | PASS               | Text ≥ 14.5:1 and muted ≥ 5.4:1 on every surface in both themes; muted on the 21% selected tint ≥ 4.9:1 (`--muted-on-tint`). Lighthouse accessibility 100 on all 8 pages after the fixes above.                                                                                                                                                                                                                                                                                       |
| 16  | Strands footer                                      | PASS               | Canvas behind the footer on every page (`/login` is full-bleed with no footer); text readable; 61 rAF/s visible, 0 off-screen, 0 with the tab hidden.                                                                                                                                                                                                                                                                                                                                 |
| 17  | `/explore` regression                               | PASS               | Tabs, filters, URL sync, list/cards, preview sheet, `/` `j` Enter, ticking countdowns.                                                                                                                                                                                                                                                                                                                                                                                                |
| 18  | ICML / JMLR detail + .ics                           | PASS               | Timeline, Call for papers / Aims & scope, Metrics, Sources; both .ics endpoints return VCALENDAR.                                                                                                                                                                                                                                                                                                                                                                                     |
| 19  | Assistant "Elaborate the problem statement" on ICML | **BLOCKED**        | `ANTHROPIC_API_KEY` is empty in `.env.local`; `/api/chat` answers 503 "ANTHROPIC_API_KEY is not set". Add the key and re-run.                                                                                                                                                                                                                                                                                                                                                         |
| 20  | Workspace + sources                                 | PASS               | Bookmark → Kanban card, note autosave, private calendar feed; test data removed afterwards. `/sources` all healthy.                                                                                                                                                                                                                                                                                                                                                                   |
| 21  | `/api/ingest` auth                                  | PASS               | 401 without a bearer; with CRON_SECRET, `source=journal-ranks` ran (129 items).                                                                                                                                                                                                                                                                                                                                                                                                       |
| 22  | Lighthouse mobile                                   | PASS               | `/`: 91 / 91 / 91 (a11y 100). `/explore`: 87 / 85 / 83, median 85 (a11y 100). Other pages, for reference (a single run each, which varies a few points): `/insights` 86, `/sources` 90, `/c/icml-2026` 82, `/j/jmlr` 72–80, `/workspace` 74. Simulated LCP sits near 3.5–4s because Lighthouse charges the JS bundle to it; the observed LCP is ~0.5s (the static title).                                                                                                             |
| 23  | Reduced motion                                      | PASS               | No crystal ball, no ripple, Strands draws one still frame, the globe doesn't spin and its loop sleeps (0 rAF over 1.5s idle); CSS transitions collapse to 0.001ms.                                                                                                                                                                                                                                                                                                                    |
| 24  | 360px, no horizontal scroll                         | PASS               | Every page, both themes.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 25  | Screenshots                                         | PASS               | Below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### Screenshots (`docs/screenshots/`, dark/light × 390/1440, motion on)

- Sign-in: `login-*.png`; the PixelSwap mid-transition: `login-transition-dark-1440.png`,
  `login-transition-light-390.png`.
- Landing (crystal globe): `home-*.png`
- Explore: `explore-*.png`
- Conference (ICML 2026): `c_icml-2026-*.png`
- Journal (JMLR): `j_jmlr-*.png`
- Insights: `insights-*.png`
- Workspace: `workspace-*.png`
- Sources: `sources-*.png`

### Notes and decisions

- **PixelSwap trigger.** The registry component has no `trigger="none"`; `trigger="manual"` with
  `active` controlled is the equivalent. `aspectRatio="auto"` plus `h-dvh w-screen` fills the
  viewport.
- **Strands config.** It is used exactly as specified. With `scale 1.5` and `taper 3` on a wide,
  short band, the strands render as three soft lobes across the footer rather than one continuous
  line.
- **Vendor code.** React Bits files are excluded from Prettier (`.prettierignore`) and ESLint (the
  `pnpm lint` script passes `--ignore-pattern`; a repo hook blocks edits to `eslint.config.mjs`),
  because their upstream code trips the React Compiler lint rules and must stay unchanged.
- **Lockout IP.** The lockout keys on the first `X-Forwarded-For` hop, which Vercel sets. Self-hosted
  behind another proxy, make sure the proxy overwrites that header.
- **Login screen in light theme.** The PixelSwap hand-off lands on the dark background (per the
  brief), so in light theme a dark panel briefly precedes the light page.
- **No new env vars.** `APP_PASSWORD` is unchanged (still the one in `.env.local`).

## Update 2026-10-09 (d) — galaxy login, accent swap, LightPillar background, Gemini

### What changed

- **Login (no more split screen).** A full-screen layered scene, with the card centred:
  1. React Bits **Galaxy** (back).
  2. The hero globe through **RippleDistortion**, full screen, screen-blended at 0.6 with a soft
     vignette, sitting just above the card.
  3. **LaserFlow** (`#FF79C6`).
  4. The card: `#120F17`, a 1.5px `#FF79C6` border, 20px corners, a top glow and the lift.

  Everything inside the card is unchanged: wordmark, tagline, show/hide password, remember me,
  errors, lockout, PixelSwap hand-off. One pointer listener on the wrapper forwards moves to Galaxy
  (the ripple and laser listen on `window`). Phones and low-end devices get Galaxy + LaserFlow only,
  and the card is full width with 16px margins.

- **Accents.** `/explore` now uses the sign-in pink `#F25BD0`; `/sources` uses the old Explore cyan
  `#38BDF8`. Nav neighbours in OKLCH: Explore 338°, Insights 177°, Workspace 79°, Sources 233°
  (gaps 161°, 98°, 154°).
- **Background.** The footer Strands is removed (component and file deleted). React Bits
  **LightPillar** is now a fixed, full-viewport light behind every app page (not `/login`). It is
  mounted once in `AppShell` and never re-initialised on navigation; content scrolls over it.
  - The opaque canvas is blended away: `screen` in dark, and the component's `lightMode` with
    `multiply` in light. A radial mask feathers every edge.
  - Allowed edits only: pause in hidden tabs, one still frame under reduced motion, ResizeObserver.
    Quality is `medium`.
- **Assistant → Gemini.** `@ai-sdk/google`, with `AI_PROVIDER=google` as the default,
  `GOOGLE_GENERATIVE_AI_API_KEY`, and `AI_MODEL` defaulting to `gemini-3.8-flash`. That is the
  latest stable Flash on Google's model list (ai.google.dev/gemini-api/docs/models, checked
  2026-10-09).
  - Anthropic and the Vercel AI Gateway remain options. `AI_EFFORT` maps to Gemini's thinking level.
  - All six tools are unchanged; `fetchPage` now takes a plain string URL, validated server-side, so
    every tool schema stays inside the JSON-schema subset Gemini accepts.
  - In `.env.local` I switched only `AI_PROVIDER` / `AI_MODEL` to google / gemini-3.8-flash. No
    key was written anywhere.

### Decisions and deviations

- **LaserFlow API.** The registry's current LaserFlow has no `horizontalBeamOffset` /
  `verticalBeamOffset`. Its beam comes down from the top and pours onto a `surfaceRef` element. The
  card is that surface (`beamPosition 0.5`), so the beam lands on the card's top-edge centre and
  re-measures itself on resize. Its canvas is transparent (not opaque black), and it sits under a
  `screen` blend anyway.
- **Ripple on desktop.** With a GPU, all three login layers hold ~60 fps at 360–1920 px, above the
  ~50 fps bar, so the ripple stays. Headless software rendering manages 2–12 fps, which is not
  representative.
- **Readability over the light.** I measured every visible text element against the real background
  behind it (`.data/contrast-check.mts`): text hidden, screenshot, 95th-percentile worst background
  pixel per element. At the first pass, 188 of 1,456 elements were below AA. Fixes:
  - Pillar intensity per route: `/` 0.28, `/explore` and `/insights` 0.2, `/c` and `/j` 0.22,
    `/workspace` 0.2, `/sources` 0.18, ×0.4 on phones.
  - The route glow leans 35% toward the pillar violet.
  - Near-solid surfaces on data panels.
  - A `dimmed` utility instead of opacity fades on past/closed rows and passed milestones.
  - Light-theme heat colours a step darker, and chips on an opaque tint.
  - Dark muted text `#98a2b3`, and the hero aurora blob quieter on phones.

  The final run has 0 failures except 4 elements that the floating "Ask FIndress" button covers at
  390 px (text under a floating control, readable once scrolled).

- **WebGL probes deferred, software rasterisers skipped.** Probing for WebGL creates a GL context,
  which is a long task on slow devices, so the background pillar now probes only after its deferred
  start. Software renderers (SwiftShader, llvmpipe, Microsoft Basic Render) get the static
  fallbacks: a full-screen raymarch on the CPU would freeze the page.

### Part 5 checklist (re-run 2026-10-09, final build)

| #   | Check                                          | Result        | Notes                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | typecheck, lint, test, build                   | PASS          | 254 unit tests; 20 e2e (+1 desktop-only skip); 0 build warnings                                                                                                                                                                        |
| 2   | No console errors / hydration warnings         | PASS          | 12 routes + `/login` × dark/light × 360/390/1440                                                                                                                                                                                       |
| 3   | Landing hero content                           | PASS          | FIndress h1, headline, tagline, search, Explore, 4 stats, deadlines/sources line                                                                                                                                                       |
| 4   | No text lost vs pre-typography build (7fdc4c8) | PASS          | 0 lines lost on 9 of 11 pages. On `/explore` the only differences are chips past three (now "+N") and rows below the first viewport, which are still listed (EuroGP and IJRR checked by search)                                        |
| 5   | Logged-out redirects + exceptions              | PASS          | pages 307 → `/login?next=…`, APIs 401; `/login`, `/api/auth/*`, `/api/ingest`, `/api/revalidate`, ICS feed and static assets open                                                                                                      |
| 6   | Wrong password / lockout countdown             | PASS          | 5th attempt → "Try again in 14:59", ticking; row in Postgres                                                                                                                                                                           |
| 7   | PixelSwap → `?next`, no blank flash            | PASS          | heading paints 0.46–0.83 s after the URL change                                                                                                                                                                                        |
| 8   | Remember me / session cookie / logout          | PASS          | 30.00 days, httpOnly, Lax, Secure; session cookie when unchecked; logout from nav and palette                                                                                                                                          |
| 9   | Login scene                                    | PASS          | 1440: galaxy + ripple + laser (3 canvases); 360: galaxy + laser. Beam vs card centre at 360 / 768 / 1440 / 1920: offset −1, −1, +4, −10 px (the beam wobbles), ~60 fps on GPU; card and transition work                                |
| 10  | Crystal globe at 360–1920                      | PASS          | in the box at every width, no overflow; markers on the surface                                                                                                                                                                         |
| 11  | Globe interactions                             | PASS          | drag; hover "Malmö, Sweden · 1 event"; popover → `/c/eccv-2026`; "See all" → `/explore?country=SE&q=Malmö`; ocean click does nothing                                                                                                   |
| 12  | Keyboard + no-WebGL fallback                   | PASS          | arrows / Tab / Enter; WebGL off → still ball + 12 city links                                                                                                                                                                           |
| 13  | Per-route `--screen` + glow                    | PASS          | 8 accents, and again after client-side navigation                                                                                                                                                                                      |
| 14  | `/explore` purple, `/sources` blue             | PASS          | `#F25BD0` / `#38BDF8`, verified on load and after navigation                                                                                                                                                                           |
| 15  | Tint ladder, grain, lift, chrome               | PASS          | grain 0.035; glow 220 px, isolated                                                                                                                                                                                                     |
| 16  | LightPillar                                    | PASS          | fixed (top stays 0 after scrolling) on all 7 app pages in both themes; z −10, pointer-events none, feathered mask, `screen` / `multiply` blend; 61 rAF/s → 0 when hidden → 60 when back; same canvas after navigation; not on `/login` |
| 17  | AA contrast                                    | PASS          | per-element pixel check over the light: 0 real failures; Lighthouse accessibility 100                                                                                                                                                  |
| 18  | `/explore` regression                          | PASS          | tabs, filters, URL sync, list/cards, preview, keys, countdowns                                                                                                                                                                         |
| 19  | ICML / JMLR detail + .ics                      | PASS          |                                                                                                                                                                                                                                        |
| 20  | Chatbot with Gemini                            | **NEEDS KEY** | `GOOGLE_GENERATIVE_AI_API_KEY` is not in `.env.local`: `/api/chat` → 503 "GOOGLE_GENERATIVE_AI_API_KEY is not set". The ICML/JMLR "Elaborate the problem statement" answers can't be recorded until it is                              |
| 21  | Workspace, sources, ingest auth                | PASS          |                                                                                                                                                                                                                                        |
| 22  | Lighthouse mobile                              | PASS          | Standard: `/` 91 / 90 / 91, `/explore` 88 / 88 / 88, accessibility 100. With the GPU enabled (the background light actually loads): `/` 90, `/explore` 80 (one run each)                                                               |
| 23  | Reduced motion                                 | PASS          | no canvases on `/login`; globe still; idle rAF 0                                                                                                                                                                                       |
| 24  | 360 px, no horizontal scroll                   | PASS          |                                                                                                                                                                                                                                        |
| 25  | Screenshots                                    | PASS          | `docs/screenshots/` (motion on, GPU): login, home, explore, c_icml-2026, j_jmlr, insights, workspace, sources × dark/light × 390/1440, plus `login-transition-dark-1440.png` / `login-transition-light-390.png`                        |

## Update 2026-10-09 (e) — login without globe/laser, LightPillar only on /explore

- **Login:** the Galaxy starfield and the card only. RippleDistortion, LaserFlow and
  `public/hero-placeholder.jpg` are deleted (nothing else used them; `three` stays for LightPillar,
  `ogl` for Galaxy and CrystalizedBall). The card gains a soft pink-violet halo on every side.
- **LightPillar now matches reactbits.dev.** Our copy was byte-identical to the registry, yet
  rendered a smooth blurry band. Cause: the registry passes `Float32Array(4)` to the `float`
  uniforms `uWaveSin`/`uWaveCos`; the live demo bundle passes `Math.sin(0.4)`/`Math.cos(0.4)`.
  With plain numbers our pillar shows the same twisting strands. Props are copied from the demo's
  live state (glow 0.002 and rotation 25°, not the component defaults 0.005 and 0°), `screen` over
  `#120F17`, quality high, and no masks, intensity cuts or blend tricks.
  Side by side: `docs/screenshots/lightpillar-demo-vs-explore-1440.png`.
- **Only on `/explore`.** Removed from `AppShell`. Every other page is back to its pre-pillar look
  (diffed against `1d90d07`: surfaces, hero blob, route glow and muted text restored). Two kept
  differences are AA-only: `dimmed` instead of opacity fades on past/closed items, and opaque
  countdown chips. The footer stays simple (Strands was removed on request).
- **Glass on `/explore`:** `glass-panel` utility. Lightning CSS dropped the unprefixed
  `backdrop-filter` when both prefixed and unprefixed lines were written, so only the
  unprefixed line is authored now. AA: 254/254 texts pass in dark at 1440 and 390; light passes.
- Login end to end: wrong password message, 5th failure → "Try again in 15:00" with the field
  disabled, correct password → PixelSwap → `/explore`.
