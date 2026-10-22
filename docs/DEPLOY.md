# Deploying FIndress

FIndress deploys on Vercel through the Git integration: every push to `main` builds and deploys.
The database is Neon Postgres (Vercel Marketplace). Data refreshes come from two Vercel Cron
jobs (daily) plus a GitHub Action (every 6 hours).

Never paste real values into this repo. Secrets live only in Vercel's Environment Variables, in
GitHub's repository secrets, and in your local `.env.local` (git-ignored).

## 1. Vercel environment variables

Project → **Settings → Environment Variables**. Add each one for **Production** (and Preview if
you use preview deploys).

### Required

| Name                           | What it is                                                                                | Where to get it                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                 | Postgres connection string                                                                | Created automatically when you add **Storage → Neon** to the project. Use the pooled URL.    |
| `APP_PASSWORD`                 | The owner password for `/login`                                                           | Choose one (long and random). Your local one is in `.env.local`.                             |
| `AUTH_SECRET`                  | Signs the login session cookie and the private calendar-feed token                        | `openssl rand -base64 32`. Changing it signs everyone out and changes the calendar-feed URL. |
| `CRON_SECRET`                  | Bearer token for `/api/ingest` and `/api/revalidate`. Vercel Cron sends it automatically. | `openssl rand -base64 32`. Use the same value as the GitHub secret below.                    |
| `NEXT_PUBLIC_SITE_URL`         | Public URL of the deployment (used for links, the calendar feed and metadata)             | Your Vercel domain, e.g. `https://findress.vercel.app` (no trailing slash).                  |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini key for the "Ask FIndress" assistant                                               | https://aistudio.google.com/apikey (Google AI Studio → Get API key). Billed per use.         |

### Recommended (have defaults)

| Name                           | Default            | What it does                                                                       |
| ------------------------------ | ------------------ | ---------------------------------------------------------------------------------- |
| `AI_PROVIDER`                  | `google`           | `google` (Gemini), `anthropic`, or `gateway` (Vercel AI Gateway)                   |
| `AI_MODEL`                     | `gemini-3.8-flash` | Model id for the chosen provider                                                   |
| `AI_EFFORT`                    | `medium`           | `low` / `medium` / `high` (Gemini thinking level; `xhigh` and `max` map to `high`) |
| `CHAT_RATE_LIMIT_PER_HOUR`     | `30`               | Cost guard: assistant messages per hour                                            |
| `CHAT_MAX_OUTPUT_TOKENS`       | `4000`             | Cost guard: max tokens per answer                                                  |
| `NEXT_PUBLIC_DEFAULT_TIMEZONE` | `Asia/Kolkata`     | Default display timezone (viewers can change it)                                   |
| `DB_POOL_MAX`                  | `5`                | Max pooled DB connections per server instance                                      |

### Optional

| Name                 | What it is                                                      | Where to get it                                                                                |
| -------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`       | Raises GitHub API limits when listing ccfddl files              | github.com → Settings → Developer settings → fine-grained token, public repositories read-only |
| `OPENALEX_API_KEY`   | Raises the OpenAlex daily budget 10×                            | https://openalex.org (free key). Not needed at FIndress's volume.                              |
| `OPENALEX_EMAIL`     | Sent as `mailto=` so OpenAlex can contact you                   | Your email                                                                                     |
| `ENABLE_LLM_TAGGING` | `true` to tag unclassified events with the LLM during ingestion | Default `false` (costs tokens)                                                                 |
| `ANTHROPIC_API_KEY`  | Only if `AI_PROVIDER=anthropic`                                 | https://console.anthropic.com                                                                  |
| `AI_GATEWAY_API_KEY` | Only if `AI_PROVIDER=gateway`                                   | Vercel → AI Gateway                                                                            |

## 2. GitHub Actions secrets

github.com/Xenomorph27/Findress → **Settings → Secrets and variables → Actions → New repository
secret**:

| Name          | Value                                                   |
| ------------- | ------------------------------------------------------- |
| `CRON_SECRET` | The same value as Vercel's `CRON_SECRET`                |
| `SITE_URL`    | Your deployment URL, e.g. `https://findress.vercel.app` |

The workflow `.github/workflows/ingest.yml` runs every 6 hours and calls `/api/ingest` one source
at a time, so each call stays inside Vercel's 300 s function limit. You can also run it by hand:
**Actions → "Ingest (every 6 hours)" → Run workflow**.

## 3. First deploy

1. Push `main` (Vercel builds automatically), or import the repo on vercel.com → **Add New →
   Project**.
2. Add **Storage → Neon**, which creates `DATABASE_URL`. Then add the variables above and
   **Redeploy** so they take effect.
