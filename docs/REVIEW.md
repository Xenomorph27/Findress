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
