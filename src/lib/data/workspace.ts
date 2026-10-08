import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { bookmarks, deadlines, events, notes } from "@/lib/db/schema";
import type { BookmarkStatus } from "@/lib/taxonomy";

/** Owner data is personal and never cached: every read hits the database. */

export interface WorkspaceItem {
  eventId: number;
  status: BookmarkStatus;
  position: number;
  slug: string;
  acronym: string;
  year: number;
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

export async function listWorkspace(db: Db): Promise<WorkspaceItem[]> {
  const rows = await db
    .select({
      eventId: bookmarks.eventId,
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
      hasNote: sql<boolean>`exists(select 1 from ${notes} n where n.event_id = ${events.id} and length(n.body_md) > 0)`,
    })
    .from(bookmarks)
    .innerJoin(events, eq(events.id, bookmarks.eventId))
    .orderBy(asc(bookmarks.position), asc(events.acronym));
  const ids = rows.map((r) => r.eventId);
  const dls = ids.length
    ? await db
        .select()
        .from(deadlines)
        .where(inArray(deadlines.eventId, ids))
        .orderBy(asc(deadlines.dueAtUtc))
    : [];
  return rows.map((r) => ({
    ...r,
    hasNote: Boolean(r.hasNote),
    deadlines: dls
      .filter((d) => d.eventId === r.eventId)
      .map((d) => ({
        kind: d.kind,
        label: d.label,
        dueAtUtc: d.dueAtUtc.toISOString(),
        originalTz: d.originalTz,
      })),
  }));
}

export async function upsertBookmark(
  db: Db,
  eventId: number,
  status: BookmarkStatus,
  position?: number,
) {
  const now = new Date();
  await db
    .insert(bookmarks)
    .values({ eventId, status, position: position ?? 0, updatedAt: now })
    .onConflictDoUpdate({
      target: bookmarks.eventId,
      set: { status, updatedAt: now, ...(position != null ? { position } : {}) },
    });
}

export async function removeBookmark(db: Db, eventId: number) {
  await db.delete(bookmarks).where(eq(bookmarks.eventId, eventId));
}

export async function getNote(db: Db, eventId: number) {
  const [row] = await db.select().from(notes).where(eq(notes.eventId, eventId)).limit(1);
  return row
    ? { bodyMd: row.bodyMd, updatedAt: row.updatedAt.toISOString() }
    : { bodyMd: "", updatedAt: null };
}

export async function saveNote(db: Db, eventId: number, bodyMd: string) {
  const now = new Date();
  if (!bodyMd.trim()) {
    await db.delete(notes).where(eq(notes.eventId, eventId));
    return { updatedAt: now.toISOString() };
  }
  await db
    .insert(notes)
    .values({ eventId, bodyMd, updatedAt: now })
    .onConflictDoUpdate({ target: notes.eventId, set: { bodyMd, updatedAt: now } });
  return { updatedAt: now.toISOString() };
}

export async function eventExists(db: Db, eventId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, eventId)))
    .limit(1);
  return Boolean(row);
}
