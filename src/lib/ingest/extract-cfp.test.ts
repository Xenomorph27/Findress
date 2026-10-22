import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { deadlines, events, extractions, sourceRuns } from "@/lib/db/schema";
import { applyExtractions } from "./apply-extractions";
import {
  classifyApiError,
  extractConfig,
  QuotaExhausted,
  RequestPacer,
  runExtractStep,
  withBackoff,
  type Clock,
  type ExtractConfig,
} from "./extract-cfp";
import { mergeEventInputs } from "./merge";
import { writeMergedEvents } from "./persist";
import { createTestDb } from "./test-db";
import { emptyEvent } from "./types";

const PAGE = `# ExampleWS 2027
## About
The Example Workshop on Robust Learning brings together researchers studying distribution shift, robustness and evaluation of machine learning systems in the wild.
## Important dates
- Paper Submission Deadline: 01 November 2026 (AoE)
- Notification of Acceptance: 15 November 2026
The workshop will be held as a hybrid event in Singapore. Papers are submitted online via OpenReview.
Further details about the program, invited speakers and the organising committee will be added soon.
Please check this page regularly for updates about the schedule and the venue of the workshop.
`;

const GOOD_REPLY = JSON.stringify({
  deadlines: [
    {
      kind: "paper",
      label: "Paper submission",
      date_text: "01 November 2026",
      iso_date: "2026-11-01",
      time_text: null,
      timezone_text: "AoE",
      quote: "Paper Submission Deadline: 01 November 2026 (AoE)",
    },
    {
      kind: "notification",
      label: "Notification",
      date_text: "15 November 2026",
      iso_date: "2026-11-15",
      time_text: null,
      timezone_text: null,
      quote: "Notification of Acceptance: 15 November 2026",
    },
  ],
  mode: { value: "hybrid", quote: "The workshop will be held as a hybrid event in Singapore." },
  description: {
    quote:
      "The Example Workshop on Robust Learning brings together researchers studying distribution shift, robustness and evaluation of machine learning systems in the wild.",
  },
});

let pg: PGlite;
let db: Db;
beforeAll(async () => {
  ({ pg, db } = await createTestDb());
}, 60_000);
afterAll(async () => pg.close());
beforeEach(async () => {
  await pg.exec(
    "truncate extractions, source_runs, deadlines, event_sources, events restart identity cascade",
  );
});

class FakeClock implements Clock {
  t = 1_000_000;
  sleeps: number[] = [];
  now = () => this.t;
  sleep = async (ms: number) => {
    this.sleeps.push(ms);
    this.t += ms;
  };
}
const CFG: ExtractConfig = { perRun: 10, dailyLimit: 100, minIntervalMs: 13_000, maxRetries: 3 };
const FAR = 1e15;

let n = 0;
async function seed(over: Partial<typeof events.$inferInsert> = {}) {
  n++;
  const acronym = over.acronym ?? `WS${n}`;
  const [row] = await db
    .insert(events)
    .values({
      slug: `${acronym.toLowerCase()}-2027`,
      dedupeKey: `${acronym.toLowerCase()}-2027`,
      seriesKey: acronym.toLowerCase(),
      acronym,
      year: 2027,
      type: "workshop",
      cfpText: PAGE,
      cfpHash: `hash-${n}`,
      cfpUrl: "https://example.org/cfp",
      website: "https://example.org",
      ...over,
    })
    .returning();
  return row;
}

const run = (
  generate: (s: string, p: string) => Promise<string>,
  over: Partial<ExtractConfig> = {},
  clock = new FakeClock(),
) =>
  runExtractStep(db, FAR, () => {}, {
    generate,
    model: "test-model",
    clock,
    config: { ...CFG, ...over },
  });

