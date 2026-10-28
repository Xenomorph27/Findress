import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";

/**
 * Housekeeping so operational tables do not grow forever (feedback, broader #6). Owner data
 * (bookmarks, notes, chats) and catalogue data are never touched.
 * - http_cache: entries not refreshed for 60 days (the next fetch is simply unconditional);
 * - source_runs: runs older than 180 days, always keeping each step's latest run (it holds
 *   the step's resume cursor and the "last run" shown in the app);
 * - login_attempts: records with no failure or lock in the last day (the lock rules ignore
 *   them anyway).
 */
export const RETENTION = { httpCacheDays: 60, sourceRunsDays: 180, loginAttemptsDays: 1 };

export async function runRetentionStep(db: Db) {
  const count = (r: { rowCount?: number | null; affectedRows?: number }) =>
    Number(r.rowCount ?? r.affectedRows ?? 0);
  const httpCache = await db.execute(sql`
    delete from http_cache
    where fetched_at < now() - make_interval(days => ${RETENTION.httpCacheDays})`);
  const sourceRuns = await db.execute(sql`
    delete from source_runs r
    where r.started_at < now() - make_interval(days => ${RETENTION.sourceRunsDays})
      and r.id <> (select max(x.id) from source_runs x where x.source = r.source)`);
  const loginAttempts = await db.execute(sql`
    delete from login_attempts
    where greatest(coalesce(locked_until, '-infinity'), coalesce(last_failure_at, '-infinity'))
      < now() - make_interval(days => ${RETENTION.loginAttemptsDays})`);
  const stats = {
    httpCache: count(httpCache),
    sourceRuns: count(sourceRuns),
    loginAttempts: count(loginAttempts),
  };
  return { items: stats.httpCache + stats.sourceRuns + stats.loginAttempts, stats, warnings: [] };
}
