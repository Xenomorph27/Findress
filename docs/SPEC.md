# FIndress — Product & Technical Specification

## 1. Goal
One place to see every AI/ML conference and workshop in the world, decide which to target, and dig
into any of them, with live data, insights, personal tracking, and an AI assistant grounded in each
event's real call for papers (CFP).

## 2. Pages

| Route | Purpose |
|---|---|
| `/` | Landing + live overview: hero with rotating 3D globe of upcoming venues, "next 5 deadlines" countdown strip, quick search, stats (events tracked, deadlines this month, sources live) |
| `/explore` | The main list. Every conference + workshop, filterable, sortable, searchable |
| `/c/[slug]` | Detail page for one event (e.g. `/c/icml-2027`) with full info + AI assistant panel |
| `/insights` | Dashboard: deadline calendar heatmap, events per month, world map, rank mix, acceptance-rate trends, topic trends |
| `/workspace` | Owner-only: bookmarked events, status pipeline (Kanban), notes, calendar export |
| `/sources` | Transparency: each data source, last successful pull, item counts, errors |
| `/api/...` | See §7 |

## 3. Explorer (`/explore`)
- Two views, toggle persisted in URL: **List** (dense rows) and **Cards** (grid). Default: List.
- Each row/card: acronym, full name, type badge (Conference / Workshop / Symposium / Journal-first track),
  parent conference for workshops, next deadline with live countdown (colour shifts as it nears:
  >30d calm, 7–30d warm, <7d hot, passed greyed), event dates, city + country flag, mode
  (in-person / hybrid / virtual), CORE / CCF rank chips, topic tags, bookmark star.
- Filters (all reflected in URL query so views are shareable/bookmarkable):
  - Text search (acronym, name, topics, location) — instant, client-side over the loaded set, plus
    Postgres full-text for the server query
  - Type, subfield (GenAI, NLP, CV, ML theory, RL/Robotics, Data mining, AI safety, Speech, Multimodal,
    HCI-AI, Health-AI…), rank (A*, A, B, C, CCF-A/B/C, unranked)
  - Deadline window (next 7 / 30 / 90 days, custom range), "hide passed deadlines" (on by default)
  - Event date range, continent / country, mode
  - Has abstract deadline, has rebuttal, double-blind (when known)
- Sort: nearest deadline (default), event date, rank, name, recently added.
- Keyboard: `/` focuses search, `j/k` moves selection, `Enter` opens, `b` bookmarks.
- Selecting a row on desktop opens a **side sheet preview** (no page change); "Open full page" goes to `/c/[slug]`.
- Virtualized list (TanStack Virtual) so 2,000+ rows stay smooth.

## 4. Detail page (`/c/[slug]`)
Sections (render "Not announced" for unknown values, never guess):
1. Header: acronym + year, full name, type, ranks, location, dates, official link, bookmark, status selector,
   "Add all dates to calendar" (.ics), share.
2. **Timeline**: every milestone (abstract, full paper, supplementary, rebuttal, notification, camera-ready,
   registration, event) on a horizontal timeline with countdowns; timezone shown and convertible to the
   viewer's local zone (default Asia/Kolkata for the owner).
3. **Call for papers**: cleaned CFP text fetched from the official page (readability extraction),
   with topics of interest pulled into chips. Show "fetched <time> from <url>".
4. **Workshops** (for a main conference): list of its workshops linking to their own pages.
5. **History & stats**: past years' locations and dates, acceptance rates per year (ccfddl `accept_rates`),
   chart of submissions vs accepted when available.
6. **Submission essentials**: page limit, template, review type, submission site (OpenReview / CMT /
   EasyChair) — only when present in the CFP text or sources.
7. **Sources**: which sources contributed which fields.
8. **AI assistant panel** (right column on desktop, bottom sheet on mobile) — see §6.
9. **My notes** (owner only): markdown notes autosaved.

## 5. Data sources & ingestion
Ingestion is a set of independent "source adapters" in `src/lib/sources/<name>.ts`, each exporting
`fetch(): Promise<RawEvent[]>` and a `normalize(raw): EventInput` mapper validated with zod.
Run by `scripts/ingest.ts` (CLI) and `/api/ingest` (cron). One failing adapter logs to `source_runs`
and the rest continue.

Adapters (verify each URL/format at build time; adjust if the upstream layout changed):
1. **ccfddl / ccf-deadlines** — `github.com/ccfddl/ccf-deadlines`. YAML per conference under
   `conference/<sub>/<name>.yml`; take `sub: AI` plus any AI-relevant entries in other categories (e.g.
   KDD under DB, multimedia/vision under MX). Schema: title, description, sub, rank {ccf, core, thcpl},
   dblp, confs[ {year, id, link, timeline[ {deadline, abstract_deadline, comment} ], timezone, date, place} ].
   Also ingest `accept_rates/` for history. Use the GitHub API tree listing + raw.githubusercontent.com.
2. **Hugging Face ai-deadlines** — `huggingface.co/spaces/huggingface/ai-deadlines`, data in
   `src/data/conferences/` (YAML). Strong coverage of ML/NLP/CV + GenAI venues and workshop tracks.
   Fetch via the HF Hub API (`/api/spaces/huggingface/ai-deadlines/tree/main/src/data/conferences`
   then `resolve/main/...` raw files). Inspect real files first and write the mapper from them.
3. **WikiCFP** — category RSS feeds for: machine learning, artificial intelligence, deep learning,
   natural language processing, computer vision, data mining, robotics, generative AI, LLM.
   Broadest source of smaller conferences and **workshops**. Use RSS only (check current feed URL
   format on wikicfp.com); follow item links only to read the event page fields (when, where,
   deadlines), politely rate-limited and cached 24h.