describe("pacing, backoff and error classes", () => {
  it("spaces requests by the minimum interval", async () => {
    const clock = new FakeClock();
    const pacer = new RequestPacer(13_000, clock);
    await pacer.wait();
    await pacer.wait();
    await pacer.wait();
    expect(clock.sleeps).toEqual([13_000, 13_000]);
  });

  it("recognises rate-limit and daily-quota errors and the suggested delay", () => {
    expect(classifyApiError(new Error("boom"))).toMatchObject({ quota: false });
    expect(
      classifyApiError({ statusCode: 429, message: "Resource exhausted. Please retry in 21.5s" }),
    ).toEqual({
      quota: true,
      daily: false,
      retryAfterMs: 21_500,
    });
    expect(
      classifyApiError({ statusCode: 429, responseBody: "Quota exceeded for metric ... PerDay" }),
    ).toMatchObject({ quota: true, daily: true });
  });

  it("retries a rate limit after the suggested delay, then succeeds", async () => {
    const clock = new FakeClock();
    let calls = 0;
    const out = await withBackoff(
      async () => {
        calls++;
        if (calls === 1) throw { statusCode: 429, message: "retry in 7s" };
        return "ok";
      },
      { maxRetries: 3, deadlineMs: FAR, clock },
    );
    expect(out).toBe("ok");
    expect(clock.sleeps).toEqual([7000]);
  });

  it("backs off exponentially without a hint, and gives up after maxRetries", async () => {
    const clock = new FakeClock();
    await expect(
      withBackoff(async () => Promise.reject({ statusCode: 429, message: "rate limit" }), {
        maxRetries: 2,
        deadlineMs: FAR,
        clock,
      }),
    ).rejects.toBeInstanceOf(QuotaExhausted);
    expect(clock.sleeps).toEqual([30_000, 60_000]);
  });

  it("stops at once on a spent daily quota and never retries other errors", async () => {
    const clock = new FakeClock();
    await expect(
      withBackoff(async () => Promise.reject({ statusCode: 429, message: "quota PerDay" }), {
        maxRetries: 3,
        deadlineMs: FAR,
        clock,
      }),
    ).rejects.toMatchObject({ daily: true });
    expect(clock.sleeps).toEqual([]);
    let calls = 0;
    await expect(
      withBackoff(async () => (calls++, Promise.reject(new Error("bad request"))), {
        maxRetries: 3,
        deadlineMs: FAR,
        clock,
      }),
    ).rejects.toThrow("bad request");
    expect(calls).toBe(1);
  });

  it("reads limits from the environment with safe defaults", () => {
    expect(extractConfig({})).toEqual({
      perRun: 12,
      dailyLimit: 60,
      minIntervalMs: 13_000,
      maxRetries: 3,
    });
    expect(extractConfig({ EXTRACT_PER_RUN: "5", EXTRACT_DAILY_LIMIT: "x" })).toMatchObject({
      perRun: 5,
      dailyLimit: 60,
    });
  });
});

