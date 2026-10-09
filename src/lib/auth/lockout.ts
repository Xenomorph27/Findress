/**
 * Login lockout rules. Pure, so they are unit-tested; the Postgres store is lockout-store.ts.
 * 5 wrong passwords from one IP lock it for 15 minutes. A quiet IP's failure count resets after
 * the same 15 minutes.
 */
export const MAX_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60_000;

export interface AttemptRecord {
  failures: number;
  lastFailureAt: Date | null;
  lockedUntil: Date | null;
}

export const EMPTY_RECORD: AttemptRecord = { failures: 0, lastFailureAt: null, lockedUntil: null };

/** Milliseconds of lockout left (0 = not locked). */
export function lockRemainingMs(rec: AttemptRecord | null, now: Date): number {
  if (!rec?.lockedUntil) return 0;
  return Math.max(0, rec.lockedUntil.getTime() - now.getTime());
}

/** The record after one more wrong password. */
export function afterFailure(rec: AttemptRecord | null, now: Date): AttemptRecord {
  const base = rec ?? EMPTY_RECORD;
  const stale =
    (base.lockedUntil !== null && base.lockedUntil <= now) ||
    (base.lastFailureAt !== null && now.getTime() - base.lastFailureAt.getTime() > LOCK_MS);
  const failures = (stale ? 0 : base.failures) + 1;
  return {
    failures,
    lastFailureAt: now,
    lockedUntil: failures >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCK_MS) : null,
  };
}

/** Attempts left before the lockout starts. */
export function attemptsLeft(rec: AttemptRecord | null): number {
  return Math.max(0, MAX_ATTEMPTS - (rec?.failures ?? 0));
}

/** "14:59"-style countdown. */
export function formatLockRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Client IP for rate limiting: the first X-Forwarded-For hop (Vercel sets it), else X-Real-IP. */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (xff || headers.get("x-real-ip")?.trim() || "local").slice(0, 64);
}
