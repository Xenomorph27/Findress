/**
 * Rules for applying migrations during a Vercel build (scripts/migrate-on-deploy.ts), so a
 * deployment can never run code ahead of its schema. Pure functions, unit-tested.
 *
 * Why: after PR #7 was merged, production ran code that needed `ingest_lease` (migration 0006)
 * while the database was still at 0005, and every ingestion failed with
 * `relation "ingest_lease" does not exist` until the migration was applied by hand.
 */

export interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

/** Neon's direct (non-pooled) endpoint is the pooled host without "-pooler". */
export function directUrl(url: string): string {
  const u = new URL(url);
  u.hostname = u.hostname.replace(/-pooler(?=\.)/, "");
  return u.toString();
}

/**
 * Migrations drizzle will apply: the same rule as drizzle-orm's pg migrator, every journal entry
 * newer than the newest recorded migration (all of them on an empty database).
 */
export function pendingMigrations(
  entries: JournalEntry[],
  lastAppliedMillis: number | null,
): JournalEntry[] {
  return entries
    .filter((e) => lastAppliedMillis == null || lastAppliedMillis < e.when)
    .sort((a, b) => a.idx - b.idx);
}

/**
 * Statements that can lose data, or break the deployment that keeps serving while the new one
 * is built (it still uses the old names). Those migrations are applied by hand after a backup;
 * the build refuses them. Index and constraint changes are fine.
 */
const DESTRUCTIVE: RegExp[] = [
  /\bDROP\s+(TABLE|SCHEMA|VIEW|MATERIALIZED\s+VIEW|TYPE|SEQUENCE)\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bRENAME\s+(TO|COLUMN)\b/i,
  /\bALTER\s+COLUMN\s+("[^"]+"|\w+)\s+(SET\s+DATA\s+)?TYPE\b/i,
  /\bALTER\s+COLUMN\s+("[^"]+"|\w+)\s+SET\s+NOT\s+NULL\b/i,
];

/** The destructive statements in one migration file (comments ignored), trimmed for display. */
export function destructiveStatements(sqlText: string): string[] {
  const withoutComments = sqlText.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  return withoutComments
    .split(/--> statement-breakpoint|;/)
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter((s) => s && DESTRUCTIVE.some((re) => re.test(s)))
    .map((s) => s.slice(0, 160));
}

/** "public.events" → the tables a drizzle snapshot defines. */
export function snapshotTables(snapshot: { tables: Record<string, unknown> }): string[] {
  return Object.keys(snapshot.tables).sort();
}
