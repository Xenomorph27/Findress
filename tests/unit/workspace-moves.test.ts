import { afterEach, describe, expect, it, vi } from "vitest";

// feedback F16: a Kanban drop is one request applied in one transaction.
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ isOwnerRequest: async () => true }));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));
import { PUT } from "@/app/api/workspace/bookmarks/route";
import { moveBookmarks, upsertBookmark } from "@/lib/data/workspace";
import { bookmarks, events } from "@/lib/db/schema";
import { createTestDb } from "@/lib/ingest/test-db";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const fn of closers.splice(0)) await fn();
});

async function board() {
  const { db, pg } = await createTestDb();
  closers.push(() => pg.close());
  state.db = db;
  const rows = await db
    .insert(events)
    .values(
      ["A", "B", "C"].map((acronym) => ({
        slug: `${acronym.toLowerCase()}-2027`,
        acronym,
        year: 2027,
        name: acronym,
        dedupeKey: acronym.toLowerCase(),
        seriesKey: acronym.toLowerCase(),
      })),
    )
    .returning();
  for (const r of rows) await upsertBookmark(db, { kind: "event", id: r.id }, "interested", 0);
  return { db, pg, ids: rows.map((r) => r.id) };
}
const put = (body: unknown) =>
  PUT(
    new Request("https://findress.test/api/workspace/bookmarks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("moveBookmarks", () => {
  it("moves every card of a drop", async () => {
    const { db, ids } = await board();
    const out = await moveBookmarks(db, [
      { kind: "event", id: ids[2], status: "writing", position: 0 },
      { kind: "event", id: ids[0], status: "writing", position: 10 },
    ]);
    expect(out).toEqual({ updated: 2, missing: 0 });
    const rows = await db.select().from(bookmarks);
    const byEvent = new Map(rows.map((r) => [r.eventId, r]));
    expect(byEvent.get(ids[2])).toMatchObject({ status: "writing", position: 0 });
    expect(byEvent.get(ids[0])).toMatchObject({ status: "writing", position: 10 });
    expect(byEvent.get(ids[1])).toMatchObject({ status: "interested" });
  });

  it("does not recreate a bookmark removed meanwhile", async () => {
    const { db, ids } = await board();
    await db.delete(bookmarks);
    const out = await moveBookmarks(db, [
      { kind: "event", id: ids[0], status: "writing", position: 0 },
    ]);
    expect(out).toEqual({ updated: 0, missing: 1 });
    expect(await db.select().from(bookmarks)).toHaveLength(0);
  });

  it("a failure part-way changes nothing", async () => {
    const { db, pg, ids } = await board();
    await pg.exec(`CREATE FUNCTION review_fail() RETURNS trigger AS $$ BEGIN
        IF NEW.position = 99 THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER review_fail BEFORE UPDATE ON bookmarks FOR EACH ROW EXECUTE FUNCTION review_fail();`);
    await expect(
      moveBookmarks(db, [
        { kind: "event", id: ids[0], status: "writing", position: 0 },
        { kind: "event", id: ids[1], status: "writing", position: 99 },
      ]),
    ).rejects.toThrow();
    expect((await db.select().from(bookmarks)).every((b) => b.status === "interested")).toBe(true);
  });
});

describe("PUT /api/workspace/bookmarks", () => {
  it("applies a valid batch", async () => {
    const { ids } = await board();
    const res = await put({
      items: [{ kind: "event", id: ids[0], status: "submitted", position: 0 }],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updated: 1, missing: 0 });
  });

  it.each([
    ["no items", { items: [] }],
    ["unknown status", { items: [{ kind: "event", id: 1, status: "won", position: 0 }] }],
    ["unknown kind", { items: [{ kind: "talk", id: 1, status: "writing", position: 0 }] }],
    [
      "too many",
      {
        items: Array.from({ length: 501 }, (_, i) => ({
          kind: "event",
          id: i + 1,
          status: "writing",
          position: 0,
        })),
      },
    ],
  ])("rejects %s with 400", async (_label, body) => {
    await board();
    expect((await put(body)).status).toBe(400);
  });
});
