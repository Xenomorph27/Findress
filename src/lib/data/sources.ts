import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { cacheTag } from "next/cache";
import { getDb } from "@/lib/db";
import { events, journals, sourceItems, sourceRuns, specialIssues } from "@/lib/db/schema";
import { SOURCES } from "@/lib/taxonomy";
import { settle, type Settled, unwrap } from "./settle";

export interface SourceHealth {
  source: string;
  lastRun: {
    startedAt: string;
    finishedAt: string | null;
    ok: boolean | null;
    items: number;
    error: string | null;
    stats: Record<string, number | string> | null;
  } | null;
  lastSuccessAt: string | null;
  items: number;
  recentRuns: { startedAt: string; ok: boolean | null; items: number }[];
}

export interface SourcesOverview {
  sources: SourceHealth[];
  merge: SourceHealth | null;
  totals: {
    events: number;
    withCfp: number;
    geocoded: number;
    workshops: number;
    journals: number;
    specialIssues: number;
  };
}

export async function getSourcesOverview(): Promise<SourcesOverview> {
  return unwrap(await getSourcesOverviewCached());
}

async function getSourcesOverviewCached(): Promise<Settled<SourcesOverview>> {
  "use cache";
  cacheTag("events", "journals", "sources");
  return settle("minutes", () => getSourcesOverviewQuery());
}

async function getSourcesOverviewQuery(): Promise<SourcesOverview> {
  const db = getDb();
  if (!db)
    return {
      sources: [],
      merge: null,
      totals: { events: 0, withCfp: 0, geocoded: 0, workshops: 0, journals: 0, specialIssues: 0 },
    };

  const itemCounts = await db
    .select({ source: sourceItems.source, n: sql<number>`count(*)::int` })
    .from(sourceItems)
    .groupBy(sourceItems.source);
  const countBy = new Map(itemCounts.map((r) => [r.source, Number(r.n)]));

  const health = async (source: string): Promise<SourceHealth> => {
    const runs = await db
      .select()
      .from(sourceRuns)
      .where(eq(sourceRuns.source, source))
      .orderBy(desc(sourceRuns.startedAt))
      .limit(12);
    const [success] = await db
      .select({ finishedAt: sourceRuns.finishedAt })
      .from(sourceRuns)
      .where(sql`${sourceRuns.source} = ${source} and ${sourceRuns.ok} = true`)
      .orderBy(desc(sourceRuns.startedAt))
      .limit(1);
    const last = runs[0];
    return {
      source,
      lastRun: last
        ? {
            startedAt: last.startedAt.toISOString(),
            finishedAt: last.finishedAt?.toISOString() ?? null,
            ok: last.ok,
            items: last.items,
            error: last.error,
            stats: last.stats ?? null,
          }
        : null,
      lastSuccessAt: success?.finishedAt?.toISOString() ?? null,
      items: countBy.get(source) ?? last?.items ?? 0,
      recentRuns: runs.map((r) => ({
        startedAt: r.startedAt.toISOString(),
        ok: r.ok,
        items: r.items,
      })),
    };
  };

  const [sources, merge, [totals], [jt]] = await Promise.all([
    Promise.all(SOURCES.map(health)),
    health("merge"),
    db
      .select({
        events: sql<number>`count(*)::int`,
        withCfp: sql<number>`count(*) filter (where ${events.cfpText} is not null)::int`,
        geocoded: sql<number>`count(*) filter (where ${events.lat} is not null)::int`,
        workshops: sql<number>`count(*) filter (where ${events.type} = 'workshop')::int`,
      })
      .from(events),
    db
      .select({
        journals: sql<number>`(select count(*)::int from ${journals})`,
        specialIssues: sql<number>`(select count(*)::int from ${specialIssues})`,
      })
      .from(sql`(select 1) as one`),
  ]);
  return {
    sources,
    merge: merge.lastRun ? merge : null,
    totals: {
      ...totals,
      journals: Number(jt?.journals ?? 0),
      specialIssues: Number(jt?.specialIssues ?? 0),
    },
  };
}