3. Pull the production env locally (`npx vercel link`, then `npx vercel env pull .env.production.local`),
   then create the tables against Neon:

   ```bash
   DATABASE_URL="<the Neon URL from .env.production.local>" pnpm db:migrate
   ```

   Migrations live in `drizzle/` (0000–0003, including `login_attempts` for the lockout). If
   `DATABASE_URL_UNPOOLED` is set (the Vercel Neon integration creates it), `pnpm db:migrate` uses
   it instead of `DATABASE_URL`: schema changes go through Neon's direct endpoint, the running app
   through the pooled one.

   **Neon project settings.** Only the Postgres database is used. No extensions are needed (search
   uses built-in `tsvector`). Create the project in the region closest to your Vercel functions
   (default `iad1`, so an AWS US East region). Connection pooling stays on. FIndress has its own
   owner login, so Neon Auth, Realtime, Storage and Functions are not used. Remote connections
   verify Neon's TLS certificate.

   **Local database or Neon.** `.env.local` keeps `DATABASE_URL` on the local PGlite database
   (`pnpm db:local`), so plain `pnpm dev` and `pnpm ingest` never touch Neon. The Neon variables live
   in `.env.neon` (git-ignored; refresh with `neon env pull --file .env.neon`). The `:neon` scripts
   load it and win over `.env.local`: `pnpm dev:neon`, `pnpm start:neon`, `pnpm db:migrate:neon`,
   `pnpm ingest:neon`. The app uses the pooled `DATABASE_URL` (`pg` + Fluid compute, with
   `attachDatabasePool`); migrations use `DATABASE_URL_UNPOOLED`.

## 4. Post-deploy checks

1. **First ingestion.** Either trigger the GitHub Action (Actions → "Ingest (every 6 hours)" → Run workflow), or run
   it once from your machine against Neon:

   ```bash
   DATABASE_URL="<Neon URL>" NEXT_PUBLIC_SITE_URL="https://<your-site>" CRON_SECRET="<secret>" pnpm ingest
   ```

   `pnpm ingest` calls `/api/revalidate` at the end so the site shows the new data immediately.
   Check `/sources`: every source should read "Healthy" with a recent "Last updated".

2. **Login.** Open the site. You should land on `/login` (galaxy, laser onto the card). Sign in with
   `APP_PASSWORD`; the white→dark pixel transition plays and you land on the page you asked for.
   Five wrong passwords lock that IP for 15 minutes. Every fresh visit (typed URL, bookmark, new tab) starts on `/login`; a browser that is
   still signed in sees `********` in the field and just clicks Sign in (Backspace clears it).
3. **Chat.** Open a conference (e.g. `/c/icml-2026`) and ask "Elaborate the problem statement". The
   answer should stream, cite the CFP, and use tools (event lookup, page fetch). If it says
   `GOOGLE_GENERATIVE_AI_API_KEY is not set`, add the key and redeploy.
4. **Crons.** Vercel → Project → **Settings → Cron Jobs** should list two jobs: `/api/ingest` at
   05:00 UTC and the journals pipeline at 05:30 UTC. On the Hobby plan crons run at most once a day,
   and the GitHub Action covers the 6-hourly refresh.
5. **Calendar feed.** Workspace → copy the private feed URL into your calendar app.

## 5. Things to know

- The login screen uses `public/hero.jpg` behind the ripple if the file exists at build time;
  otherwise it uses the generated `public/hero-placeholder.jpg`. To use your own image, add
  `public/hero.jpg`, commit it, and push.
- Everything except `/login`, `/api/auth/*`, `/api/ingest`, `/api/revalidate`, the private
  calendar feed and static files requires the login session.
- The lockout keys on the first `X-Forwarded-For` hop, which Vercel sets. Behind another proxy,
  make sure that proxy overwrites the header.

## 6. Data pipeline notes

**Steps** (`/api/ingest?source=<step>`; the GitHub Action calls them one by one every 6 hours, the
daily Vercel cron calls all of them): `ccfddl`, `huggingface`, `openreview`, `wikicfp`,
`easychair`, `merge`, `cfp`, `extract`, `topics`, `geocode`, `journals`, `journal-ranks`,
`journal-pages`, `special-issues`.

- **Time-boxed sources resume.** `openreview` sweeps its venue list round-robin and saves a cursor
  (`source_runs.stats.cursor`); `wikicfp` fetches the stalest/nearest event pages first. A partial
  run never prunes. Events keep their id, bookmarks and notes when a source changes an event's
  acronym or slug.
- **Journal pages are guarded.** A bot-block or error page (some publishers serve them to datacenter
  IPs with HTTP 200) is detected and ignored; a journal's stored values are never overwritten with
  an empty or blocked result.
- **Impact factors are not stored or shown** (Clarivate data). The app shows OpenAlex's 2-year mean
  citedness, labeled with its source, and links to the journal's own page.
