import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { sourceRuns } from "@/lib/db/schema";
import { ccfddlAdapter } from "@/lib/sources/ccfddl";
import { huggingfaceAdapter } from "@/lib/sources/huggingface";
import { openreviewAdapter } from "@/lib/sources/openreview";
import { easychairAdapter } from "@/lib/sources/easychair";
import { wikicfpAdapter } from "@/lib/sources/wikicfp";
import {
  ENRICHMENT_STEPS,
  JOURNAL_STEPS,
  LIST_SOURCES,
  type EnrichmentStep,
  type JournalStep,
  type ListSourceName,
} from "@/lib/taxonomy";
import { aiConfigError, makeGenerate } from "@/lib/ai/extract-model";
import { enrichCfps } from "./enrich-cfp";
import { extractionEnabled, runExtractStep } from "./extract-cfp";
import { geocodeEvents } from "./geocode";
import {
  runJournalPagesStep,
  runJournalRanksStep,
  runJournalsStep,
  runSpecialIssuesStep,
} from "./journals";
import { acquireLease, releaseLease } from "./lease";
import { llmTagUntagged } from "./llm-tagging";
import { PoliteFetcher } from "./http";
import type { SourceAdapter } from "./types";
import { mergeEventInputs } from "./merge";
import {
  DbHttpCache,
  loadAllSourceItems,
  loadPreviousPayloads,
  refreshDerivedColumns,
  retagAll,
  saveAcceptance,
  saveSourceItems,
  writeMergedEvents,
} from "./persist";

export const ADAPTERS: Record<ListSourceName, SourceAdapter> = {
  ccfddl: ccfddlAdapter,
  huggingface: huggingfaceAdapter,
  openreview: openreviewAdapter,
  wikicfp: wikicfpAdapter,
  easychair: easychairAdapter,
};

export type StepName = ListSourceName | EnrichmentStep | JournalStep | "merge";
export const ALL_STEPS: StepName[] = [
  "ccfddl",
  "huggingface",
  "openreview",
  "wikicfp",
  "easychair",
  "merge",
  "cfp",
  "extract",
  "topics",
  "geocode",
  "journals",
  "journal-ranks",
  "journal-pages",
  "special-issues",
];

export interface StepReport {
  step: StepName;
  ok: boolean;
  items: number;
  durationMs: number;
  stats: Record<string, number | string>;
  warnings: string[];
  error?: string;
}

export interface RunOptions {
  /** Steps to run; default: every step. A list source implies a merge afterwards. */
  steps?: StepName[];
  /** Total time budget; adapters stop optional work (page enrichment, lookups) near the end. */
  budgetMs?: number;
  log?: (message: string) => void;
  env?: Record<string, string | undefined>;
}

export function parseSteps(input: string | null | undefined): StepName[] {
  if (!input || input === "all") return ALL_STEPS;
  const wanted = input.split(",").map((s) => s.trim().toLowerCase());
  const valid = wanted.filter((s): s is StepName => (ALL_STEPS as string[]).includes(s));
  if (valid.length !== wanted.length) {
    throw new Error(
      `Unknown step(s): ${wanted.filter((w) => !valid.includes(w as StepName)).join(", ")}`,
    );
  }
  return valid;
}

/** Where the last successful run of a source said the next one should resume (see AdapterResult). */
async function loadCursor(db: Db, source: StepName): Promise<string | null> {
  const [row] = await db
    .select({ cursor: sql<string | null>`${sourceRuns.stats}->>'cursor'` })
    .from(sourceRuns)
    .where(
      and(
        eq(sourceRuns.source, source),
        eq(sourceRuns.ok, true),
        sql`${sourceRuns.stats} ? 'cursor'`,
      ),
    )
    .orderBy(desc(sourceRuns.startedAt))
    .limit(1);
  return row?.cursor ?? null;
}

/**
 * What a step returns. `failed` marks a step that ran to the end but produced nothing usable
 * (a list source that suddenly lists nothing, every CFP page blocked): it is recorded with its
 * stats but counts as a failure, so the scheduled job turns red instead of reporting success.
 */