4. **OpenReview** (API v2, `api2.openreview.net`) — enrich venues hosted there (ICLR, NeurIPS, ICML
   workshops, TMLR-style tracks): venue group, submission deadline, workshop list for a parent venue.
5. **Official CFP pages** — for every event with a link, fetch the page, extract main text with
   Readability, store as `cfp_text` (+ hash; only re-process when changed). This feeds §4.3 and the chatbot.
6. **Topic tagging** — keyword rules first (fast, free); optional LLM tagging for untagged events,
   batched, only when `ENABLE_LLM_TAGGING=true`.

Scheduling:
- Vercel Cron in `vercel.json` → `GET /api/ingest` daily (Hobby plan allows daily jobs).
- `.github/workflows/ingest.yml` → every 6 hours `curl` the same endpoint with
  `Authorization: Bearer $CRON_SECRET` (secret stored in GitHub Actions secrets).
- Long runs: split work per adapter (`/api/ingest?source=wikicfp`) so each call stays within Vercel
  function time limits; set `export const maxDuration` appropriately.
- Owner "Refresh now" button on `/sources`.

## 6. AI assistant ("Ask FIndress")
- Lives on every detail page, scoped to that event; a global version on `/explore` can answer questions
  across the list ("Which GenAI workshops have deadlines in November in Asia?") via a tool that queries the DB.
- Built with Vercel AI SDK `streamText` + `useChat`, streaming, markdown rendering with code/math support.
- Provider configurable by env (`AI_PROVIDER`, `AI_MODEL`); default Anthropic. Keep the provider swap
  to one file (`src/lib/ai/model.ts`).
- **Grounding** (the key feature): the system prompt includes the event record + its `cfp_text`
  (trimmed to the most relevant chunks if long) + workshop list. Example: on ICML, "elaborate the
  problem statement" → the assistant explains the CFP's scope, themes, and what kinds of
  contributions are wanted, quoting/citing the CFP section it used.
- Tools available to the model:
  - `getEvent(slug)` / `searchEvents(filters)` — DB lookups
  - `fetchPage(url)` — fetch + readability extract a page linked from the CFP (allow-list: the
    event's own domain, openreview.net, arxiv.org)
  - `searchArxiv(query, max=5)` — arXiv API for related recent papers ("what's been published on this theme?")
- Suggested-prompt chips: "Elaborate the problem statement", "Summarize the CFP in 5 bullets",
  "Which topics fit a paper on <my area>?", "Key dates in IST", "Compare with last year",
  "Draft an abstract outline that fits this venue".
- Rules in the system prompt: answer from provided sources; say clearly when something isn't in the
  CFP; cite which section/URL; never fabricate dates.
- Chat history per event saved for the owner (table `chats`), clearable.
- Cost guard: owner-only (password gate), simple rate limit (e.g. 30 messages/hour), max tokens cap.

## 7. API routes
- `GET /api/events` — filtered/paginated JSON (public, cached `s-maxage=300`). Also the hook for
  optional external agents (e.g. OpenCode) — document it in README.
- `GET /api/events/[slug]`
- `GET /api/events/[slug]/ics` and `GET /api/workspace/ics` (all bookmarked deadlines)
- `GET /api/ingest?source=` — cron-protected
- `POST /api/chat` — owner-protected, streaming
- `POST/PATCH/DELETE /api/workspace/*` — bookmarks, status, notes (owner-protected)

## 8. Access
Single owner, no sign-up. `APP_PASSWORD` env; `/unlock` page sets a signed httpOnly cookie
(`AUTH_SECRET`); middleware protects `/workspace`, chat, notes, refresh. Browsing/explore/insights stay public.

## 9. Data model (Drizzle)
- `events`: id, slug, acronym, name, year, type, parent_event_id, subfields[], topics[], rank_core,
  rank_ccf, mode, city, country, country_code, continent, lat, lng, start_date, end_date, website,
  submission_site, page_limit, review_type, cfp_text, cfp_hash, cfp_fetched_at, created_at, updated_at,
  search_vector (tsvector)
- `deadlines`: id, event_id, kind (abstract|paper|supplementary|rebuttal|notification|camera_ready|
  registration|other), label, due_at_utc, original_tz, comment
- `event_sources`: event_id, source, source_id, url, fields_provided[], last_seen_at
- `acceptance_stats`: event_acronym, year, submitted, accepted, rate
- `source_runs`: id, source, started_at, finished_at, ok, items, error
- `bookmarks`: event_id, status (interested|planning|writing|submitted|accepted|rejected|attending), updated_at
- `notes`: event_id, body_md, updated_at
- `chats`: id, event_id (nullable for global), messages jsonb, updated_at
Geocode city/country once (static country centroid table + Nominatim for cities, cached, 1 req/s).

## 10. Quality bar
- Lighthouse ≥ 90 performance/accessibility on `/explore` (mobile).
- Vitest unit tests for every adapter's normalize() with fixture files, timezone/AoE conversion,
  and dedupe/merge logic.
- Empty, loading (skeletons), and error states designed for every view.
- README: what it is, screenshots, architecture diagram, env vars, how to run ingestion, API docs.

## 11. Optional (only if the owner asks later)
- OpenCode / other agents: consume `/api/events` or a small MCP server exposing `searchEvents` and `getEvent`.
- Email/Telegram reminders N days before bookmarked deadlines.
- "Fit score": paste your abstract, rank venues by topical fit using embeddings.
