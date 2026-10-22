import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { bookmarks, chats, events, eventSources, notes } from "@/lib/db/schema";
import { mergeEventInputs } from "./merge";
import { writeMergedEvents } from "./persist";
import { createTestDb } from "./test-db";
import { emptyEvent, type EventInput } from "./types";

// A real Postgres (PGlite, in memory) with the project's actual migrations applied.
let pg: PGlite;
let db: Db;

beforeAll(async () => {
  ({ pg, db } = await createTestDb());
}, 60_000);

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  await pg.exec(
    "truncate bookmarks, notes, chats, deadlines, event_sources, events restart identity cascade",
  );
});

const workshop = (acronym: string, sourceId: string, parentKey: string): EventInput => ({
  ...emptyEvent({ source: "openreview", sourceId, acronym, year: 2026 }),
  name: "A workshop on AI for research",
  type: "workshop",
  parentKey,
  website: "https://example.org/ws",
});

describe("event identity survives a key/slug change", () => {
  it("keeps the same row, bookmark, note and chat when the acronym gains a @VENUE suffix", async () => {
    // Run 1 stored the workshop under its plain key.
    const before = mergeEventInputs([
      workshop("AI4Research", "ICML.cc/2026/Workshop/AI4Research", "icml-2026"),
    ]);
    await writeMergedEvents(db, before);
    const [row] = await db.select().from(events);
    expect(row.slug).toBe("ai4research-2026");
    await db.insert(bookmarks).values({ eventId: row.id, status: "planning" });
    await db.insert(notes).values({ eventId: row.id, bodyMd: "my note" });
    await db.insert(chats).values({ eventId: row.id, scope: `event:${row.id}`, messages: [] });

    // Run 2: the same source record now yields a different acronym (and so key + slug).
    const after = mergeEventInputs([
      workshop("AI4Research@ICML", "ICML.cc/2026/Workshop/AI4Research", "icml-2026"),
      workshop("AI4Research@AAAI", "AAAI.org/2026/Workshop/AI4Research", "aaai-2026"),
    ]);
    const out = await writeMergedEvents(db, after);

    const all = await db.select().from(events);
    const moved = all.find((e) => e.id === row.id)!;
    expect(out.rekeyed).toBe(1);
    expect(moved.slug).toBe("ai4research-icml-2026");
    expect(moved.dedupeKey).toBe("ai4research-icml-2026");
    // No stale duplicate of the old key, and the new sibling is a separate row.
    expect(all.map((e) => e.slug).sort()).toEqual([
      "ai4research-aaai-2026",
      "ai4research-icml-2026",
    ]);
    // The owner's data is still attached to the very same event id.
    expect(await db.select().from(bookmarks)).toEqual([
      expect.objectContaining({ eventId: row.id, status: "planning" }),
    ]);
    expect(await db.select().from(notes)).toHaveLength(1);
    expect(await db.select().from(chats)).toHaveLength(1);
    expect((await db.select().from(eventSources)).filter((r) => r.eventId === row.id)).toHaveLength(
      1,
    );
  });

  it("handles two workshops swapping keys without tripping the unique indexes", async () => {
    await writeMergedEvents(
      db,
      mergeEventInputs([
        workshop("OPT@A", "A/2026/Workshop/OPT", "a-2026"),
        workshop("OPT@B", "B/2026/Workshop/OPT", "b-2026"),
      ]),
    );
    const [a, b] = (await db.select().from(events)).sort((x, y) => x.id - y.id);
    await db.insert(bookmarks).values([{ eventId: a.id }, { eventId: b.id }]);
    // The sources' acronyms are exchanged.
    await writeMergedEvents(
      db,
      mergeEventInputs([
        workshop("OPT@B", "A/2026/Workshop/OPT", "a-2026"),
        workshop("OPT@A", "B/2026/Workshop/OPT", "b-2026"),
      ]),
    );
    const now = new Map((await db.select().from(events)).map((e) => [e.id, e.slug]));
    expect(now.get(a.id)).toBe("opt-b-2026");
    expect(now.get(b.id)).toBe("opt-a-2026");
    expect(await db.select().from(bookmarks)).toHaveLength(2);
  });

  it("never deletes a bookmarked event that no source lists any more", async () => {
    await writeMergedEvents(
      db,
      mergeEventInputs([workshop("GONE", "X/2026/Workshop/GONE", "x-2026")]),
    );
    const [gone] = await db.select().from(events);
    await db.insert(bookmarks).values({ eventId: gone.id });
    await writeMergedEvents(
      db,
      mergeEventInputs([workshop("OTHER", "Y/2026/Workshop/OTHER", "y-2026")]),
    );
    expect((await db.select().from(events)).map((e) => e.slug).sort()).toEqual([
      "gone-2026",
      "other-2026",
    ]);
    expect(await db.select().from(bookmarks)).toHaveLength(1);
  });
});