- **SJR quartiles** come from a CSV you download yourself from https://www.scimagojr.com/journalrank.php
  ("Download data"; read SCImago's terms first), once a year:
  `pnpm sjr:import:neon path/to/scimagojr-2024.csv`. Journals are matched by ISSN and the app shows
  "Data: SCImago Journal & Country Rank, source Scopus®" with a link wherever SJR appears.
- **EasyChair Smart CFP** is read as one page per run (robots.txt allows `/cfp/`). Only calls whose
  title or acronym names AI/ML (or that carry three AI/ML topic tags, one of them strong) come in;
  they are community-listed and hidden from the default Explore view unless another source backs them.
- **AI extraction (`extract`)** asks Gemini to read each event's own CFP page and propose deadlines,
  attendance mode and a description. A value is kept only if its verbatim quote is found on the page
  (and a date re-parses to the same value, with an explicit year). Kept values are stored with the
  quote and page URL in `extractions`, shown with an "AI" badge, never override a source, and are
  re-read only when the page changes. It uses `GOOGLE_GENERATIVE_AI_API_KEY` (the same key as the
  assistant) and is rate-limited to protect the assistant's quota. It is **off** until you set
  `ENABLE_AI_EXTRACTION=true` (the key alone does not start it), so turn it on only after reviewing
  the accuracy sample:

  | Variable                  | Default | Meaning                                |
  | ------------------------- | ------- | -------------------------------------- |
  | `ENABLE_AI_EXTRACTION`    | off     | `true` to let the step call the model  |
  | `EXTRACT_PER_RUN`         | `12`    | Max model requests per ingest run      |
  | `EXTRACT_DAILY_LIMIT`     | `60`    | Max model requests per UTC day         |
  | `EXTRACT_MIN_INTERVAL_MS` | `13000` | Minimum gap between requests (< 5 RPM) |
  | `EXTRACT_MAX_RETRIES`     | `3`     | Retries on HTTP 429 before stopping    |

## 7. Backups and CI

**Backups.** Neon's instant restore only reaches back 6 hours, so it is not a backup. Run

```bash
pnpm backup:neon        # needs Docker Desktop running; writes .data/backups/neon-production-<time>.dump
```

(a read-only `pg_dump` of production through the official `postgres:18` image, using the direct
`DATABASE_URL_UNPOOLED` from `.env.neon`; it checks that all 16 tables are in the file). **How often:**
weekly, and always right before a migration or a change to how data is ingested. The event data can be
rebuilt from its sources; what cannot is your bookmarks, notes and assistant chats, so that is what the
weekly copy protects. Keep the last four or so; `.data/` is git-ignored.

To restore, never write straight over production. Create a Neon branch first
(`neon branch create --name restore-check`), restore into it with
`pg_restore --dbname=<branch direct URL> --single-transaction --exit-on-error --no-owner --no-privileges <file>`
(run inside the same `postgres:18` image), check it, and only then decide what to copy back.

**CI.** `.github/workflows/ci.yml` runs typecheck, lint and the unit tests on every push to `main` and
on every pull request. It needs no secrets or database.

## Install on Vercel (pnpm build scripts)

- `package.json` pins `"packageManager": "pnpm@12.10.1"`, and Vercel has
  `ENABLE_EXPERIMENTAL_COREPACK=1`, so Vercel installs with the same pnpm as local. The lockfile is
  `lockfileVersion: 9.0`, the format pnpm 12 writes.
- No dependency with native binaries or a needed install script is left except `esbuild`. The old
  `embedded-postgres` devDependency (its `@embedded-postgres/linux-x64` postinstall broke the Vercel
  install with `ERR_PNPM_IGNORED_BUILDS`) is gone; `pnpm db:local` now runs PGlite (WASM).
- An unapproved build script can never fail the install: `strict-dep-builds=false` in `.npmrc` (read
  by every pnpm version) and `strictDepBuilds: false` in `pnpm-workspace.yaml`. Approvals:
  `onlyBuiltDependencies` (pnpm 10) and `allowBuilds` (pnpm 11+) both allow only `esbuild`.
- If a deploy still reports an old error, redeploy without the build cache (Deployments → ⋯ →
  Redeploy, untick "Use existing Build Cache").

## Build can't reach the database (`ECONNREFUSED 127.0.0.1:54329`)

That address is the local PGlite database from `pnpm db:local`; it only exists on your machine.
Seeing it in a Vercel log means the project's `DATABASE_URL` was copied from `.env.local`. Set it
to the Neon pooled URL (Settings → Environment Variables, Production and Preview), then redeploy.

The build itself no longer fails when the database is unreachable: cached loaders settle errors
into values (`src/lib/data/settle.ts`), the pages prerender with their "unreachable" state, and
those entries are retried every minute, so the site fills in once the database answers.