describe("runExtractStep", () => {
  it("stores verified values with their quotes and applies them, marked as AI", async () => {
    const e = await seed();
    const out = await run(async () => GOOD_REPLY);
    expect(out.stats).toMatchObject({
      requests: 1,
      processed: 1,
      deadlines: 2,
      modes: 1,
      descriptions: 1,
      rejected: 0,
    });

    const rows = await db.select().from(extractions).where(eq(extractions.eventId, e.id));
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.quote.length).toBeGreaterThan(10);
      expect(r.sourceUrl).toBe("https://example.org/cfp");
      expect(r.model).toBe("test-model");
      expect(r.contentHash).toBe(e.cfpHash);
    }
    const dls = await db.select().from(deadlines).where(eq(deadlines.eventId, e.id));
    expect(dls.map((d) => d.source)).toEqual(["ai-cfp", "ai-cfp"]);
    const paper = dls.find((d) => d.kind === "paper")!;
    expect(paper.dueAtUtc.toISOString()).toBe("2026-11-02T11:59:59.000Z");
    expect(paper.comment).toContain("AI-extracted");
    expect(paper.comment).toContain("Paper Submission Deadline: 01 November 2026 (AoE)");

    const [ev] = await db.select().from(events).where(eq(events.id, e.id));
    expect(ev.mode).toBe("hybrid");
    expect(ev.description).toContain("Example Workshop on Robust Learning");
    expect(ev.fieldProvenance).toMatchObject({ mode: "ai-cfp", description: "ai-cfp" });
    expect(ev.aiExtractedHash).toBe(e.cfpHash);
  });

  it("never stores a claim whose quote is not on the page", async () => {
    const e = await seed();
    const lie = JSON.stringify({
      deadlines: [
        {
          kind: "paper",
          label: "x",
          date_text: "05 May 2027",
          iso_date: "2027-05-05",
          time_text: null,
          timezone_text: null,
          quote: "Paper deadline: 05 May 2027",
        },
      ],
      mode: { value: "virtual", quote: "This is a fully virtual workshop." },
      description: null,
    });
    const out = await run(async () => lie);
    expect(out.stats).toMatchObject({ processed: 1, deadlines: 0, modes: 0 });
    expect(out.stats.rejected).toBe(2);
    expect(await db.select().from(extractions)).toHaveLength(0);
    expect(await db.select().from(deadlines)).toHaveLength(0);
    const [ev] = await db.select().from(events).where(eq(events.id, e.id));
    expect(ev.mode).toBeNull();
    expect(ev.aiExtractedHash).toBe(e.cfpHash); // read, nothing trusted
  });

  it("never overrides a deadline or mode that a source provides", async () => {
    const e = await seed({ mode: "in-person" });
    await db.insert(deadlines).values({
      eventId: e.id,
      kind: "paper",
      label: "Paper",
      dueAtUtc: new Date("2026-10-30T12:00:00Z"),
      source: "ccfddl",
    });
    await run(async () => GOOD_REPLY);
    const dls = await db.select().from(deadlines).where(eq(deadlines.eventId, e.id));
    // the source's paper deadline stands alone; only the kind nobody provided is added
    expect(dls.filter((d) => d.kind === "paper").map((d) => d.source)).toEqual(["ccfddl"]);
    expect(dls.filter((d) => d.kind === "notification").map((d) => d.source)).toEqual(["ai-cfp"]);
    const [ev] = await db.select().from(events).where(eq(events.id, e.id));
    expect(ev.mode).toBe("in-person"); // the source's value wins over the page-derived "hybrid"
    expect(ev.fieldProvenance).not.toHaveProperty("mode");
  });

  it("does not re-send an unchanged page, and re-reads (and replaces) a changed one", async () => {
    const e = await seed();
    await run(async () => GOOD_REPLY);
    let calls = 0;
    const again = await run(async () => (calls++, GOOD_REPLY));
    expect(again.stats.requests).toBe(0);
    expect(calls).toBe(0);

    // the page changed: new hash, different notification date
    await db.update(events).set({ cfpHash: "hash-new" }).where(eq(events.id, e.id));
    const moved = JSON.parse(GOOD_REPLY);
    moved.deadlines = [moved.deadlines[0]];
    moved.mode = null;
    const out = await run(async () => JSON.stringify(moved));
    expect(out.stats.requests).toBe(1);
    const dls = await db.select().from(deadlines).where(eq(deadlines.eventId, e.id));
    expect(dls.map((d) => d.kind)).toEqual(["paper"]); // the notification AI row is gone
    const [ev] = await db.select().from(events).where(eq(events.id, e.id));
    expect(ev.mode).toBeNull(); // and so is the AI mode
  });

  it("honours the per-run and the daily request caps", async () => {
    for (let i = 0; i < 5; i++) await seed();
    const first = await run(async () => GOOD_REPLY, { perRun: 2 });
    expect(first.stats.requests).toBe(2);
    // the runner reports requests via source_runs in production; emulate that record
    await db.insert(sourceRuns).values({ source: "extract", ok: true, stats: { requests: 2 } });
    const second = await run(async () => GOOD_REPLY, { perRun: 5, dailyLimit: 3 });
    expect(second.stats.requests).toBe(1);
    await db.insert(sourceRuns).values({ source: "extract", ok: true, stats: { requests: 1 } });
    const third = await run(async () => GOOD_REPLY, { perRun: 5, dailyLimit: 3 });
    expect(third.stats.requests).toBe(0);
    expect(third.warnings[0]).toMatch(/daily request budget used/);
  });

  it("keeps what it finished and stops cleanly when the daily quota runs out", async () => {
    await seed();
    await seed();
    await seed();
    let calls = 0;
    const out = await run(async () => {
      calls++;
      if (calls === 2) throw { statusCode: 429, message: "Quota exceeded ... PerDay" };
      return GOOD_REPLY;
    });
    expect(out.stats).toMatchObject({ processed: 1, quotaHit: 1 });
    expect(out.warnings.join(" ")).toMatch(/daily quota/);
    expect(await db.select().from(extractions)).not.toHaveLength(0);
    expect(calls).toBe(2); // did not hammer the API after the quota error
  });

  it("survives an unreadable reply and keeps going", async () => {
    await seed();
    await seed();
    let calls = 0;
    const out = await run(async () => (++calls === 1 ? "I cannot help with that." : GOOD_REPLY));
    expect(out.stats).toMatchObject({ invalid: 1, processed: 1 });
  });

  it("skips pages that are too short to carry facts", async () => {
    await seed({ cfpText: "Coming soon." });
    const out = await run(async () => GOOD_REPLY);
    expect(out.stats.requests).toBe(0);
  });
});

