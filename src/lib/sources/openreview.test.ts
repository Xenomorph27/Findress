import { describe, expect, it } from "vitest";
import { EventInputSchema } from "@/lib/ingest/types";
import {
  disambiguate,
  normalizeConference,
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
});
