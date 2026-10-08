import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { sourceRuns } from "@/lib/db/schema";
import { ccfddlAdapter } from "@/lib/sources/ccfddl";
import { huggingfaceAdapter } from "@/lib/sources/huggingface";
import { openreviewAdapter } from "@/lib/sources/openreview";
import { wikicfpAdapter } from "@/lib/sources/wikicfp";
import {
  ENRICHMENT_STEPS,
  LIST_SOURCES,
  type EnrichmentStep,
  type ListSourceName,
} from "@/lib/taxonomy";
import { enrichCfps } from "./enrich-cfp";
import { geocodeEvents } from "./geocode";
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
};

export type StepName = ListSourceName | EnrichmentStep | "merge";
export const ALL_STEPS: StepName[] = [
  "ccfddl",
  "huggingface",
  "openreview",
  "wikicfp",
  "merge",
  "cfp",
  "topics",
  "geocode",
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

async function recordRun<
  T extends { items: number; stats: Record<string, number | string>; warnings?: string[] },
>(db: Db, step: StepName, fn: () => Promise<T>): Promise<StepReport> {
  const started = Date.now();
  const [row] = await db
    .insert(sourceRuns)
    .values({ source: step })
    .returning({ id: sourceRuns.id });
  try {
    const out = await fn();
    const warnings = out.warnings ?? [];
    await db
      .update(sourceRuns)
      .set({
        finishedAt: new Date(),
        ok: true,
        items: out.items,
        error: warnings.length ? warnings.slice(0, 5).join(" | ").slice(0, 2000) : null,
        stats: { ...out.stats, warnings: warnings.length },
      })
      .where(eq(sourceRuns.id, row.id));
    return {
      step,
      ok: true,
      items: out.items,
      durationMs: Date.now() - started,
      stats: out.stats,
      warnings,
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

/**
 * Run ingestion. Each step is isolated: a failing source is logged to source_runs and the
 * rest continue (CLAUDE.md: fail soft).
 */
export async function runIngestion(db: Db, opts: RunOptions = {}): Promise<StepReport[]> {
  const log = opts.log ?? (() => {});
  const env = opts.env ?? process.env;
  const steps = new Set(opts.steps ?? ALL_STEPS);
  const started = Date.now();
  const deadlineMs = started + (opts.budgetMs ?? 24 * 3600_000);
  const fetcher = new PoliteFetcher({ cache: new DbHttpCache(db) });
  const reports: StepReport[] = [];

  const listSteps = LIST_SOURCES.filter((s) => steps.has(s));
  for (const name of listSteps) {
    log(`→ ${name}`);
    const report = await recordRun(db, name, async () => {
      const runStartedAt = new Date();
      const previous = await loadPreviousPayloads(db, name);
      // WikiCFP is slow by design (5s crawl delay): leave it most of the remaining budget.
      const result = await ADAPTERS[name].run({
        fetcher,
        deadlineMs,
        now: new Date(),
        log,
        previous,
        env,
      });
      const saved = await saveSourceItems(db, name, result.events, runStartedAt, result.pruneStale);
      const acceptance = result.acceptance ? await saveAcceptance(db, result.acceptance) : 0;
      return {
        items: saved.saved,
        stats: { ...result.stats, pruned: saved.pruned, ...(acceptance ? { acceptance } : {}) },
        warnings: result.warnings,
      };
    });
    reports.push(report);
    log(`  ${report.ok ? "ok" : "FAILED"} ${name}: ${report.items} items ${report.error ?? ""}`);
  }

  if (listSteps.length > 0 || steps.has("merge")) {
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
    log(`→ ${step}`);
    if (step === "cfp") {
      reports.push(
        await recordRun(db, "cfp", async () => {
          const out = await enrichCfps(db, fetcher, deadlineMs, log);
          await refreshDerivedColumns(db);
          return { items: out.updated + out.unchanged, stats: out };
        }),
      );
    } else if (step === "topics") {
      reports.push(
        await recordRun(db, "topics", async () => {
          const n = await retagAll(db);
          await refreshDerivedColumns(db);
          return { items: n, stats: { retagged: n } };
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
  log(`done in ${Math.round((Date.now() - started) / 1000)}s`);
  return reports;
}