describe("AI deadlines and the merge", () => {
  const input = (deadlinesIn: { kind: string; at: string }[] = []) => ({
    ...emptyEvent({
      source: "openreview",
      sourceId: "X/2027/Workshop/ExampleWS",
      acronym: "ExampleWS",
      year: 2027,
    }),
    type: "workshop" as const,
    website: "https://example.org",
    deadlines: deadlinesIn.map((d) => ({
      kind: d.kind as never,
      label: d.kind,
      dueAtUtc: d.at,
      originalTz: "UTC",
      originalText: d.at,
      comment: null,
    })),
  });

  it("keeps an AI deadline through a re-merge, and drops it once a source covers that kind", async () => {
    await writeMergedEvents(db, mergeEventInputs([input()]));
    const [ev] = await db.select().from(events);
    await db
      .update(events)
      .set({ cfpText: PAGE, cfpHash: "h", cfpUrl: "https://example.org/cfp" })
      .where(eq(events.id, ev.id));
    await run(async () => GOOD_REPLY);
    expect((await db.select().from(deadlines)).map((d) => `${d.kind}:${d.source}`).sort()).toEqual([
      "notification:ai-cfp",
      "paper:ai-cfp",
    ]);

    // a normal re-merge rewrites deadlines and mode; AI values must still be there
    await writeMergedEvents(db, mergeEventInputs([input()]));
    expect((await db.select().from(deadlines)).map((d) => `${d.kind}:${d.source}`).sort()).toEqual([
      "notification:ai-cfp",
      "paper:ai-cfp",
    ]);
    const [after] = await db.select().from(events);
    expect(after.mode).toBe("hybrid");

    // now a source provides the paper deadline: it wins and the AI duplicate disappears
    await writeMergedEvents(
      db,
      mergeEventInputs([input([{ kind: "paper", at: "2026-10-30T00:00:00.000Z" }])]),
    );
    expect((await db.select().from(deadlines)).map((d) => `${d.kind}:${d.source}`).sort()).toEqual([
      "notification:ai-cfp",
      "paper:openreview",
    ]);
  });

  it("applyExtractions is idempotent", async () => {
    const e = await seed();
    await run(async () => GOOD_REPLY);
    const before = (await db.select().from(deadlines).where(eq(deadlines.eventId, e.id))).length;
    await applyExtractions(db);
    await applyExtractions(db);
    expect((await db.select().from(deadlines).where(eq(deadlines.eventId, e.id))).length).toBe(
      before,
    );
  });
});
