# FIndress

Every AI/ML conference and workshop in one view — live deadlines (AoE-correct, shown in your
timezone), rankings, acceptance rates, CFP text, insights, a private workspace, and an assistant
grounded in each event's real call for papers.

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
  I[Adapters → zod → source_items] --> M[Merge: acronym+year, per-field provenance]
  M --> E[(Postgres: events, deadlines, …)]
  E --> F[CFP pages · topics · geocoding]
  E --> W[Next.js 16 · use cache + tags]
  W --> UI[/explore · /c/slug · /insights · /workspace/]
  W --> API[/api/events · /api/chat/]
  Cron[Vercel Cron daily + GitHub Action 6h] --> I
```

## Run locally
```bash
pnpm install
pnpm db:local        # embedded Postgres on :54329 (or set DATABASE_URL to Neon)
pnpm db:migrate
pnpm ingest          # --steps=ccfddl,huggingface,openreview,wikicfp,merge,cfp,topics,geocode
pnpm dev             # http://localhost:3000 — unlock at /unlock with APP_PASSWORD
pnpm test            # unit tests · pnpm test:e2e (against pnpm start)
```

## Environment variables
See `.env.example`: `DATABASE_URL`, `CRON_SECRET`, `GITHUB_TOKEN` (optional), `ENABLE_LLM_TAGGING`,
`AI_PROVIDER`, `AI_MODEL`, `ANTHROPIC_API_KEY`, `AI_GATEWAY_API_KEY`, `AI_EFFORT`,
`CHAT_RATE_LIMIT_PER_HOUR`, `CHAT_MAX_OUTPUT_TOKENS`, `APP_PASSWORD`, `AUTH_SECRET`,
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_DEFAULT_TIMEZONE`.

## Ingestion
- `GET /api/ingest?source=<step>` with `Authorization: Bearer $CRON_SECRET` (Vercel Cron, daily).
- `.github/workflows/ingest.yml` calls each step every 6 hours (secrets `CRON_SECRET`, `SITE_URL`).
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

Owner-only (cookie from `/unlock`): `/api/chat`, `/api/workspace/*`.