interface StepOutcome {
  items: number;
  stats: Record<string, number | string>;
  warnings?: string[];
  failed?: string | null;
}

async function recordRun<T extends StepOutcome>(
  db: Db,
  step: StepName,
  fn: () => Promise<T>,
): Promise<StepReport> {
  const started = Date.now();
  const [row] = await db
    .insert(sourceRuns)
    .values({ source: step })
    .returning({ id: sourceRuns.id });
  try {
    const out = await fn();
    const warnings = out.warnings ?? [];
    const problems = [...(out.failed ? [out.failed] : []), ...warnings];
    await db
      .update(sourceRuns)
      .set({
        finishedAt: new Date(),
        ok: !out.failed,
        items: out.items,
        error: problems.length ? problems.slice(0, 5).join(" | ").slice(0, 2000) : null,
        stats: { ...out.stats, warnings: warnings.length },
      })
      .where(eq(sourceRuns.id, row.id));
    return {
      step,
      ok: !out.failed,
      items: out.items,
      durationMs: Date.now() - started,
      stats: out.stats,
      warnings,
      ...(out.failed ? { error: out.failed } : {}),
    };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    await db
      .update(sourceRuns)
      .set({ finishedAt: new Date(), ok: false, error: message.slice(0, 2000) })
      .where(eq(sourceRuns.id, row.id));
    return {
      step,
      ok: false,
      items: 0,
      durationMs: Date.now() - started,
      stats: {},
      warnings: [],
      error: message,
    };
  }
}

/** Another ingestion run holds the lease; this one did nothing. */
export class IngestionBusyError extends Error {
  constructor() {
    super("another ingestion run is in progress; this one was skipped");
    this.name = "IngestionBusyError";
  }
}

const LEASE = "ingest";
/** How long the lease lasts without renewal; it is renewed before every step. */
const LEASE_TTL_MS = 60 * 60_000;

/**
 * Run ingestion. Each step is isolated: a failing source is logged to source_runs and the
 * rest continue (fail soft). Only one run at a time, from any entry point: if another run
 * holds the lease this throws IngestionBusyError without touching anything.
 */
export async function runIngestion(db: Db, opts: RunOptions = {}): Promise<StepReport[]> {
  const holder = `${process.env.VERCEL_DEPLOYMENT_ID ?? "local"}:${crypto.randomUUID()}`;
  if (!(await acquireLease(db, LEASE, holder, LEASE_TTL_MS))) throw new IngestionBusyError();
  // Renewed before each step while this run still holds it: a long run keeps its lease, a
  // crashed one frees it within LEASE_TTL_MS.
  const renew = () =>
    db
      .execute(
        sql`update ingest_lease set expires_at = now() + ${`${LEASE_TTL_MS} milliseconds`}::interval
            where name = ${LEASE} and holder = ${holder}`,
      )
      .then(() => {});
  try {
    return await runSteps(db, opts, renew);
  } finally {
    await releaseLease(db, LEASE, holder).catch(() => {});
  }
}

