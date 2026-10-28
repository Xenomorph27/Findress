import { expect, it, vi } from "vitest";

// feedback F14: a call that closed an hour ago is neither "next" nor counted as open.
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));
vi.mock("next/cache", () => ({ cacheTag: () => {}, cacheLife: () => {} }));
import { getJournalRows } from "@/lib/data/journals";
import { journals, specialIssues } from "@/lib/db/schema";
import { nextCallAt, openCallsAt } from "@/lib/explore/journal-calls";
import { createTestDb } from "@/lib/ingest/test-db";

it("only calls still open at the viewer's time count and come first", async () => {
  const { db, pg } = await createTestDb();
  state.db = db;
  try {
    const [j] = await db
      .insert(journals)
      .values({ slug: "j", name: "Journal", abbreviation: "J" })
      .returning();
    const now = Date.now();
    await db.insert(specialIssues).values([
      {
        journalId: j.id,
        title: "Already closed",
        submissionDeadlineUtc: new Date(now - 3600_000),
        source: "fixture",
        sourceId: "past",
      },
      {
        journalId: j.id,
        title: "Still open",
        submissionDeadlineUtc: new Date(now + 86400_000),
        source: "fixture",
        sourceId: "future",
      },
      {
        journalId: j.id,
        title: "Later",
        submissionDeadlineUtc: new Date(now + 5 * 86400_000),
        source: "fixture",
        sourceId: "later",
      },
    ]);
    const [row] = await getJournalRows();
    expect(openCallsAt(row, now)).toHaveLength(2);
    expect(nextCallAt(row, now)?.title).toBe("Still open");
    // The same (cached) row, viewed after the next call closed: the one after takes over.
    const later = now + 2 * 86400_000;
    expect(openCallsAt(row, later)).toHaveLength(1);
    expect(nextCallAt(row, later)?.title).toBe("Later");
    expect(nextCallAt(row, now + 10 * 86400_000)).toBeNull();
  } finally {
    await pg.close();
  }
});
