import { afterEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/ingest/test-db";
import { LOCK_MS, MAX_ATTEMPTS } from "./lockout";
import { clearAttempts, readAttempts, reserveAttempt } from "./lockout-store";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const fn of closers.splice(0)) await fn();
});
async function testDb() {
  const r = await createTestDb();
  closers.push(() => r.pg.close());
  return r.db;
}

describe("reserveAttempt (feedback F03)", () => {
  it("admits exactly MAX_ATTEMPTS of many concurrent attempts and locks the IP", async () => {
    const db = await testDb();
    const now = new Date("2027-01-01T00:00:00Z");
    const results = await Promise.all(
      Array.from({ length: 12 }, () => reserveAttempt(db, "1.2.3.4", now)),
    );
    expect(results.filter((r) => r.admitted)).toHaveLength(MAX_ATTEMPTS);
    const rec = await readAttempts(db, "1.2.3.4");
    expect(rec?.failures).toBe(12);
    expect(rec?.lockedUntil?.getTime()).toBe(now.getTime() + LOCK_MS);
  });

  it("sets the lock on the last admitted attempt and never extends it", async () => {
    const db = await testDb();
    const t0 = new Date("2027-01-01T00:00:00Z");
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      const r = await reserveAttempt(db, "ip", t0);
      expect(r).toMatchObject({ admitted: true, record: { failures: i, lockedUntil: null } });
    }
    const last = await reserveAttempt(db, "ip", t0);
    expect(last.admitted).toBe(true);
    expect(last.record.lockedUntil?.getTime()).toBe(t0.getTime() + LOCK_MS);
    const later = await reserveAttempt(db, "ip", new Date(t0.getTime() + 60_000));
    expect(later.admitted).toBe(false);
    expect(later.record.lockedUntil?.getTime()).toBe(t0.getTime() + LOCK_MS);
  });

  it("starts over once the lock has expired or the record went quiet", async () => {
    const db = await testDb();
    const t0 = new Date("2027-01-01T00:00:00Z");
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await reserveAttempt(db, "ip", t0);
    const after = await reserveAttempt(db, "ip", new Date(t0.getTime() + LOCK_MS + 1));
    expect(after).toMatchObject({ admitted: true, record: { failures: 1, lockedUntil: null } });

    await reserveAttempt(db, "quiet", t0);
    const quiet = await reserveAttempt(db, "quiet", new Date(t0.getTime() + LOCK_MS + 1));
    expect(quiet.record.failures).toBe(1);
  });

  it("keeps IPs separate, and a correct password clears the count", async () => {
    const db = await testDb();
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) await reserveAttempt(db, "a");
    expect((await reserveAttempt(db, "b")).admitted).toBe(true);
    await clearAttempts(db, "a");
    expect((await reserveAttempt(db, "a")).record.failures).toBe(1);
  });
});