async function runSteps(
  db: Db,
  opts: RunOptions,
  renewLease: () => Promise<void>,
): Promise<StepReport[]> {
  const log = opts.log ?? (() => {});
  const env = opts.env ?? process.env;
  const steps = new Set(opts.steps ?? ALL_STEPS);
  const started = Date.now();
  const deadlineMs = started + (opts.budgetMs ?? 24 * 3600_000);
  const fetcher = new PoliteFetcher({ cache: new DbHttpCache(db) });
  const reports: StepReport[] = [];

  const listSteps = LIST_SOURCES.filter((s) => steps.has(s));
  for (const name of listSteps) {
    await renewLease();
    log(`→ ${name}`);
    const report = await recordRun(db, name, async () => {
      const runStartedAt = new Date();
      const previous = await loadPreviousPayloads(db, name);
      const cursor = await loadCursor(db, name);
      // WikiCFP is slow by design (5s crawl delay): leave it most of the remaining budget.
      const result = await ADAPTERS[name].run({
        fetcher,
        deadlineMs,
        now: new Date(),
        log,
        previous,
        cursor,
        env,
      });
      const saved = await saveSourceItems(
        db,
        name,
        result.events,
        runStartedAt,
        result.pruneStale,
        result.keepSourceIds,
      );
      const acceptance = result.acceptance ? await saveAcceptance(db, result.acceptance) : 0;
      return {
        // A source that listed items before and now lists none is broken, not empty.
        failed:
          result.events.length === 0 && previous.size > 0
            ? `${name} returned no items (it had ${previous.size}); the previous ones were kept`
            : null,
        items: saved.saved,
        stats: {
          ...result.stats,
          pruned: saved.pruned,
          ...(acceptance ? { acceptance } : {}),
          ...(result.nextCursor != null ? { cursor: result.nextCursor } : {}),
        },
        warnings: result.warnings,
      };
    });
    reports.push(report);
    log(`  ${report.ok ? "ok" : "FAILED"} ${name}: ${report.items} items ${report.error ?? ""}`);
  }

  if (listSteps.length > 0 || steps.has("merge")) {
    await renewLease();
    log("→ merge");
    reports.push(
      await recordRun(db, "merge", async () => {
        const merged = mergeEventInputs(await loadAllSourceItems(db));
        const out = await writeMergedEvents(db, merged);
        return { items: out.upserted, stats: out };
      }),
    );
  }

  for (const step of ENRICHMENT_STEPS.filter((s) => steps.has(s))) {
    await renewLease();
    log(`→ ${step}`);
    if (step === "cfp") {
      reports.push(
        await recordRun(db, "cfp", async () => {
          const out = await enrichCfps(db, fetcher, deadlineMs, log);
          await refreshDerivedColumns(db);
          return {
            items: out.updated + out.unchanged,
            stats: out,
            failed:
              out.attempted >= 5 && out.updated + out.unchanged === 0
                ? `no usable CFP page in ${out.attempted} attempts (${out.blocked} blocked)`
                : null,
          };
        }),
      );
    } else if (step === "extract") {
      reports.push(
        await recordRun(db, "extract", async () => {
          if (!extractionEnabled(env)) {
            return {
              items: 0,
              stats: { requests: 0 },
              warnings: [
                "disabled: set ENABLE_AI_EXTRACTION=true after reviewing the accuracy sample",
              ],
            };
          }
          const configError = aiConfigError();
          if (configError) {
            return { items: 0, stats: { requests: 0 }, warnings: [`skipped: ${configError}`] };
          }
          const { generate, label } = makeGenerate();
          return runExtractStep(db, deadlineMs, log, { generate, model: label });
        }),
      );
    } else if (step === "topics") {
      reports.push(
        await recordRun(db, "topics", async () => {
          const n = await retagAll(db);
          const llm = await llmTagUntagged(db, deadlineMs).catch((err: Error) => ({
            skipped: err.message,
            tagged: 0,
          }));
          await refreshDerivedColumns(db);
          return {
            items: n,
            stats: {
              retagged: n,
              llmTagged: llm.tagged,
              ...("skipped" in llm ? { llm: String(llm.skipped) } : {}),
            },
          };
        }),
      );
    } else if (step === "geocode") {
      reports.push(
        await recordRun(db, "geocode", async () => {
          const out = await geocodeEvents(db, fetcher, deadlineMs, log);
          return { items: out.geocoded + out.fromCountry, stats: out };
        }),
      );
    }
  }
  for (const step of JOURNAL_STEPS.filter((s) => steps.has(s))) {
    await renewLease();
    log(`→ ${step}`);
    reports.push(
      await recordRun(db, step, () => {
        switch (step) {
          case "journals":
            return runJournalsStep(db, fetcher, deadlineMs, env, log);
          case "journal-ranks":
            return runJournalRanksStep(db, fetcher, deadlineMs, log);
          case "journal-pages":
            return loadCursor(db, step).then((c) =>
              runJournalPagesStep(db, fetcher, deadlineMs, log, c),
            );
          case "special-issues":
            return loadCursor(db, step).then((c) =>
              runSpecialIssuesStep(db, fetcher, deadlineMs, log, c),
            );
        }
      }),
    );
  }
  log(`done in ${Math.round((Date.now() - started) / 1000)}s`);
  return reports;
}
