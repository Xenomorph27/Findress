import "server-only";
import { asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { bookmarks, deadlines, events, journals, notes, specialIssues } from "@/lib/db/schema";
import type { BookmarkStatus } from "@/lib/taxonomy";
import { targetKey, type Target, type TargetKind } from "@/lib/workspace/targets";

/** Owner data is personal and never cached: every read hits the database. */

export interface WorkspaceItem {
  /** "<kind>:<id>" — stable id for the Kanban and the bookmark store. */
  key: string;
  kind: TargetKind;
  targetId: number;
  status: BookmarkStatus;
  position: number;
  /** In-app link (events: /c/…, journals and their special issues: /j/…). */
  href: string;
  slug: string;
  /** Short label: event acronym, journal abbreviation. */
  acronym: string;
  /** Edition year for events; null for journals and special issues. */
  year: number | null;
  name: string | null;
  type: string;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  startDate: string | null;
  endDate: string | null;
  rankCore: string | null;
  rankCcf: string | null;
  hasNote: boolean;
  deadlines: { kind: string; label: string | null; dueAtUtc: string; originalTz: string | null }[];
}

const targetColumn = (kind: TargetKind) =>
  kind === "event"
    ? bookmarks.eventId
    : kind === "journal"
      ? bookmarks.journalId
      : bookmarks.specialIssueId;
const noteColumn = (kind: TargetKind) =>
  kind === "event" ? notes.eventId : kind === "journal" ? notes.journalId : notes.specialIssueId;
const targetValues = (t: Target) => ({
  eventId: t.kind === "event" ? t.id : null,
  journalId: t.kind === "journal" ? t.id : null,
  specialIssueId: t.kind === "special" ? t.id : null,
});

const hasNoteSql = (col: "event_id" | "journal_id" | "special_issue_id", id: unknown) =>
  sql<boolean>`exists(select 1 from ${notes} n where n.${sql.raw(col)} = ${id} and length(n.body_md) > 0)`;

export async function listWorkspace(db: Db): Promise<WorkspaceItem[]> {
  const eventRows = await db
    .select({
      id: events.id,
      status: bookmarks.status,
      position: bookmarks.position,
      slug: events.slug,
      acronym: events.acronym,
      year: events.year,
      name: events.name,
      type: events.type,
      city: events.city,
      country: events.country,
      countryCode: events.countryCode,
      startDate: events.startDate,
      endDate: events.endDate,
      rankCore: events.rankCore,
      rankCcf: events.rankCcf,
      hasNote: hasNoteSql("event_id", events.id),
    })
    .from(bookmarks)
    .innerJoin(events, eq(events.id, bookmarks.eventId));
  const eventIds = eventRows.map((r) => r.id);
  const dls = eventIds.length
    ? await db
        .select()
        .from(deadlines)
        .where(inArray(deadlines.eventId, eventIds))
        .orderBy(asc(deadlines.dueAtUtc))
    : [];

  const journalRows = await db
    .select({
      id: journals.id,
      status: bookmarks.status,
      position: bookmarks.position,
      slug: journals.slug,
      abbreviation: journals.abbreviation,
      name: journals.name,
      rankCore: journals.rankCoreJournal,
      rankCcf: journals.rankCcf,
      hasNote: hasNoteSql("journal_id", journals.id),
    })
    .from(bookmarks)
    .innerJoin(journals, eq(journals.id, bookmarks.journalId));
  const journalIds = journalRows.map((r) => r.id);
  const journalCalls = journalIds.length
    ? await db
        .select({
          journalId: specialIssues.journalId,
          title: specialIssues.title,
          due: specialIssues.submissionDeadlineUtc,
        })
        .from(specialIssues)
        .where(
          sql`${inArray(specialIssues.journalId, journalIds)} and ${isNotNull(specialIssues.submissionDeadlineUtc)}`,
        )
        .orderBy(asc(specialIssues.submissionDeadlineUtc))
    : [];

  const siJournal = journals;
  const siRows = await db
    .select({
      id: specialIssues.id,
      status: bookmarks.status,
      position: bookmarks.position,
      title: specialIssues.title,
      journalName: specialIssues.journalName,
      journalSlug: siJournal.slug,
      journalAbbr: siJournal.abbreviation,
      due: specialIssues.submissionDeadlineUtc,
      url: specialIssues.url,
      hasNote: hasNoteSql("special_issue_id", specialIssues.id),
    })
    .from(bookmarks)
    .innerJoin(specialIssues, eq(specialIssues.id, bookmarks.specialIssueId))
    .leftJoin(siJournal, eq(siJournal.id, specialIssues.journalId));

  const items: WorkspaceItem[] = [
    ...eventRows.map((r) => ({
      key: targetKey({ kind: "event", id: r.id }),
      kind: "event" as const,
      targetId: r.id,
      status: r.status,
      position: r.position,
      href: `/c/${r.slug}`,
      slug: r.slug,
      acronym: r.acronym,
      year: r.year,
      name: r.name,
      type: r.type,
      city: r.city,
      country: r.country,
      countryCode: r.countryCode,
      startDate: r.startDate,
      endDate: r.endDate,
      rankCore: r.rankCore,
      rankCcf: r.rankCcf,
      hasNote: Boolean(r.hasNote),
      deadlines: dls
        .filter((d) => d.eventId === r.id)
        .map((d) => ({
          kind: d.kind,
          label: d.label,
          dueAtUtc: d.dueAtUtc.toISOString(),
          originalTz: d.originalTz,
        })),
    })),
    ...journalRows.map((r) => ({
      key: targetKey({ kind: "journal", id: r.id }),
      kind: "journal" as const,
      targetId: r.id,
      status: r.status,
      position: r.position,
      href: `/j/${r.slug}`,
      slug: r.slug,
      acronym: r.abbreviation,
      year: null,
      name: r.name,
      type: "journal",
      city: null,
      country: null,
      countryCode: null,
      startDate: null,
      endDate: null,
      rankCore: r.rankCore,
      rankCcf: r.rankCcf,
      hasNote: Boolean(r.hasNote),
      deadlines: journalCalls
        .filter((c) => c.journalId === r.id && c.due)
        .map((c) => ({
          kind: "paper",
          label: `Special issue: ${c.title}`,
          dueAtUtc: c.due!.toISOString(),
          originalTz: null,
        })),
    })),
    ...siRows.map((r) => ({
      key: targetKey({ kind: "special", id: r.id }),
      kind: "special" as const,
      targetId: r.id,
      status: r.status,
      position: r.position,
      href: r.journalSlug ? `/j/${r.journalSlug}#si-${r.id}` : (r.url ?? "/explore?tab=special"),
      slug: r.journalSlug ?? `si-${r.id}`,
      acronym: r.journalAbbr ?? "Special issue",
      year: null,
      name: r.journalAbbr ? r.title : `${r.title}${r.journalName ? ` (${r.journalName})` : ""}`,
      type: "special-issue",
      city: null,
      country: null,
      countryCode: null,
      startDate: null,
      endDate: null,
      rankCore: null,
      rankCcf: null,
      hasNote: Boolean(r.hasNote),
      deadlines: r.due
        ? [
            {
              kind: "paper",
              label: `Special issue: ${r.title}`,
              dueAtUtc: r.due.toISOString(),
              originalTz: null,
            },
          ]
        : [],
    })),
  ];
  return items.sort((a, b) => a.position - b.position || a.acronym.localeCompare(b.acronym));
}

export async function upsertBookmark(
  db: Db,
  target: Target,
  status: BookmarkStatus,
  position?: number,
) {
  const now = new Date();
  await db
    .insert(bookmarks)
    .values({ ...targetValues(target), status, position: position ?? 0, updatedAt: now })
    .onConflictDoUpdate({
      target: targetColumn(target.kind),
      set: { status, updatedAt: now, ...(position != null ? { position } : {}) },
    });
}

export async function removeBookmark(db: Db, target: Target) {
  await db.delete(bookmarks).where(eq(targetColumn(target.kind), target.id));
}

export async function getNote(db: Db, target: Target) {
  const [row] = await db
    .select()
    .from(notes)
    .where(eq(noteColumn(target.kind), target.id))
    .limit(1);
  return row
    ? { bodyMd: row.bodyMd, updatedAt: row.updatedAt.toISOString() }
    : { bodyMd: "", updatedAt: null };
}

export async function saveNote(db: Db, target: Target, bodyMd: string) {
  const now = new Date();
  if (!bodyMd.trim()) {
    await db.delete(notes).where(eq(noteColumn(target.kind), target.id));
    return { updatedAt: now.toISOString() };
  }
  await db
    .insert(notes)
    .values({ ...targetValues(target), bodyMd, updatedAt: now })
    .onConflictDoUpdate({ target: noteColumn(target.kind), set: { bodyMd, updatedAt: now } });
  return { updatedAt: now.toISOString() };
}

export async function targetExists(db: Db, target: Target): Promise<boolean> {
  const table =
    target.kind === "event" ? events : target.kind === "journal" ? journals : specialIssues;
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(table.id, target.id))
    .limit(1);
  return Boolean(row);
}
