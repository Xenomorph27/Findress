import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cacheTag } from "next/cache";
import { getDb } from "@/lib/db";
import { acceptanceStats, deadlines, events, eventSources } from "@/lib/db/schema";
import type { EventDetail, ExplorerRow, RowDeadline } from "./types";
import { settle, type Settled, unwrap } from "./settle";

/**
 * Cached read models. Every loader is tagged "events" so ingestion can invalidate them with
 * revalidateTag("events"). Loaders return empty results when DATABASE_URL is missing; callers
 * use `withDbFallback` so a database outage renders an error state instead of crashing. Each
 * loader is split into public → cached → query so no error escapes the cache (see ./settle):
 * otherwise an unreachable database fails `next build`.
 */

export type LoadResult<T> = { data: T; error: null } | { data: T; error: string };

export async function withDbFallback<T>(fallback: T, fn: () => Promise<T>): Promise<LoadResult<T>> {
  if (!process.env.DATABASE_URL) return { data: fallback, error: "not-configured" };
  try {
    return { data: await fn(), error: null };
  } catch (err) {
    console.error("[data]", err);
    return { data: fallback, error: (err as Error).message || "database error" };
  }
}

const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);

/** All editions worth exploring: anything from the last ~13 months onward. */
export async function getExplorerRows(): Promise<ExplorerRow[]> {
  return unwrap(await getExplorerRowsCached());
}

async function getExplorerRowsCached(): Promise<Settled<ExplorerRow[]>> {
  "use cache";
  cacheTag("events");
  return settle("hours", () => getExplorerRowsQuery());
}

async function getExplorerRowsQuery(): Promise<ExplorerRow[]> {
  const db = getDb();
  if (!db) return [];

  const cutoff = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
  const year = new Date().getUTCFullYear();
  const parent = alias(events, "parent");
  const rows = await db
    .select({
      id: events.id,
      slug: events.slug,
      seriesKey: events.seriesKey,
      acronym: events.acronym,
      name: events.name,
      year: events.year,
      type: events.type,
      parentSlug: parent.slug,
      parentAcronym: parent.acronym,
      parentYear: parent.year,
      subfields: events.subfields,
      topics: events.topics,
      rankCore: events.rankCore,
      rankCcf: events.rankCcf,
      mode: events.mode,
      city: events.city,
      country: events.country,
      countryCode: events.countryCode,
      continent: events.continent,
      lat: events.lat,
      lng: events.lng,
      startDate: events.startDate,
      endDate: events.endDate,
      hasRebuttal: events.hasRebuttal,
      reviewType: events.reviewType,
      sources: events.sources,
      createdAt: events.createdAt,
    })
    .from(events)
    .leftJoin(parent, eq(parent.id, events.parentEventId))
    .where(
      or(gte(events.startDate, cutoff), and(isNull(events.startDate), gte(events.year, year - 1))),
    );

  const ids = rows.map((r) => r.id);
  const dls = ids.length
    ? await db
        .select({
          eventId: deadlines.eventId,
          kind: deadlines.kind,
          dueAtUtc: deadlines.dueAtUtc,
          label: deadlines.label,
        })
        .from(deadlines)
        .where(and(inArray(deadlines.eventId, ids), inArray(deadlines.kind, ["abstract", "paper"])))
        .orderBy(asc(deadlines.dueAtUtc))
    : [];
  const byEvent = new Map<number, RowDeadline[]>();
  for (const d of dls) {
    const list = byEvent.get(d.eventId) ?? [];
    list.push({ kind: d.kind as RowDeadline["kind"], at: d.dueAtUtc.getTime(), label: d.label });
    byEvent.set(d.eventId, list);
  }

  const newestYear = new Map<string, number>();
  for (const r of rows)
    newestYear.set(r.seriesKey, Math.max(newestYear.get(r.seriesKey) ?? 0, r.year));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    acronym: r.acronym,
    name: r.name,
    year: r.year,
    type: r.type,
    parent: r.parentSlug
      ? { slug: r.parentSlug, acronym: r.parentAcronym!, year: r.parentYear! }
      : null,
    subfields: r.subfields,
    topics: r.topics.slice(0, 4),
    rankCore: r.rankCore,
    rankCcf: r.rankCcf,
    mode: r.mode,
    city: r.city,
    country: r.country,
    countryCode: r.countryCode,
    continent: r.continent,
    lat: r.lat != null ? Math.round(r.lat * 100) / 100 : null,
    lng: r.lng != null ? Math.round(r.lng * 100) / 100 : null,
    startDate: r.startDate,
    endDate: r.endDate,
    deadlines: byEvent.get(r.id) ?? [],
    hasRebuttal: r.hasRebuttal,
    reviewType: r.reviewType,
    communityOnly:
      r.sources.length > 0 && r.sources.every((s) => s === "wikicfp") && !r.rankCore && !r.rankCcf,
    latestInSeries: newestYear.get(r.seriesKey) === r.year,
    sources: r.sources,
    createdAt: r.createdAt.getTime(),
  }));
}

/** Postgres full-text search (used by /api/events and the command palette). */
export async function searchEventIds(query: string, limit = 200): Promise<number[]> {
  return unwrap(await searchEventIdsCached(query, limit));
}

async function searchEventIdsCached(query: string, limit = 200): Promise<Settled<number[]>> {
  "use cache";
  cacheTag("events");
  return settle("hours", () => searchEventIdsQuery(query, limit));
}

