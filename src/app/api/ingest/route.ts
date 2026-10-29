import { revalidateTag } from "next/cache";
import { hasCronSecret } from "@/lib/auth/cron";
import { isOwnerRequest } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { IngestionBusyError, parseSteps, runIngestion } from "@/lib/ingest/run";

/**
 * GET  /api/ingest?source=<step[,step]>  — Vercel Cron / GitHub Action (Bearer CRON_SECRET)
 * POST /api/ingest?source=…               — owner "Refresh now" (owner cookie) or Bearer
 *
 * Steps: ccfddl, huggingface, openreview, wikicfp, merge, cfp, topics, geocode (default: all).
 * Each call stays inside the function limit by giving adapters a time budget.
 *
 * Status: 200 when every step is ok; 500 when any step failed (the JSON still has every report,
 * and later steps still ran) or the run could not start (the JSON says why, e.g. a missing
 * table); 409 when another ingestion run holds the lease (nothing was done).
 */
export const maxDuration = 300;
const BUDGET_MS = 270_000;

async function handle(request: Request): Promise<Response> {
  const db = getDb();
  if (!db) {
    return Response.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  }
  const url = new URL(request.url);
  let steps;
  try {
    steps = parseSteps(url.searchParams.get("source") ?? url.searchParams.get("steps"));
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
  const budget = Math.min(
    Number(url.searchParams.get("budget") ?? BUDGET_MS / 1000) * 1000,
    BUDGET_MS,
  );
  let reports;
  try {
    reports = await runIngestion(db, {
      steps,
      budgetMs: budget,
      log: (m) => console.log(`[ingest] ${m}`),
    });
  } catch (err) {
    if (err instanceof IngestionBusyError) {
      return Response.json(
        { ok: false, skipped: true, error: err.message },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    // Report why instead of an empty 500, so the Action log shows the cause.
    const message = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : null;
    console.error("[ingest] run could not start:", cause ?? message);
    return Response.json(
      { ok: false, error: cause ? `${message}: ${cause}` : message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  revalidateTag("events", "max");
  revalidateTag("journals", "max");
  revalidateTag("sources", "max");
  const ok = reports.every((r) => r.ok);
  return Response.json(
    { ok, reports },
    { status: ok ? 200 : 500, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  if (!hasCronSecret(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return handle(request);
}

export async function POST(request: Request) {
  if (!hasCronSecret(request) && !(await isOwnerRequest(request))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return handle(request);
}
