# FIndress — review notes & owner to-dos

## Verified locally (2026-10-09)
- Ingestion against a local Postgres (`pnpm db:local`): ccfddl 537 editions · Hugging Face 127 ·
  WikiCFP 189 · OpenReview 513 → **1,225 merged events (545 workshops)**, 670 with CFP text,
  1,098 geocoded, 2,018 deadlines, 313 acceptance-rate rows.
- Lighthouse (mobile) on `/explore`: performance 92, accessibility 100.
- 148 unit tests passing (`pnpm test`); production build passing (`pnpm build`).
- Owner flow (unlock → bookmark → Kanban → notes autosave → .ics feed) checked in a browser.

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
- Not done for lack of time: a manual screen-reader pass and a production deploy check
  (cron registration, live ingestion, live chat) — do these after the first deploy.
