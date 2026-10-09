import "server-only";
import { asc, desc, eq, gte, isNotNull, or, sql } from "drizzle-orm";
import { cacheTag } from "next/cache";
import { getDb } from "@/lib/db";
import { journals, specialIssues } from "@/lib/db/schema";
import type {
  JournalDetail,
  JournalListRow,
  JournalSpecialIssue,
  SpecialIssueListRow,
} from "./types";
import { settle, type Settled, unwrap } from "./settle";

/**
 * Cached journal read models (tag "journals"; ingestion revalidates it). Like the event
 * loaders they return empty results without a database; callers wrap them in withDbFallback.
 */

const DAY = 86_400_000;

export async function getJournalRows(): Promise<JournalListRow[]> {
  return unwrap(await getJournalRowsCached());
}

async function getJournalRowsCached(): Promise<Settled<JournalListRow[]>> {
  "use cache";
  cacheTag("journals");
  return settle("hours", () => getJournalRowsQuery());
}

async function getJournalRowsQuery(): Promise<JournalListRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: journals.id,
      slug: journals.slug,
      abbreviation: journals.abbreviation,
      name: journals.name,
      publisher: journals.publisher,
      openAccess: journals.openAccess,
      apcUsd: journals.apcUsd,
      hIndex: journals.hIndex,
      twoYrMeanCitedness: journals.twoYrMeanCitedness,
      worksCount: journals.worksCount,
      rankCoreJournal: journals.rankCoreJournal,
      rankCcf: journals.rankCcf,
      sjrQuartile: journals.sjrQuartile,
      subfields: journals.subfields,
      topics: journals.topics,
    })
    .from(journals)
    .orderBy(asc(journals.abbreviation));
  // Open calls (deadline ahead) per journal; the request clock is applied on the client too.
  const calls = await db
    .select({
      id: specialIssues.id,
      journalId: specialIssues.journalId,
      title: specialIssues.title,
      due: specialIssues.submissionDeadlineUtc,
    })
    .from(specialIssues)
    .where(
      sql`${isNotNull(specialIssues.journalId)} and ${gte(specialIssues.submissionDeadlineUtc, new Date(Date.now() - DAY))}`,
    )
    .orderBy(asc(specialIssues.submissionDeadlineUtc));
  return rows.map((r) => {
    const mine = calls.filter((c) => c.journalId === r.id && c.due);
    return {
      ...r,
      openAccess: r.openAccess as JournalListRow["openAccess"],
      topics: r.topics.slice(0, 4),
      nextCall: mine[0]
        ? { id: mine[0].id, title: mine[0].title, at: mine[0].due!.getTime() }
        : null,
      openCalls: mine.length,
    };
  });
}

/** Special-issue calls whose deadline is unknown or within the last year (older ones drop). */
export async function getSpecialIssueRows(): Promise<SpecialIssueListRow[]> {
  return unwrap(await getSpecialIssueRowsCached());
}

async function getSpecialIssueRowsCached(): Promise<Settled<SpecialIssueListRow[]>> {
  "use cache";
  cacheTag("journals");
  return settle("hours", () => getSpecialIssueRowsQuery());
}

async function getSpecialIssueRowsQuery(): Promise<SpecialIssueListRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: specialIssues.id,
      title: specialIssues.title,
      slug: journals.slug,
      abbreviation: journals.abbreviation,
      name: journals.name,
      journalName: specialIssues.journalName,
      due: specialIssues.submissionDeadlineUtc,
      deadlineText: specialIssues.deadlineText,
      url: specialIssues.url,
      source: specialIssues.source,
      subfields: specialIssues.subfields,
      topics: specialIssues.topics,
      guestEditors: specialIssues.guestEditors,
    })
    .from(specialIssues)
    .leftJoin(journals, eq(journals.id, specialIssues.journalId))
    .where(
      or(
        sql`${specialIssues.submissionDeadlineUtc} is null`,
        gte(specialIssues.submissionDeadlineUtc, new Date(Date.now() - 365 * DAY)),
      ),
    )
    .orderBy(asc(specialIssues.submissionDeadlineUtc));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    journal: r.slug ? { slug: r.slug, abbreviation: r.abbreviation!, name: r.name! } : null,
    journalName: r.journalName,
    at: r.due ? r.due.getTime() : null,
    deadlineText: r.deadlineText,
    url: r.url,
    source: r.source,
    subfields: r.subfields,
    topics: r.topics.slice(0, 4),
    guestEditors: r.guestEditors.slice(0, 6),
  }));
}

export async function getJournalDetail(slug: string): Promise<JournalDetail | null> {
  return unwrap(await getJournalDetailCached(slug));
}

