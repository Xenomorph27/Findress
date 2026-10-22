import { describe, expect, it } from "vitest";
import { EventInputSchema } from "@/lib/ingest/types";
import {
  disambiguate,
  normalizeConference,
  OPENREVIEW_VENUES,
  openreviewAdapter,
  sweepNextCursor,
  sweepStart,
  normalizeWorkshop,
  parseOrDateTime,
  type OrGroup,
} from "./openreview";
import { fixture } from "./test-utils";

const groups = (name: string) =>
  (JSON.parse(fixture("openreview", name)) as { groups: OrGroup[] }).groups;
const NEURIPS = { series: "neurips", label: "NeurIPS" };

describe("OpenReview", () => {
  it("parses the submission deadline text", () => {
    expect(parseOrDateTime("Sep 05 2026 11:59AM UTC-0")).toEqual({
      local: "2026-09-05 11:59",
      tz: "UTC-0",
    });
    expect(parseOrDateTime("May 23 2026 04:59PM UTC-0")).toEqual({
      local: "2026-05-23 16:59",
      tz: "UTC-0",
    });
    expect(parseOrDateTime("Mar 24 2026 12:00AM UTC-0")).toEqual({
      local: "2026-03-24 00:00",
      tz: "UTC-0",
    });
  });

  it("normalizes a workshop with a deadline in content.date (Simbiochem)", () => {
    const g = groups("neurips-2026-workshops.json").find((x) => x.id.endsWith("/Simbiochem"))!;
    const e = normalizeWorkshop(g, NEURIPS, null)!;
    expect(EventInputSchema.safeParse(e).success).toBe(true);
    expect(e).toMatchObject({
      acronym: "Simbiochem",
      year: 2026,
      type: "workshop",
      parentKey: "neurips-2026",
      city: "Sydney",
      countryCode: "AU",
      startDate: "2026-12-11",
      submissionSite: "https://openreview.net/group?id=NeurIPS.cc/2026/Workshop/Simbiochem",
    });
    expect(e.deadlines[0].dueAtUtc).toBe("2026-09-05T11:59:00.000Z");
  });

  it("falls back to the invitation duedate (OPT, real invitation)", () => {
    const g = groups("neurips-2026-workshops.json").find((x) => x.id.endsWith("/OPT"))!;
    const inv = JSON.parse(fixture("openreview", "invitation-opt.json")).invitations[0];
    const e = normalizeWorkshop(g, NEURIPS, inv.duedate)!;
    expect(e.deadlines[0].dueAtUtc).toBe("2026-09-05T12:00:00.000Z");
    expect(e.startDate).toMatch(/^2026-12-/);
    const none = normalizeWorkshop(g, NEURIPS, null)!;
    expect(none.deadlines).toEqual([]);
  });

  it("strips the venue prefix from workshop titles", () => {
    const g = groups("icml-2026-workshops.json").find((x) => x.id.endsWith("/TAIGR"))!;
    const e = normalizeWorkshop(g, { series: "icml", label: "ICML" }, null)!;
    expect(e.parentKey).toBe("icml-2026");
    expect(e.name).not.toMatch(/^ICML 2026 Workshop/);
  });

  it("normalizes the main conference group (ICLR 2027)", () => {
    const g = groups("iclr-2027-conference.json")[0];
    const e = normalizeConference(g, { series: "iclr", label: "ICLR" }, null)!;
    expect(e).toMatchObject({
      acronym: "ICLR",
      year: 2027,
      city: "San Francisco",
      countryCode: "US",
    });
  });

  it("disambiguates identical workshop acronyms under different parents", () => {
    const g = groups("neurips-2026-workshops.json").find((x) => x.id.endsWith("/OPT"))!;
    const a = normalizeWorkshop(g, NEURIPS, null)!;
    const b = { ...a, sourceId: "ICML.cc/2026/Workshop/OPT", parentKey: "icml-2026" };
    const out = disambiguate([a, b]);
    expect(out.map((e) => e.acronym)).toEqual(["OPT@NEURIPS", "OPT@ICML"]);
  });
  it("keeps a workshop's name stable when a run lists only one of two same-named workshops", () => {
    const g = groups("neurips-2026-workshops.json").find((x) => x.id.endsWith("/OPT"))!;
    const neurips = normalizeWorkshop(g, NEURIPS, null)!;
    const icml = { ...neurips, sourceId: "ICML.cc/2026/Workshop/OPT", parentKey: "icml-2026" };
    // Earlier full run stored both, suffixed.
    const previous = new Map([
      [neurips.sourceId, { ...neurips, acronym: "OPT@NEURIPS" }],
      [icml.sourceId, { ...icml, acronym: "OPT@ICML" }],
    ]);
    // A budget-truncated run sees only the ICML one: it must keep "@ICML".
    expect(disambiguate([icml], previous).map((e) => e.acronym)).toEqual(["OPT@ICML"]);
    // Even without the sibling in `previous`, a workshop that was suffixed stays suffixed.
    const solo = new Map([[icml.sourceId, { ...icml, acronym: "OPT@ICML" }]]);
    expect(disambiguate([icml], solo).map((e) => e.acronym)).toEqual(["OPT@ICML"]);
    // A new workshop whose name is already taken by an unlisted stored one is suffixed too.
    const taken = new Map([[neurips.sourceId, { ...neurips, acronym: "OPT@NEURIPS" }]]);
    expect(disambiguate([icml], taken).map((e) => e.acronym)).toEqual(["OPT@ICML"]);
    // A genuinely unique workshop is left alone.
    expect(disambiguate([icml]).map((e) => e.acronym)).toEqual(["OPT"]);
  });
});

