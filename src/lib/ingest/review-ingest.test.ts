import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { JOURNAL_SEED } from "@/data/journals-seed";
import {
  bookmarks,
  chats,
  deadlines,
  events,
  eventSources,
  extractions,
  journals,
  notes,
  sourceItems,
  specialIssues,
} from "@/lib/db/schema";
import { huggingfaceAdapter, normalizeHfFile } from "@/lib/sources/huggingface";
import { applyExtractions } from "./apply-extractions";
import { enrichCfps } from "./enrich-cfp";
import type { PoliteFetcher } from "./http";
import { runJournalRanksStep, upsertSeedJournals } from "./journals";
import { acquireLease, releaseLease } from "./lease";
import { mergeEventInputs } from "./merge";
import { saveSourceItems, writeMergedEvents } from "./persist";
import { createTestDb } from "./test-db";
import { emptyEvent, validateEvents, type EventInput } from "./types";

// Regression tests for feedback.md: each started as one of the review's reproductions of the
// defect and now asserts the corrected behavior.

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const fn of closers.splice(0)) await fn();
});
async function testDb() {
  const r = await createTestDb();
  closers.push(() => r.pg.close());
  return r;
}
function source(acronym: string): EventInput {
  return {
    ...emptyEvent({ source: "huggingface", sourceId: acronym, acronym, year: 2027 }),
    deadlines: [
      {
        kind: "paper" as const,
        label: null,
        dueAtUtc: "2027-01-20T12:00:00Z",
        originalTz: "UTC",
        originalText: null,
        comment: null,
      },
    ],
  };
}
const page = (body: string, title = "Call for Papers") =>
  `<html><head><title>${title}</title></head><body><article>${body}</article></body></html>`;
const fetcherServing = (html: () => string) =>
  ({
    get: async () => ({
      ok: true,
      status: 200,
      url: "https://example.org/cfp",
      contentType: "text/html",
      text: html(),
    }),
  }) as unknown as PoliteFetcher;

