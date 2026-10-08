import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/** Which source supplied each merged field, e.g. { startDate: "huggingface", rankCore: "ccfddl" }. */
export type FieldProvenance = Record<string, string>;

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    /** Normalized acronym + year — the cross-source dedupe key (e.g. "icml-2026"). */
    dedupeKey: text("dedupe_key").notNull(),
    /** Normalized acronym without year (e.g. "icml") — groups editions for history. */
    seriesKey: text("series_key").notNull(),
    acronym: text("acronym").notNull(),
    name: text("name"),
    year: integer("year").notNull(),
    type: text("type").notNull().default("conference"),
    parentEventId: integer("parent_event_id").references((): AnyPgColumn => events.id, {
      onDelete: "set null",
    }),
    /** Dedupe key of the parent as reported by a source; resolved to parent_event_id after merge. */
    parentKey: text("parent_key"),
    subfields: text("subfields")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    topics: text("topics")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    rankCore: text("rank_core"),
    rankCcf: text("rank_ccf"),
    mode: text("mode"),
    locationRaw: text("location_raw"),
    venue: text("venue"),
    city: text("city"),
    country: text("country"),
    countryCode: text("country_code"),
    continent: text("continent"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    dateText: text("date_text"),
    website: text("website"),
    description: text("description"),
    submissionSite: text("submission_site"),
    pageLimit: text("page_limit"),
    reviewType: text("review_type"),
    hasRebuttal: boolean("has_rebuttal"),
    cfpText: text("cfp_text"),
    cfpHash: text("cfp_hash"),
    cfpUrl: text("cfp_url"),
    cfpFetchedAt: timestamp("cfp_fetched_at", { withTimezone: true }),
    /** "Topics of interest" bullet items extracted from the CFP text. */
    cfpTopics: text("cfp_topics")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Set when the geocoder has tried this event's location (success or not). */
    geocodedAt: timestamp("geocoded_at", { withTimezone: true }),
    /** Sources that contributed to this event (denormalized for fast filtering). */
    sources: text("sources")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    fieldProvenance: jsonb("field_provenance").$type<FieldProvenance>().notNull().default({}),
    /** Earliest upcoming submission-type deadline (UTC); refreshed after every ingest. */
    nextDeadlineAt: timestamp("next_deadline_at", { withTimezone: true }),
    nextDeadlineKind: text("next_deadline_kind"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    searchVector: tsvector("search_vector"),
  },
  (t) => [
    uniqueIndex("events_slug_idx").on(t.slug),
    uniqueIndex("events_dedupe_key_idx").on(t.dedupeKey),
    index("events_series_idx").on(t.seriesKey),
    index("events_parent_idx").on(t.parentEventId),
    index("events_next_deadline_idx").on(t.nextDeadlineAt),
    index("events_start_idx").on(t.startDate),
    index("events_search_idx").using("gin", t.searchVector),
    index("events_subfields_idx").using("gin", t.subfields),
  ],
);

export const deadlines = pgTable(
  "deadlines",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    label: text("label"),
    dueAtUtc: timestamp("due_at_utc", { withTimezone: true }).notNull(),
    /** Timezone exactly as the source wrote it ("AoE", "UTC-12", "Europe/London", …). */
    originalTz: text("original_tz"),
    /** Local wall-clock string as written by the source ("2026-01-28 23:59:59"). */
    originalText: text("original_text"),
    comment: text("comment"),
    source: text("source").notNull(),
  },
  (t) => [index("deadlines_event_idx").on(t.eventId), index("deadlines_due_idx").on(t.dueAtUtc)],
);

export const eventSources = pgTable(
  "event_sources",
  {
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    url: text("url"),
    fieldsProvided: text("fields_provided")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.source, t.sourceId] })],
);

export const acceptanceStats = pgTable(
  "acceptance_stats",
  {
    id: serial("id").primaryKey(),
    /** Normalized series key (matches events.series_key). */
    eventAcronym: text("event_acronym").notNull(),
    year: integer("year").notNull(),
    submitted: integer("submitted"),
    accepted: integer("accepted"),
    rate: real("rate"),
    sourceUrl: text("source_url"),
    source: text("source").notNull().default("ccfddl"),
  },
  (t) => [uniqueIndex("acceptance_series_year_idx").on(t.eventAcronym, t.year)],
);

export const sourceRuns = pgTable(
  "source_runs",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ok: boolean("ok"),
    items: integer("items").notNull().default(0),
    error: text("error"),
    stats: jsonb("stats").$type<Record<string, number | string>>(),
  },
  (t) => [index("source_runs_source_idx").on(t.source, t.startedAt)],
);

export const bookmarkStatuses = [
  "interested",
  "planning",
  "writing",
  "submitted",
  "accepted",
  "rejected",
  "attending",
] as const;
export type BookmarkStatus = (typeof bookmarkStatuses)[number];

export const bookmarks = pgTable("bookmarks", {
  eventId: integer("event_id")
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  status: text("status").$type<BookmarkStatus>().notNull().default("interested"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notes = pgTable("notes", {
  eventId: integer("event_id")
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  bodyMd: text("body_md").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chats = pgTable(
  "chats",
  {
    id: serial("id").primaryKey(),
    /** Null for the global (/explore) assistant. */
    eventId: integer("event_id").references(() => events.id, { onDelete: "cascade" }),
    /** "event:<id>" or "global" — one thread per scope. */
    scope: text("scope").notNull(),
    messages: jsonb("messages").$type<unknown[]>().notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("chats_scope_idx").on(t.scope)],
);

/** One row per assistant request — backs the hourly rate limit and token accounting. */
export const chatUsage = pgTable(
  "chat_usage",
  {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    scope: text("scope").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
  },
  (t) => [index("chat_usage_created_idx").on(t.createdAt)],
);

export const geocodeCache = pgTable("geocode_cache", {
  query: text("query").primaryKey(),
  ok: boolean("ok").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  city: text("city"),
  country: text("country"),
  countryCode: text("country_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Normalized output of each list source, one row per upstream item. The merge step rebuilds
 * `events` from all rows, so sources can be refreshed independently without breaking dedupe.
 */
export const sourceItems = pgTable(
  "source_items",
  {
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    payload: jsonb("payload").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.source, t.sourceId] }),
    index("source_items_dedupe_idx").on(t.dedupeKey),
  ],
);

/** Polite-fetch cache for scraped pages (WikiCFP event pages, CFP pages). */
export const httpCache = pgTable("http_cache", {
  url: text("url").primaryKey(),
  status: integer("status").notNull(),
  body: text("body"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EventRow = typeof events.$inferSelect;
export type DeadlineRow = typeof deadlines.$inferSelect;
export type EventSourceRow = typeof eventSources.$inferSelect;
export type SourceRunRow = typeof sourceRuns.$inferSelect;
export type AcceptanceRow = typeof acceptanceStats.$inferSelect;
export type BookmarkRow = typeof bookmarks.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
export type SourceItemRow = typeof sourceItems.$inferSelect;