describe("OpenReview resumable sweep", () => {
  it("starts where the last run stopped and wraps around", () => {
    expect(sweepStart(20, null)).toBe(0);
    expect(sweepStart(20, "7")).toBe(7);
    expect(sweepStart(20, "27")).toBe(7);
    expect(sweepStart(20, "garbage")).toBe(0);
    expect(sweepNextCursor(20, 7, 6)).toBe("13");
    expect(sweepNextCursor(20, 17, 6)).toBe("3");
    expect(sweepNextCursor(20, 7, 20)).toBe("7");
  });

  it("visits every task within ceil(total / perRun) runs, however the budget cuts each run", () => {
    const total = 20;
    const perRun = 6;
    const seen = new Set<number>();
    let cursor: string | null = null;
    let runs = 0;
    while (seen.size < total && runs < 10) {
      const from = sweepStart(total, cursor);
      for (let n = 0; n < perRun; n++) seen.add((from + n) % total);
      cursor = sweepNextCursor(total, from, perRun);
      runs++;
    }
    expect(seen.size).toBe(total);
    expect(runs).toBe(Math.ceil(total / perRun));
  });

  const ctx = (over: Partial<Parameters<typeof openreviewAdapter.run>[0]>) =>
    ({
      fetcher: { getJson: async () => ({ groups: [] }) },
      deadlineMs: Date.now() + 60_000,
      now: new Date("2026-10-22T00:00:00Z"),
      log: () => {},
      previous: new Map(),
      cursor: null,
      env: {},
      ...over,
    }) as Parameters<typeof openreviewAdapter.run>[0];

  it("finishes a whole sweep when there is time, and may then prune", async () => {
    const out = await openreviewAdapter.run(ctx({}));
    expect(out.stats.venueYearsDone).toBe(OPENREVIEW_VENUES.length * 2);
    expect(out.nextCursor).toBe("0");
    expect(out.warnings).toEqual([]);
  });

  it("stops at the budget, keeps its place, warns where it resumes and never prunes", async () => {
    const out = await openreviewAdapter.run(ctx({ cursor: "7", deadlineMs: Date.now() - 1 }));
    expect(out.stats.venueYearsDone).toBe(0);
    expect(out.nextCursor).toBe("7");
    expect(out.pruneStale).toBe(false);
    expect(out.warnings[0]).toMatch(/resumes at/);
  });
});