describe("F04 partial upstream refresh", () => {
  const hfFetcher = (failing: string[]) =>
    ({
      getJson: async () => ["A", "B", "C"].map((x) => ({ type: "file", oid: x, path: `${x}.yml` })),
      getText: async (url: string) => {
        const x = url.match(/([ABC])\.yml$/)![1];
        if (failing.includes(x)) throw new Error("temporary 503");
        return `- title: ${x}\n  id: ${x}\n  year: 2027\n`;
      },
    }) as unknown as PoliteFetcher;
  const ctx = (fetcher: PoliteFetcher) => ({
    fetcher,
    now: new Date(),
    deadlineMs: Date.now() + 60_000,
    previous: new Map(),
    cursor: null,
    env: {},
    log: () => {},
  });

  it("a run with one failed file does not prune that file's items", async () => {
    const { db } = await testDb();
    await saveSourceItems(
      db,
      "huggingface",
      [source("A"), source("B"), source("C")],
      new Date(),
      false,
    );
    await db.update(sourceItems).set({ lastSeenAt: new Date("2020-01-01") });
    const result = await huggingfaceAdapter.run(ctx(hfFetcher(["C"])));
    expect(result.pruneStale).toBe(false);
    const saved = await saveSourceItems(
      db,
      "huggingface",
      result.events,
      new Date(),
      result.pruneStale,
    );
    expect(saved.pruned).toBe(0);
    expect((await db.select().from(sourceItems)).map((r) => r.sourceId).sort()).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("a complete run still prunes what upstream dropped", async () => {
    const { db } = await testDb();
    await saveSourceItems(db, "huggingface", [source("A"), source("Z")], new Date(), false);
    await db.update(sourceItems).set({ lastSeenAt: new Date("2020-01-01") });
    const result = await huggingfaceAdapter.run(ctx(hfFetcher([])));
    expect(result.pruneStale).toBe(true);
    await saveSourceItems(
      db,
      "huggingface",
      result.events,
      new Date(),
      result.pruneStale,
      result.keepSourceIds,
    );
    expect((await db.select().from(sourceItems)).map((r) => r.sourceId).sort()).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("an item withheld for malformed data keeps its last good copy", async () => {
    const { db } = await testDb();
    await saveSourceItems(db, "huggingface", [source("A"), source("B")], new Date(), false);
    await db.update(sourceItems).set({ lastSeenAt: new Date("2020-01-01") });
    await saveSourceItems(db, "huggingface", [source("A")], new Date(), true, ["B"]);
    const rows = await db.select().from(sourceItems);
    expect(rows.map((r) => r.sourceId).sort()).toEqual(["A", "B"]);
  });
});

describe("F18 invalid calendar dates", () => {
  it("February 31 is withheld with a reason, never re-dated to March", () => {
    const raw =
      '- title: REV\n  id: rev27\n  year: 2027\n  deadline: "2027-02-31 23:59:59"\n  timezone: UTC\n';
    const warnings: string[] = [];
    const withheld: { sourceId: string; reason: string }[] = [];
    const normalized = validateEvents(normalizeHfFile(raw, "review.yml", withheld), warnings);
    expect(normalized).toEqual([]);
    expect(withheld).toEqual([
      { sourceId: "rev27", reason: expect.stringContaining("2027-02-31") },
    ]);
  });

  it("an unknown deadline (TBA) is still just no deadline", () => {
    const raw = "- title: REV\n  year: 2027\n  deadline: TBA\n  timezone: UTC\n";
    const withheld: { sourceId: string; reason: string }[] = [];
    const out = normalizeHfFile(raw, "review.yml", withheld);
    expect(withheld).toEqual([]);
    expect(out[0].deadlines).toEqual([]);
  });
});

describe("F05 merge publication is atomic", () => {
  it("a failure while inserting deadlines leaves the previous state intact", async () => {
    const { db, pg } = await testDb();
    const merged = mergeEventInputs([source("KEEP")]);
    await writeMergedEvents(db, merged);
    await pg.exec(`CREATE FUNCTION review_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER review_fail BEFORE INSERT ON deadlines FOR EACH ROW EXECUTE FUNCTION review_fail();`);
    await expect(writeMergedEvents(db, merged)).rejects.toThrow();
    expect(await db.select().from(events)).toHaveLength(1);
    expect(await db.select().from(deadlines)).toHaveLength(1);
    expect(await db.select().from(eventSources)).toHaveLength(1);
  });
});

describe("F05 run lease", () => {
  it("only one holder at a time; free again after release or expiry", async () => {
    const { db } = await testDb();
    expect(await acquireLease(db, "ingest", "a", 60_000)).toBe(true);
    expect(await acquireLease(db, "ingest", "b", 60_000)).toBe(false);
    await releaseLease(db, "ingest", "b"); // not the holder: no effect
    expect(await acquireLease(db, "ingest", "c", 60_000)).toBe(false);
    await releaseLease(db, "ingest", "a");
    expect(await acquireLease(db, "ingest", "b", 1)).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(await acquireLease(db, "ingest", "c", 60_000)).toBe(true);
  });

  it("concurrent attempts produce exactly one holder", async () => {
    const { db } = await testDb();
    const got = await Promise.all(
      ["a", "b", "c", "d"].map((h) => acquireLease(db, "ingest", h, 60_000)),
    );
    expect(got.filter(Boolean)).toHaveLength(1);
  });
});

describe("F07 owner protection does not block pruning", () => {
  it.each([
    ["journal bookmark", "bookmark-journal"],
    ["journal note", "note-journal"],
    ["special-issue bookmark", "bookmark-special"],
  ])("a %s does not keep an unrelated abandoned event", async (_label, kind) => {
    const { db } = await testDb();
    await writeMergedEvents(db, mergeEventInputs([source("KEEP"), source("DROP")]));
    const [j] = await db
      .insert(journals)
      .values({ slug: "j", name: "Journal", abbreviation: "J" })
      .returning();
    if (kind === "bookmark-journal") await db.insert(bookmarks).values({ journalId: j.id });
    if (kind === "note-journal") await db.insert(notes).values({ journalId: j.id, bodyMd: "n" });
    if (kind === "bookmark-special") {
      const [si] = await db
        .insert(specialIssues)
        .values({ journalId: j.id, title: "SI", source: "fixture", sourceId: "si" })
        .returning();
      await db.insert(bookmarks).values({ specialIssueId: si.id });
    }
    const result = await writeMergedEvents(db, mergeEventInputs([source("KEEP")]));
    expect(result.deleted).toBe(1);
    expect((await db.select().from(events)).map((e) => e.acronym)).toEqual(["KEEP"]);
  });

  it("events the owner bookmarked, annotated or chatted about are still kept", async () => {
    const { db } = await testDb();
    await writeMergedEvents(
      db,
      mergeEventInputs([
        source("KEEP"),
        source("BM"),
        source("NOTE"),
        source("CHAT"),
        source("DROP"),
      ]),
    );
    const byAcronym = new Map((await db.select().from(events)).map((e) => [e.acronym, e.id]));
    await db.insert(bookmarks).values({ eventId: byAcronym.get("BM")! });
    await db.insert(notes).values({ eventId: byAcronym.get("NOTE")!, bodyMd: "n" });
    await db
      .insert(chats)
      .values({ eventId: byAcronym.get("CHAT")!, scope: `event:${byAcronym.get("CHAT")}` });
    const result = await writeMergedEvents(db, mergeEventInputs([source("KEEP")]));
    expect(result.deleted).toBe(1);
    expect((await db.select().from(events)).map((e) => e.acronym).sort()).toEqual([
      "BM",
      "CHAT",
      "KEEP",
      "NOTE",
    ]);
  });
});

describe("F09 block pages never replace a CFP", () => {
  it.each([
    [
      "an HTTP-200 bot challenge",
      "Verify you are human. Access denied. Please enable JavaScript and cookies to continue. ".repeat(
        12,
      ),
      "Access denied",
    ],
    ["a login wall", "Please log in to continue. ".repeat(12), "Sign in"],
  ])("%s keeps the previous text", async (_label, text, title) => {
    const { db } = await testDb();
    await writeMergedEvents(db, mergeEventInputs([source("KEEP")]));
    await db.update(events).set({
      website: "https://example.org/cfp",
      cfpText: "Previously valid CFP",
      cfpHash: "previous",
    });
    const out = await enrichCfps(
      db,
      fetcherServing(() => page(`<p>${text}</p>`, title)),
      Date.now() + 60_000,
    );
    const [e] = await db.select().from(events);
    expect(e.cfpText).toBe("Previously valid CFP");
    expect(e.cfpFetchedAt).not.toBeNull();
    expect(out).toMatchObject({ blocked: 1, updated: 0 });
  });

  it("a real CFP that merely mentions a captcha-free submission system is stored", async () => {
    const { db } = await testDb();
    await writeMergedEvents(db, mergeEventInputs([source("KEEP")]));
    await db.update(events).set({ website: "https://example.org/cfp" });
    const text =
      "We invite submissions on machine learning and artificial intelligence. Papers are limited to 8 pages. ".repeat(
        6,
      );
    await enrichCfps(
      db,
      fetcherServing(() => page(`<p>${text}</p>`)),
      Date.now() + 60_000,
    );
    expect((await db.select().from(events))[0].cfpText).toContain("limited to 8 pages");
  });
});

describe("F10 facts owned by the CFP page follow it", () => {
  it("page limit, review type and submission site follow a changed page", async () => {
    const { db } = await testDb();
    await writeMergedEvents(db, mergeEventInputs([source("KEEP")]));
    await db.update(events).set({ website: "https://example.org/cfp" });
    let review = "Double-blind";
    let limit = "8";
    let site = "https://easychair.org/conferences/?conf=old";
    const fetcher = fetcherServing(() =>
      page(
        `<p>${`${review} review. Submissions are limited to ${limit} pages. We invite research on algorithms and artificial intelligence. `.repeat(8)}</p><a href="${site}">Submit</a>`,
      ),
    );
    await enrichCfps(db, fetcher, Date.now() + 60_000);
    const [first] = await db.select().from(events);
    expect(first).toMatchObject({ reviewType: "Double-blind", submissionSite: site });
    expect(first.pageLimit).toContain("8");

    review = "Single-blind";
    limit = "12";
    site = "https://easychair.org/conferences/?conf=new";
    await db.update(events).set({ cfpFetchedAt: null });
    await enrichCfps(db, fetcher, Date.now() + 60_000);
    const [second] = await db.select().from(events);
    expect(second).toMatchObject({ reviewType: "Single-blind", submissionSite: site });
    expect(second.pageLimit).toContain("12");
  });

  it("a value a list source supplied is kept", async () => {
    const { db } = await testDb();
    await writeMergedEvents(db, mergeEventInputs([source("KEEP")]));
    await db.update(events).set({
      website: "https://example.org/cfp",
      submissionSite: "https://openreview.net/group?id=KEEP",
      fieldProvenance: { submissionSite: "openreview" },
    });
    const text =
      "Submit via https://cmt3.research.microsoft.com/KEEP2027. We invite research on algorithms and AI. ".repeat(
        8,
      );
    await enrichCfps(
      db,
      fetcherServing(() =>
        page(`<p>${text}</p><a href="https://cmt3.research.microsoft.com/KEEP2027">Submit</a>`),
      ),
      Date.now() + 60_000,
    );
    expect((await db.select().from(events))[0].submissionSite).toBe(
      "https://openreview.net/group?id=KEEP",
    );
  });
});

describe("F11 CORE ranks survive a partial list", () => {
  const firstPage = () =>
    readFileSync("src/lib/sources/__fixtures__/journals/core-jnl-ranks-p1.html", "utf8");

  it("a run stopped after page one keeps ranks it did not see, and says so", async () => {
    const { db } = await testDb();
    await db.insert(journals).values({
      slug: "later",
      name: "Journal On Later Page",
      abbreviation: "LATER",
      rankCoreJournal: "A",
    });
    const fetcher = {
      getText: async (url: string) => {
        if (url.includes("githubusercontent")) throw new Error("CCF unavailable");
        return firstPage();
      },
    } as unknown as PoliteFetcher;
    const out = await runJournalRanksStep(db, fetcher, Date.now() - 1, () => {});
    expect((await db.select().from(journals))[0].rankCoreJournal).toBe("A");
    expect(out.warnings.some((w) => /partial list/.test(w))).toBe(true);
  });

  it("an unparseable CCF download does not clear CCF ranks", async () => {
    const { db } = await testDb();
    await db
      .insert(journals)
      .values({ slug: "j", name: "Journal", abbreviation: "J", rankCcf: "A" });
    const fetcher = {
      getText: async (url: string) => {
        if (url.includes("githubusercontent")) return "<html>rate limited</html>";
        throw new Error("CORE unavailable");
      },
    } as unknown as PoliteFetcher;
    const out = await runJournalRanksStep(db, fetcher, Date.now() + 60_000, () => {});
    expect((await db.select().from(journals))[0].rankCcf).toBe("A");
    expect(out.warnings.some((w) => w.startsWith("CCF:"))).toBe(true);
  });
});

describe("F13 a refreshed AI extraction replaces its previous value", () => {
  async function seeded() {
    const r = await testDb();
    await writeMergedEvents(r.db, mergeEventInputs([source("KEEP")]));
    const [e] = await r.db.select().from(events);
    await r.db.insert(extractions).values({
      eventId: e.id,
      field: "mode",
      value: "virtual",
      quote: "virtual",
      sourceUrl: "https://example.org",
      model: "fixture",
      promptVersion: "1",
      contentHash: "old",
    });
    await applyExtractions(r.db);
    return { ...r, eventId: e.id };
  }

  it("old to new", async () => {
    const { db } = await seeded();
    expect((await db.select().from(events))[0].mode).toBe("virtual");
    await db.update(extractions).set({ value: "hybrid", quote: "hybrid", contentHash: "new" });
    await applyExtractions(db);
    expect((await db.select().from(events))[0].mode).toBe("hybrid");
  });

  it("old to absent", async () => {
    const { db } = await seeded();
    await db.delete(extractions);
    await applyExtractions(db);
    expect((await db.select().from(events))[0].mode).toBeNull();
  });

  it("a value from a real source is never replaced", async () => {
    const { db } = await seeded();
    await db.update(events).set({ mode: "in-person", fieldProvenance: { mode: "huggingface" } });
    await db.update(extractions).set({ value: "hybrid" });
    await applyExtractions(db);
    expect((await db.select().from(events))[0].mode).toBe("in-person");
  });
});

describe("F19 a journal with owner work survives leaving the seed list", () => {
  async function journalWith(work: "bookmark" | "note" | "chat" | "si-note" | "none") {
    const { db } = await testDb();
    const [j] = await db
      .insert(journals)
      .values({ slug: "removed-review", name: "Removed Review Journal", abbreviation: "RRJ" })
      .returning();
    if (work === "bookmark") await db.insert(bookmarks).values({ journalId: j.id });
    if (work === "note") await db.insert(notes).values({ journalId: j.id, bodyMd: "Owner notes" });
    if (work === "chat")
      await db.insert(chats).values({ journalId: j.id, scope: `journal:${j.id}`, messages: [] });
    if (work === "si-note") {
      const [si] = await db
        .insert(specialIssues)
        .values({ journalId: j.id, title: "SI", source: "fixture", sourceId: "si" })
        .returning();
      await db.insert(notes).values({ specialIssueId: si.id, bodyMd: "SI notes" });
    }
    return db;
  }

  it.each(["bookmark", "note", "chat", "si-note"] as const)("retained with a %s", async (work) => {
    const db = await journalWith(work);
    const result = await upsertSeedJournals(db, [JOURNAL_SEED[0]]);
    expect(result).toMatchObject({ removed: 0, retained: 1 });
    expect((await db.select().from(journals)).some((j) => j.slug === "removed-review")).toBe(true);
    const work_ = [
      ...(await db.select().from(bookmarks)),
      ...(await db.select().from(notes)),
      ...(await db.select().from(chats)),
    ];
    expect(work_).toHaveLength(1);
  });

  it("deleted when there is no owner work", async () => {
    const db = await journalWith("none");
    const result = await upsertSeedJournals(db, [JOURNAL_SEED[0]]);
    expect(result).toMatchObject({ removed: 1, retained: 0 });
  });
});
