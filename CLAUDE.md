# FIndress — project memory for Claude Code

FIndress is a personal research companion for an AI/ML researcher. It collects every AI/ML conference
and workshop worldwide into one browsable list, shows full details for each, gives insights
(deadlines, locations, rankings, acceptance rates), lets the owner track and annotate the ones they
care about, and has an AI assistant that answers questions about a specific conference using that
conference's real call-for-papers text.

Read `docs/SPEC.md` (what to build) and `docs/DESIGN.md` (how it must look) before writing code.
`PROMPT.md` holds the phased build plan.

## Owner & repo
- GitHub: https://github.com/Xenomorph27/Findress (branch `main`)
- Deployed on Vercel (Git integration: every push to `main` deploys)
- Research domain: Artificial Intelligence & Machine Learning, including generative AI, NLP, computer
  vision, robotics/RL, data mining, AI safety, multimodal, speech, and related fields.

## Stack (do not swap without asking)
- Next.js (App Router, latest stable) + TypeScript (strict) + React Server Components
- Tailwind CSS + shadcn/ui (Radix) + Framer Motion + lucide-react icons
- Postgres (Neon via Vercel Marketplace) + Drizzle ORM + drizzle-kit migrations
- Vercel AI SDK (`ai`, `@ai-sdk/react`, `@ai-sdk/anthropic`) for the chatbot, provider-swappable
- Data fetching: `yaml`, `rss-parser`, `cheerio`, `@mozilla/readability` + `linkedom` for CFP text
- Charts: Recharts; globe: `cobe`; dates: `date-fns` + `date-fns-tz`
- Package manager: pnpm. Node 20+.

## Commands
- `pnpm dev` — local dev
- `pnpm build` — must pass before every push
- `pnpm lint` / `pnpm typecheck`
- `pnpm db:generate` / `pnpm db:migrate` — Drizzle
- `pnpm ingest` — run all data sources locally (script in `scripts/ingest.ts`)
- `pnpm test` — Vitest (parsers and date logic must be tested)

## Git workflow (important)
- Commit after every meaningful, working step with a clear message (`feat:`, `fix:`, `chore:` …).
- Run `pnpm build` (and `pnpm test` once tests exist) before pushing; never push a broken build.
- Push to `origin main` at the end of every phase in PROMPT.md. If the push fails because of auth,
  stop and tell the owner to run `gh auth login`; never put tokens in files or remote URLs.
- Never commit `.env*` files except `.env.example`.

## Data rules
- "Real-time" here means: sources are re-pulled on a schedule (daily Vercel Cron + 6-hourly GitHub
  Action) and on demand from an admin "Refresh now" button. Always show "Last updated" per source.
- Prefer structured open data (YAML/JSON on GitHub, RSS, public APIs) over HTML scraping.
- When scraping HTML: respect robots.txt, identify with a User-Agent like
  `FIndressBot/1.0 (+https://github.com/Xenomorph27/Findress)`, max 1 request/second per host,
  cache results, and fail soft (one broken source must never break ingestion or the UI).
- Never invent conference facts. If a field is unknown, store null and show "Not announced".
- All deadlines are stored in UTC with the original timezone string kept (AoE = UTC-12).
- Deduplicate across sources by normalized acronym + year; merge fields, keep provenance per field.

## Code rules
- Server-only secrets stay in server code (`server-only` import). No API keys in client bundles.
- Validate all external data with zod before writing to the DB.
- Every API route that costs money (chat) or mutates data (ingest, notes) is protected:
  ingest by `CRON_SECRET` bearer token, owner features by the password gate in SPEC §8.
- Accessibility: keyboard navigable, visible focus, AA contrast in both themes,
  `prefers-reduced-motion` respected.
- Keep components small; colocate under `src/components/<area>/`.
