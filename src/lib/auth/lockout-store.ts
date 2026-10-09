import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { loginAttempts } from "@/lib/db/schema";
import { afterFailure, type AttemptRecord } from "./lockout";

/** Postgres-backed lockout state, one row per client IP. */

export async function readAttempts(db: Db, ip: string): Promise<AttemptRecord | null> {
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.ip, ip)).limit(1);
  return row
    ? { failures: row.failures, lastFailureAt: row.lastFailureAt, lockedUntil: row.lockedUntil }
    : null;
}

export async function recordFailure(
  db: Db,
  ip: string,
  current: AttemptRecord | null,
  now = new Date(),
): Promise<AttemptRecord> {
  const next = afterFailure(current, now);
  await db
    .insert(loginAttempts)
    .values({ ip, ...next })
    .onConflictDoUpdate({ target: loginAttempts.ip, set: next });
  return next;
}

export async function clearAttempts(db: Db, ip: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.ip, ip));
}
