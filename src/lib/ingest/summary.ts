import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { deadlines, events } from "@/lib/db/schema";

/** Counts + the next 10 submission deadlines, for the CLI report and /sources. */
export async function summarize(db: Db) {
  const [counts] = await db
    .select({
      events: sql<number>`count(*)::int`,
      conferences: sql<number>`count(*) filter (where type = 'conference')::int`,
      workshops: sql<number>`count(*) filter (where type = 'workshop')::int`,
      upcoming: sql<number>`count(*) filter (where next_deadline_at >= now())::int`,
      withCfp: sql<number>`count(*) filter (where cfp_text is not null)::int`,
      geocoded: sql<number>`count(*) filter (where lat is not null)::int`,
    })
    .from(events);
  const bySourceRows = await db.execute<{ source: string; n: number }>(
    sql`select unnest(sources) as source, count(*)::int as n from ${events} group by 1 order by 2 desc`,
  );
  const nextDeadlines = await db
    .select({
      acronym: events.acronym,
      year: events.year,
      kind: deadlines.kind,
      dueAtUtc: deadlines.dueAtUtc,
      originalText: deadlines.originalText,
      originalTz: deadlines.originalTz,
      source: deadlines.source,
    })
    .from(deadlines)
    .innerJoin(events, eq(events.id, deadlines.eventId))
    .where(and(gt(deadlines.dueAtUtc, new Date()), inArray(deadlines.kind, ["abstract", "paper"])))
    .orderBy(asc(deadlines.dueAtUtc))
    .limit(10);
  return {
    ...counts,
    other: counts.events - counts.conferences - counts.workshops,
    bySource: Object.fromEntries(bySourceRows.rows.map((r) => [r.source, Number(r.n)])),
    nextDeadlines,
  };
}