async function getJournalDetailCached(slug: string): Promise<Settled<JournalDetail | null>> {
  "use cache";
  cacheTag("journals", `journal:${slug}`);
  return settle("hours", () => getJournalDetailQuery(slug));
}

async function getJournalDetailQuery(slug: string): Promise<JournalDetail | null> {
  const db = getDb();
  if (!db) return null;
  const [j] = await db.select().from(journals).where(eq(journals.slug, slug)).limit(1);
  if (!j) return null;
  const calls = await db
    .select()
    .from(specialIssues)
    .where(eq(specialIssues.journalId, j.id))
    .orderBy(desc(specialIssues.submissionDeadlineUtc));
  const specials: JournalSpecialIssue[] = calls.map((c) => ({
    id: c.id,
    title: c.title,
    guestEditors: c.guestEditors,
    descriptionText: c.descriptionText,
    submissionDeadlineUtc: c.submissionDeadlineUtc?.toISOString() ?? null,
    deadlineText: c.deadlineText,
    deadlineTz: c.deadlineTz,
    url: c.url,
    source: c.source,
    lastSeenAt: c.lastSeenAt.toISOString(),
  }));
  return {
    id: j.id,
    slug: j.slug,
    name: j.name,
    abbreviation: j.abbreviation,
    publisher: j.publisher,
    issnPrint: j.issnPrint,
    issnOnline: j.issnOnline,
    issns: j.issns,
    openalexId: j.openalexId,
    homepage: j.homepage,
    submissionUrl: j.submissionUrl,
    scopeUrl: j.scopeUrl,
    scopeText: j.scopeText,
    scopeFetchedAt: j.scopeFetchedAt?.toISOString() ?? null,
    subfields: j.subfields,
    topics: j.topics,
    openAccess: j.openAccess as JournalDetail["openAccess"],
    apcUsd: j.apcUsd,
    hIndex: j.hIndex,
    i10Index: j.i10Index,
    twoYrMeanCitedness: j.twoYrMeanCitedness,
    worksCount: j.worksCount,
    citedByCount: j.citedByCount,
    metricsAsOf: j.metricsAsOf?.toISOString() ?? null,
    countsByYear: j.countsByYear,
    impactMetrics: j.impactMetrics,
    rankCoreJournal: j.rankCoreJournal,
    rankCcf: j.rankCcf,
    sjrQuartile: j.sjrQuartile,
    reviewModel: j.reviewModel,
    avgTimeToFirstDecision: j.avgTimeToFirstDecision,
    sources: j.sources,
    provenance: j.fieldProvenance,
    updatedAt: j.updatedAt.toISOString(),
    specialIssues: specials,
  };
}

export async function getJournalMeta(
  slug: string,
): Promise<{ name: string; abbreviation: string; publisher: string | null } | null> {
  return unwrap(await getJournalMetaCached(slug));
}

async function getJournalMetaCached(
  slug: string,
): Promise<Settled<{ name: string; abbreviation: string; publisher: string | null } | null>> {
  "use cache";
  cacheTag("journals", `journal:${slug}`);
  return settle("hours", () => getJournalMetaQuery(slug));
}

async function getJournalMetaQuery(
  slug: string,
): Promise<{ name: string; abbreviation: string; publisher: string | null } | null> {
  const db = getDb();
  if (!db) return null;
  const [j] = await db
    .select({
      name: journals.name,
      abbreviation: journals.abbreviation,
      publisher: journals.publisher,
    })
    .from(journals)
    .where(eq(journals.slug, slug))
    .limit(1);
  return j ?? null;
}

export async function getJournalSlugs(): Promise<string[]> {
  return unwrap(await getJournalSlugsCached());
}

async function getJournalSlugsCached(): Promise<Settled<string[]>> {
  "use cache";
  cacheTag("journals");
  return settle("hours", () => getJournalSlugsQuery());
}

async function getJournalSlugsQuery(): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  return (await db.select({ slug: journals.slug }).from(journals)).map((r) => r.slug);
}

/** Text search over journals (assistant tool, command palette); ~120 rows, so in memory. */
export async function searchJournalRows(query: string, limit = 12): Promise<JournalListRow[]> {
  const rows = await getJournalRows();
  const q = query.trim().toLowerCase();
  if (!q) return rows.slice(0, limit);
  const tokens = q.split(/\s+/);
  const hay = (r: JournalListRow) =>
    [r.abbreviation, r.name, r.publisher, ...r.topics, ...r.subfields].join(" ").toLowerCase();
  const scored = rows
    .filter((r) => tokens.every((t) => hay(r).includes(t)))
    .sort(
      (a, b) =>
        Number(b.abbreviation.toLowerCase() === q) - Number(a.abbreviation.toLowerCase() === q) ||
        (b.hIndex ?? 0) - (a.hIndex ?? 0),
    );
  return scored.slice(0, limit);
}
