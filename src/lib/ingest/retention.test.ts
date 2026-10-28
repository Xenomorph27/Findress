import { afterEach, expect, it } from "vitest";
import { httpCache, loginAttempts, sourceRuns } from "@/lib/db/schema";
import { runRetentionStep } from "./retention";
import { createTestDb } from "./test-db";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const fn of closers.splice(0)) await fn();
});
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

it("removes only old operational rows and keeps each step's latest run", async () => {
  const { db, pg } = await createTestDb();
  closers.push(() => pg.close());
  await db.insert(httpCache).values([
    { url: "https://old.example/", status: 200, body: "x", fetchedAt: daysAgo(90) },
    { url: "https://new.example/", status: 200, body: "x", fetchedAt: daysAgo(5) },
  ]);
  await db.insert(sourceRuns).values([
    { source: "wikicfp", startedAt: daysAgo(400) },
    { source: "wikicfp", startedAt: daysAgo(300) },
    { source: "wikicfp", startedAt: daysAgo(1) },
    // A step that has not run for a year keeps its last run (resume cursor).
    { source: "openreview", startedAt: daysAgo(365) },
  ]);
  await db.insert(loginAttempts).values([
    { ip: "203.0.113.1", failures: 2, lastFailureAt: daysAgo(3) },
    { ip: "203.0.113.2", failures: 1, lastFailureAt: new Date() },
    {
      ip: "203.0.113.3",
      failures: 5,
      lastFailureAt: daysAgo(3),
      lockedUntil: new Date(Date.now() + 3600_000),
    },
  ]);

  const out = await runRetentionStep(db);
  expect(out.stats).toEqual({ httpCache: 1, sourceRuns: 2, loginAttempts: 1 });
  expect((await db.select().from(httpCache)).map((r) => r.url)).toEqual(["https://new.example/"]);
  expect((await db.select().from(sourceRuns)).map((r) => r.source).sort()).toEqual([
    "openreview",
    "wikicfp",
  ]);
  expect((await db.select().from(loginAttempts)).map((r) => r.ip).sort()).toEqual([
    "203.0.113.2",
    "203.0.113.3",
  ]);
});
