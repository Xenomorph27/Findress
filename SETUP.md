# FIndress — your setup guide (read this first)

This kit gives Claude Code everything it needs to build FIndress. You do steps 1–4 once,
then paste prompts and review.

## What's in the kit

| File             | Who reads it                               | Purpose                                                  |
| ---------------- | ------------------------------------------ | -------------------------------------------------------- |
| `SETUP.md`       | You                                        | This guide                                               |
| `PROMPT.md`      | You → paste into Claude Code               | Kickoff prompt + one prompt per build phase              |
| `CLAUDE.md`      | Claude Code (automatically, every session) | Project rules, stack, git workflow                       |
| `docs/SPEC.md`   | Claude Code                                | Every feature, data source, the AI assistant, data model |
| `docs/DESIGN.md` | Claude Code                                | The visual design brief ("Research Observatory")         |
| `.env.example`   | Both                                       | All environment variables the app needs                  |

## 1. Install the tools (once)

- **Git** and **Node.js 20+** (nodejs.org). Then `npm install -g pnpm`.
- **GitHub CLI**: https://cli.github.com, then run `gh auth login` (lets Claude Code push to your repo).
- **Claude Code** (needs a Claude Pro/Max/Team/Enterprise or Console account):
  - Windows PowerShell: `irm https://claude.ai/install.ps1 | iex`
  - macOS / Linux / WSL: `curl -fsSL https://claude.ai/install.sh | bash`
  - Check with `claude --version`. Docs: https://code.claude.com/docs/en/setup
  - On Windows, also install Git for Windows so Claude Code can use Bash.

## 2. Put the kit into your repo

```bash
git clone https://github.com/Xenomorph27/Findress.git
cd Findress
# copy everything from this kit into this folder (CLAUDE.md, PROMPT.md, SETUP.md, .env.example, docs/)
git add . && git commit -m "chore: add FIndress build kit" && git push
```

## 3. Start Claude Code

```bash
cd Findress
claude
```

Log in when the browser opens. Paste **Prompt 0** from `PROMPT.md`. Read its plan, answer its
questions, then type `go`. After each phase it pushes and stops; paste the next phase prompt.

Tip: if a session gets long, type `/clear` and paste the next phase prompt. CLAUDE.md and docs/
keep it on track.

## 4. Connect Vercel (during Phase 1 — Claude Code will tell you when)

1. vercel.com → **Add New → Project** → import `Xenomorph27/Findress` → Deploy.
   Every push to `main` now deploys automatically.
2. Project → **Storage** → add **Neon (Postgres)**. This creates `DATABASE_URL` for you.
3. Project → **Settings → Environment Variables**: add the rest from `.env.example`
   (`CRON_SECRET`, `APP_PASSWORD`, `AUTH_SECRET`, `GOOGLE_GENERATIVE_AI_API_KEY` …). The full list is in
   `docs/DEPLOY.md`.
   Generate random secrets with: `openssl rand -base64 32`.
4. To pull those values locally: `npx vercel link` then `npx vercel env pull .env.local`.
5. GitHub repo → **Settings → Secrets and variables → Actions**: add `CRON_SECRET` and
   `SITE_URL` (your vercel.app URL) for the 6-hourly refresh.

## 5. The AI assistant key

The chatbot needs an LLM API key. Default is Google Gemini (`gemini-3.8-flash`): create a key at
https://aistudio.google.com/apikey and set `GOOGLE_GENERATIVE_AI_API_KEY` (with `AI_PROVIDER=google`).
It is billed per use; the app has a rate limit and is locked behind your password so others can't run
up the bill. Anthropic stays available (`AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`), and the
provider lives in one file (`src/lib/ai/model.ts`).

## What "real-time" means here

Conference data is re-pulled every 6 hours (plus daily backup and a "Refresh now" button) from
ccfddl, Hugging Face ai-deadlines, WikiCFP, OpenReview and each conference's official CFP page.
Each source's "last updated" time is shown on the Sources page, so you always know how fresh it is.

## OpenCode (optional, later)

Not needed. The app exposes a public `/api/events` endpoint, so OpenCode or any other agent can
use FIndress data later without changes to the app.
