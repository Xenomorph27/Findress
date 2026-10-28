import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { loginAttempts } from "@/lib/db/schema";
import { LOCK_MS, MAX_ATTEMPTS, type AttemptRecord } from "./lockout";

/** Postgres-backed lockout state, one row per client IP. */

export async function readAttempts(db: Db, ip: string): Promise<AttemptRecord | null> {
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.ip, ip)).limit(1);
  return row
    ? { failures: row.failures, lastFailureAt: row.lastFailureAt, lockedUntil: row.lockedUntil }
    : null;
}

/**
 * Count one password attempt before the password is checked, in a single statement, so
 * concurrent requests cannot all read the same "not locked yet" snapshot. Same rules as
 * afterFailure(): a stale record restarts at 1, the MAX_ATTEMPTS-th attempt starts the lock,
 * and an existing lock is never extended. The attempt may proceed only when `admitted`;
 * a correct password then clears the row (clearAttempts).
 */
export async function reserveAttempt(
  db: Db,
  ip: string,
  now = new Date(),
): Promise<{ admitted: boolean; record: AttemptRecord }> {
  const at = sql`${now.toISOString()}::timestamptz`;
  const lockAt = sql`${new Date(now.getTime() + LOCK_MS).toISOString()}::timestamptz`;
  const window = sql`${`${LOCK_MS} milliseconds`}::interval`;
  const staleExpr = sql`((login_attempts.locked_until is not null and login_attempts.locked_until <= ${at})
    or (login_attempts.last_failure_at is not null and ${at} - login_attempts.last_failure_at > ${window}))`;
  const failuresExpr = sql`case when ${staleExpr} then 1 else least(login_attempts.failures + 1, 1000) end`;
  const [row] = await db
    .insert(loginAttempts)
    .values({
      ip,
      failures: 1,
      lastFailureAt: now,
      lockedUntil: MAX_ATTEMPTS <= 1 ? new Date(now.getTime() + LOCK_MS) : null,
    })
    .onConflictDoUpdate({
      target: loginAttempts.ip,
      set: {
        failures: failuresExpr,
        lastFailureAt: at,
        lockedUntil: sql`case
          when not ${staleExpr} and login_attempts.locked_until is not null then login_attempts.locked_until
          when ${failuresExpr} >= ${MAX_ATTEMPTS} then ${lockAt}
          else null end`,
      },
    })
    .returning();
  const record = {
    failures: row.failures,
    lastFailureAt: row.lastFailureAt,
    lockedUntil: row.lockedUntil,
  };
  return { admitted: record.failures <= MAX_ATTEMPTS, record };
}

export async function clearAttempts(db: Db, ip: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.ip, ip));
}
