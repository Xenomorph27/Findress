# FIndress

Every AI/ML conference, workshop and journal in one view — live deadlines (AoE-correct, shown
in your timezone), rankings, acceptance rates, CFP text, journal metrics and special issues,
insights, a private workspace, and an assistant grounded in each event's real call for papers and
each journal's aims & scope.

![Landing](docs/screenshots/landing-dark.png)
![Explore](docs/screenshots/explore-dark.png)
![Event](docs/screenshots/event-dark.png)
![Insights](docs/screenshots/insights-dark.png)

## Architecture

```mermaid
flowchart LR
  subgraph Sources
    A[ccfddl YAML] --> I
    B[HF ai-deadlines YAML] --> I
    C[WikiCFP RSS + pages] --> I
    D[OpenReview API v2] --> I
  end
  subgraph Journals
    S[Seed list: 116 journals] --> JN
    OA[OpenAlex] --> JN
    R[CCF 2026 + CORE2020] --> JN
    P[Journal pages + Springer calls] --> JN
    W[WikiCFP special issues] --> JN
  end
  JN[journals · special_issues] --> E
  I[Adapters → zod → source_items] --> M[Merge: acronym+year, per-field provenance]
  M --> E[(Postgres: events, deadlines, …)]
  E --> F[CFP pages · topics · geocoding]
  E --> W[Next.js 16 · use cache + tags]
  W --> UI[/explore · /c/slug · /j/slug · /insights · /workspace/]
  W --> API[/api/events · /api/journals · /api/chat/]
  Cron[Vercel Cron daily + GitHub Action 6h] --> I
```

## Run locally
```bash
pnpm install
pnpm db:local        # embedded Postgres on :54329 (or set DATABASE_URL to Neon)
pnpm db:migrate
pnpm ingest          # all steps; or --steps=ccfddl,huggingface,openreview,wikicfp,merge,cfp,
                     #   topics,geocode,journals,journal-ranks,journal-pages,special-issues
pnpm dev             # http://localhost:3000 — unlock at /unlock with APP_PASSWORD
pnpm test            # unit tests · pnpm test:e2e (against pnpm start)
```

## Environment variables
See `.env.example`: `DATABASE_URL`, `CRON_SECRET`, `GITHUB_TOKEN` (optional), `ENABLE_LLM_TAGGING`,
`OPENALEX_API_KEY` / `OPENALEX_EMAIL` (optional),
`AI_PROVIDER`, `AI_MODEL`, `ANTHROPIC_API_KEY`, `AI_GATEWAY_API_KEY`, `AI_EFFORT`,
`CHAT_RATE_LIMIT_PER_HOUR`, `CHAT_MAX_OUTPUT_TOKENS`, `APP_PASSWORD`, `AUTH_SECRET`,
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_DEFAULT_TIMEZONE`.

## Ingestion
- `GET /api/ingest?source=<step>` with `Authorization: Bearer $CRON_SECRET` (Vercel Cron, daily).
- `.github/workflows/ingest.yml` calls each step every 6 hours (secrets `CRON_SECRET`, `SITE_URL`).
- Journals: a second daily cron calls `?source=journals,journal-ranks,journal-pages,special-issues`.
  The seed list (`src/data/journals-seed.ts`) was verified title-by-title against OpenAlex, with
  print/online ISSN types from Crossref; metrics come from OpenAlex, ranks from the CCF 2026 list
  (CCFrank4dblp data) and the final CORE2020 journal list, scope text and calls from the
  journals' own pages (robots.txt respected; ScienceDirect, ACM DL and MIT Press block bots).
- Owner "Refresh now" on `/sources`. Every run is logged in `source_runs`; one failing source never
  stops the others. Polite fetching: `FIndressBot/1.0` UA, robots.txt, ≥1 req/s per host (WikiCFP 5 s).

## Public API <a id="api"></a>
- `GET /api/events` — query params as `/explore`: `q` (full-text), `type`, `subfield`, `rank`
  (`A*,A,B,C,CCF-A,CCF-B,CCF-C,unranked`), `window` (`7|30|90|custom` + `from`,`to`), `passed=1`,
  `evfrom`, `evto`, `continent`, `country`, `mode`, `abstract=1`, `rebuttal=1`, `blind=1`,
  `community=1`, `sort` (`deadline|date|rank|name|recent`), `limit` (≤200), `offset`.
  Returns `{ total, limit, offset, items[] }`. Cached `s-maxage=300`.
- `GET /api/events/{slug}` — full record incl. deadlines, CFP text, sources.
- `GET /api/events/{slug}/ics` — calendar file.
- `GET /api/journals` — journals filtered like the Journals tab: `q`, `subfield`, `oa`
  (`full,hybrid,subscription`), `apcmax` (USD; `0` = free to publish), `jrank`
  (`A*,A,B,C,CCF-A,CCF-B,CCF-C`), `publisher`, `jsort` (`calls|hindex|citedness|apc|name`),
  `limit`, `offset`; add `include=special` for open special issues.
- `GET /api/journals/{slug}` (record incl. special issues) · `GET /api/journals/{slug}/ics`.

Owner-only (cookie from `/unlock`): `/api/chat`, `/api/workspace/*`.