async function searchEventIdsQuery(query: string, limit = 200): Promise<number[]> {
  const db = getDb();
  const q = query.trim();
  if (!db || !q) return [];
  const prefix = `${q.replace(/[%_]/g, "")}%`;
  const rows = await db
    .select({ id: events.id })
    .from(events)
    .where(
      sql`${events.searchVector} @@ websearch_to_tsquery('english', ${q})
        or ${events.searchVector} @@ websearch_to_tsquery('simple', ${q})
        or ${events.acronym} ilike ${prefix}
        or ${events.name} ilike ${`%${q.replace(/[%_]/g, "")}%`}`,
    )
    .orderBy(
      sql`(${events.acronym} ilike ${prefix}) desc`,
      sql`ts_rank(${events.searchVector}, websearch_to_tsquery('english', ${q})) desc`,
      desc(events.year),
    )
    .limit(limit);
  return rows.map((r) => r.id);
}

export async function getEventDetail(slug: string): Promise<EventDetail | null> {
  return unwrap(await getEventDetailCached(slug));
}

async function getEventDetailCached(slug: string): Promise<Settled<EventDetail | null>> {
  "use cache";
  cacheTag("events", `event:${slug}`);
  return settle("hours", () => getEventDetailQuery(slug));
}

async function getEventDetailQuery(slug: string): Promise<EventDetail | null> {
  const db = getDb();
  if (!db) return null;

  const [e] = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
  if (!e) return null;

  const [dl, refs, parentRows, children, history, acceptance] = await Promise.all([
    db.select().from(deadlines).where(eq(deadlines.eventId, e.id)).orderBy(asc(deadlines.dueAtUtc)),
    db.select().from(eventSources).where(eq(eventSources.eventId, e.id)),
    e.parentEventId
      ? db
          .select({
            slug: events.slug,
            acronym: events.acronym,
            year: events.year,
            name: events.name,
          })
          .from(events)
          .where(eq(events.id, e.parentEventId))
          .limit(1)
      : Promise.resolve([]),
    db
      .select({
        id: events.id,
        slug: events.slug,
        acronym: events.acronym,
        name: events.name,
        type: events.type,
        startDate: events.startDate,
        website: events.website,
        nextDeadlineAt: events.nextDeadlineAt,
        nextDeadlineKind: events.nextDeadlineKind,
      })
      .from(events)
      .where(eq(events.parentEventId, e.id))
      .orderBy(sql`${events.nextDeadlineAt} asc nulls last`, asc(events.acronym)),
    db
      .select({
        slug: events.slug,
        year: events.year,
        city: events.city,
        country: events.country,
        countryCode: events.countryCode,
        startDate: events.startDate,
        endDate: events.endDate,
        dateText: events.dateText,
      })
      .from(events)
      .where(eq(events.seriesKey, e.seriesKey))
      .orderBy(desc(events.year)),
    db
      .select()
      .from(acceptanceStats)
      .where(eq(acceptanceStats.eventAcronym, e.seriesKey))
      .orderBy(asc(acceptanceStats.year)),
  ]);

  return {
    id: e.id,
    slug: e.slug,
    seriesKey: e.seriesKey,
    acronym: e.acronym,
    name: e.name,
    year: e.year,
    type: e.type,
    parent: parentRows[0] ?? null,
    subfields: e.subfields,
    topics: e.topics,
    cfpTopics: e.cfpTopics,
    rankCore: e.rankCore,
    rankCcf: e.rankCcf,
    mode: e.mode,
    locationRaw: e.locationRaw,
    venue: e.venue,
    city: e.city,
    country: e.country,
    countryCode: e.countryCode,
    continent: e.continent,
    startDate: e.startDate,
    endDate: e.endDate,
    dateText: e.dateText,
    website: e.website,
    description: e.description,
    submissionSite: e.submissionSite,
    pageLimit: e.pageLimit,
    reviewType: e.reviewType,
    hasRebuttal: e.hasRebuttal,
    cfpText: e.cfpText,
    cfpUrl: e.cfpUrl,
    cfpFetchedAt: isoOrNull(e.cfpFetchedAt),
    sources: e.sources,
    provenance: e.fieldProvenance,
    updatedAt: e.updatedAt.toISOString(),
    deadlines: dl.map((d) => ({
      kind: d.kind,
      label: d.label,
      dueAtUtc: d.dueAtUtc.toISOString(),
      originalTz: d.originalTz,
      originalText: d.originalText,
      comment: d.comment,
      source: d.source,
    })),
    sourceRefs: refs.map((r) => ({
      source: r.source,
      sourceId: r.sourceId,
      url: r.url,
      fieldsProvided: r.fieldsProvided,
      lastSeenAt: r.lastSeenAt.toISOString(),
    })),
    children: children.map((c) => ({
      slug: c.slug,
      acronym: c.acronym,
      name: c.name,
      type: c.type,
      startDate: c.startDate,
      website: c.website,
      nextDeadline:
        c.nextDeadlineAt && c.nextDeadlineKind
          ? { kind: c.nextDeadlineKind, at: c.nextDeadlineAt.toISOString() }
          : null,
    })),
    history: history.filter((h) => h.slug !== e.slug),
    acceptance: acceptance.map((a) => ({
      year: a.year,
      submitted: a.submitted,
      accepted: a.accepted,
      rate: a.rate,
      sourceUrl: a.sourceUrl,
    })),
  };
}

/** Lightweight lookup for metadata. */
export async function getEventMeta(slug: string) {
  return unwrap(await getEventMetaCached(slug));
}

async function getEventMetaCached(slug: string) {
  "use cache";
  cacheTag("events", `event:${slug}`);
  return settle("hours", () => getEventMetaQuery(slug));
}

async function getEventMetaQuery(slug: string) {
  const db = getDb();
  if (!db) return null;
  const [e] = await db
    .select({
      acronym: events.acronym,
      year: events.year,
      name: events.name,
      city: events.city,
      country: events.country,
    })
    .from(events)
    .where(eq(events.slug, slug))
    .limit(1);
  return e ?? null;
}
