import { and, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import {
  acceptanceStats,
  bookmarks,
  chats,
  deadlines,
  events,
  eventSources,
  httpCache,
  notes,
  sourceItems,
} from "@/lib/db/schema";
import { tagEvent } from "@/lib/sources/topics";
import type { SourceName } from "@/lib/taxonomy";
import { continentFor, countryByCode } from "./countries";
import type { HttpCacheStore } from "./http";
import { dedupeKeyFor } from "./keys";
import type { MergedEvent } from "./merge";
import { EventInputSchema, type AcceptanceInput, type EventInput } from "./types";

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/** http_cache table as the PoliteFetcher cache (works across serverless invocations). */
export class DbHttpCache implements HttpCacheStore {
  constructor(private db: Db) {}
  async get(url: string) {
    const [row] = await this.db.select().from(httpCache).where(eq(httpCache.url, url)).limit(1);
    return row ? { status: row.status, body: row.body, fetchedAt: row.fetchedAt } : null;
  }
  async set(url: string, status: number, body: string | null) {
    await this.db
      .insert(httpCache)
      .values({ url, status, body, fetchedAt: new Date() })
      .onConflictDoUpdate({
        target: httpCache.url,
        set: { status, body, fetchedAt: new Date() },
      });
  }
}

export async function loadPreviousPayloads(
  db: Db,
  source: SourceName,
): Promise<Map<string, EventInput>> {
  const rows = await db
    .select({ sourceId: sourceItems.sourceId, payload: sourceItems.payload })
    .from(sourceItems)
    .where(eq(sourceItems.source, source));
  const map = new Map<string, EventInput>();
  for (const r of rows) {
    const parsed = EventInputSchema.safeParse(r.payload);
    if (parsed.success) map.set(r.sourceId, parsed.data);
  }
  return map;
}

export async function loadAllSourceItems(db: Db): Promise<EventInput[]> {
  const rows = await db.select({ payload: sourceItems.payload }).from(sourceItems);
  const out: EventInput[] = [];
  for (const r of rows) {
    const parsed = EventInputSchema.safeParse(r.payload);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Upsert a source's items; optionally prune items the source no longer lists. */
export async function saveSourceItems(
  db: Db,
  source: SourceName,
  items: EventInput[],
  runStartedAt: Date,
  prune: boolean,
): Promise<{ saved: number; pruned: number }> {
  const now = new Date();
  const unique = new Map(items.map((i) => [i.sourceId, i]));
  for (const batch of chunk([...unique.values()], 200)) {
    await db
      .insert(sourceItems)
      .values(
        batch.map((i) => ({
          source,
          sourceId: i.sourceId,
          dedupeKey: dedupeKeyFor(i.acronym, i.year),
          payload: i,
          lastSeenAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [sourceItems.source, sourceItems.sourceId],
        set: {
          dedupeKey: sql`excluded.dedupe_key`,
          payload: sql`excluded.payload`,
          lastSeenAt: sql`excluded.last_seen_at`,
        },
      });
  }
  let pruned = 0;
  if (prune && unique.size > 0) {
    const res = await db
      .delete(sourceItems)
      .where(and(eq(sourceItems.source, source), lt(sourceItems.lastSeenAt, runStartedAt)))
      .returning({ id: sourceItems.sourceId });
    pruned = res.length;
  }
  return { saved: unique.size, pruned };
}

export async function saveAcceptance(db: Db, rows: AcceptanceInput[]): Promise<number> {
  const unique = new Map(rows.map((r) => [`${r.seriesKey}:${r.year}`, r]));
  for (const batch of chunk([...unique.values()], 300)) {
    await db
      .insert(acceptanceStats)
      .values(
        batch.map((r) => ({
          eventAcronym: r.seriesKey,
          year: r.year,
          submitted: r.submitted,
          accepted: r.accepted,
          rate: r.rate,
          sourceUrl: r.sourceUrl,
          source: "ccfddl",
        })),
      )
      .onConflictDoUpdate({
        target: [acceptanceStats.eventAcronym, acceptanceStats.year],
        set: {
          submitted: sql`excluded.submitted`,
          accepted: sql`excluded.accepted`,
          rate: sql`excluded.rate`,
          sourceUrl: sql`excluded.source_url`,
        },
      });
  }
  return unique.size;
}

const ex = (column: string) => sql.raw(`excluded."${column}"`);

/**
 * Write merged events: upsert rows (preserving CFP text and geocodes unless the location
 * changed), resolve parents, replace deadlines + provenance, delete events no source lists
 * any more (unless the owner bookmarked or annotated them).
 */
export async function writeMergedEvents(
  db: Db,
  merged: MergedEvent[],
): Promise<{ upserted: number; deleted: number; deadlines: number; workshops: number }> {
  const existing = await db
    .select({ dedupeKey: events.dedupeKey, cfpText: events.cfpText })
    .from(events);
  const cfpByKey = new Map(existing.map((e) => [e.dedupeKey, e.cfpText]));
  const now = new Date();

  const ids = new Map<string, number>();
  for (const batch of chunk(merged, 150)) {
    const rows = batch.map((m) => {
      const tagged = tagEvent({
        seriesKey: m.seriesKey,
        name: m.name,
        description: m.description,
        tags: m.tags,
        cfpText: cfpByKey.get(m.dedupeKey) ?? null,
      });
      const country = countryByCode(m.countryCode);
      return {
        slug: m.slug,
        dedupeKey: m.dedupeKey,
        seriesKey: m.seriesKey,
        acronym: m.acronym,
        name: m.name,
        year: m.year,
        type: m.type,
        parentKey: m.parentKey,
        subfields: tagged.subfields,
        topics: tagged.topics,
        rankCore: m.rankCore,
        rankCcf: m.rankCcf,
        mode: m.mode,
        locationRaw: m.locationRaw,
        venue: m.venue,
        city: m.city,
        country: m.country ?? country?.name ?? null,
        countryCode: m.countryCode,
        continent: continentFor(m.countryCode),
        startDate: m.startDate,
        endDate: m.endDate,
        dateText: m.dateText,
        website: m.website,
        description: m.description,
        submissionSite: m.submissionSite,
        reviewType: m.reviewType,
        sources: m.sources,
        fieldProvenance: m.provenance,
        updatedAt: now,
      };
    });
    const res = await db
      .insert(events)
      .values(rows)
      .onConflictDoUpdate({
        target: events.dedupeKey,
        set: {
          slug: ex("slug"),
          seriesKey: ex("series_key"),
          acronym: ex("acronym"),
          name: ex("name"),
          year: ex("year"),
          type: ex("type"),
          parentKey: ex("parent_key"),
          subfields: ex("subfields"),
          topics: ex("topics"),
          rankCore: ex("rank_core"),
          rankCcf: ex("rank_ccf"),
          mode: ex("mode"),
          locationRaw: ex("location_raw"),
          venue: ex("venue"),
          city: ex("city"),
          country: ex("country"),
          countryCode: ex("country_code"),
          continent: sql`coalesce(excluded.continent, ${events.continent})`,
          // A moved event must be geocoded again.
          lat: sql`case when ${events.city} is distinct from excluded.city or ${events.countryCode} is distinct from excluded.country_code then null else ${events.lat} end`,
          lng: sql`case when ${events.city} is distinct from excluded.city or ${events.countryCode} is distinct from excluded.country_code then null else ${events.lng} end`,
          geocodedAt: sql`case when ${events.city} is distinct from excluded.city or ${events.countryCode} is distinct from excluded.country_code then null else ${events.geocodedAt} end`,
          startDate: ex("start_date"),
          endDate: ex("end_date"),
          dateText: ex("date_text"),
          website: ex("website"),
          description: ex("description"),
          submissionSite: sql`coalesce(excluded.submission_site, ${events.submissionSite})`,
          reviewType: sql`coalesce(excluded.review_type, ${events.reviewType})`,
          sources: ex("sources"),
          fieldProvenance: ex("field_provenance"),
          updatedAt: ex("updated_at"),
        },
      })
      .returning({ id: events.id, dedupeKey: events.dedupeKey });
    for (const r of res) ids.set(r.dedupeKey, r.id);
  }

  // Parents (resolved after all rows exist).
  await db.execute(sql`
    update ${events} as e set parent_event_id = p.id
    from ${events} as p
    where e.parent_key is not null and p.dedupe_key = e.parent_key and e.id <> p.id
      and e.parent_event_id is distinct from p.id`);
  await db.execute(sql`
    update ${events} set parent_event_id = null
    where parent_event_id is not null
      and (parent_key is null or parent_key not in (select dedupe_key from ${events}))`);

  // Deadlines + provenance: replace for every written event.
  const idList = [...ids.values()];
  for (const batch of chunk(idList, 500)) {
    await db.delete(deadlines).where(inArray(deadlines.eventId, batch));
    await db.delete(eventSources).where(inArray(eventSources.eventId, batch));
  }
  const deadlineRows = merged.flatMap((m) =>
    m.deadlines.map((d) => ({
      eventId: ids.get(m.dedupeKey)!,
      kind: d.kind,
      label: d.label,
      dueAtUtc: new Date(d.dueAtUtc),
      originalTz: d.originalTz,
      originalText: d.originalText,
      comment: d.comment,
      source: d.source,
    })),
  );
  for (const batch of chunk(deadlineRows, 500)) await db.insert(deadlines).values(batch);
  const sourceRows = merged.flatMap((m) =>
    m.refs.map((r) => ({
      eventId: ids.get(m.dedupeKey)!,
      source: r.source,
      sourceId: r.sourceId,
      url: r.url,
      fieldsProvided: r.fields,
      lastSeenAt: now,
    })),
  );
  const uniqueSourceRows = [
    ...new Map(sourceRows.map((r) => [`${r.eventId}|${r.source}|${r.sourceId}`, r])).values(),
  ];
  for (const batch of chunk(uniqueSourceRows, 500)) await db.insert(eventSources).values(batch);

  // Events no source lists any more — keep the ones the owner bookmarked, annotated or chatted about.
  const keep = merged.map((m) => m.dedupeKey);
  const protectedIds = db
    .select({ id: bookmarks.eventId })
    .from(bookmarks)
    .union(db.select({ id: notes.eventId }).from(notes))
    .union(
      db
        .select({ id: sql<number>`${chats.eventId}` })
        .from(chats)
        .where(sql`${chats.eventId} is not null`),
    );
  const deleted =
    keep.length > 0
      ? await db
          .delete(events)
          .where(and(notInArray(events.dedupeKey, keep), notInArray(events.id, protectedIds)))
          .returning({ id: events.id })
      : [];

  await refreshDerivedColumns(db);
  return {
    upserted: ids.size,
    deleted: deleted.length,
    deadlines: deadlineRows.length,
    workshops: merged.filter((m) => m.type === "workshop").length,
  };
}

/** next_deadline_at (earliest upcoming abstract/paper deadline, else the latest past one) + search vector. */
export async function refreshDerivedColumns(db: Db): Promise<void> {
  await db.execute(sql`
    update ${events} e set next_deadline_at = d.due, next_deadline_kind = d.kind
    from (
      select distinct on (event_id) event_id, due_at_utc as due, kind
      from ${deadlines}
      where kind in ('abstract', 'paper')
      order by event_id, (due_at_utc < now()), case when due_at_utc >= now() then due_at_utc end asc, due_at_utc desc
    ) d
    where e.id = d.event_id`);
  await db.execute(sql`
    update ${events} set next_deadline_at = null, next_deadline_kind = null
    where id not in (select event_id from ${deadlines} where kind in ('abstract', 'paper'))`);
  await db.execute(sql`
    update ${events} set search_vector =
      setweight(to_tsvector('simple', coalesce(acronym, '') || ' ' || coalesce(series_key, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(name, '')), 'B') ||
      setweight(to_tsvector('english',
        array_to_string(topics, ' ') || ' ' || array_to_string(subfields, ' ') || ' ' ||
        array_to_string(cfp_topics, ' ') || ' ' || coalesce(city, '') || ' ' || coalesce(country, '')), 'C')`);
}

/** Re-run keyword tagging for all events (after CFP text changed). */
export async function retagAll(db: Db): Promise<number> {
  const rows = await db
    .select({
      id: events.id,
      seriesKey: events.seriesKey,
      name: events.name,
      description: events.description,
      cfpText: events.cfpText,
      dedupeKey: events.dedupeKey,
    })
    .from(events);
  const tagsByKey = new Map<string, string[]>();
  const items = await db
    .select({ dedupeKey: sourceItems.dedupeKey, payload: sourceItems.payload })
    .from(sourceItems);
  for (const it of items) {
    const tags = (it.payload as EventInput).tags ?? [];
    tagsByKey.set(it.dedupeKey, [...(tagsByKey.get(it.dedupeKey) ?? []), ...tags]);
  }
  let changed = 0;
  for (const r of rows) {
    const t = tagEvent({ ...r, tags: tagsByKey.get(r.dedupeKey) ?? [] });
    await db
      .update(events)
      .set({ subfields: t.subfields, topics: t.topics })
      .where(eq(events.id, r.id));
    changed++;
  }
  return changed;
}
