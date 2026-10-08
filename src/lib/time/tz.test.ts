import { describe, expect, it } from "vitest";
import { describeZone, parseZone, wallClockToUtc } from "./tz";

describe("parseZone", () => {
  it.each([
    ["AoE", -720],
    ["aoe", -720],
    ["Anywhere on Earth", -720],
    ["UTC-12", -720],
    ["UTC+0", 0],
    ["UTC-0", 0],
    ["UTC", 0],
    ["GMT+8", 480],
    ["UTC+5:30", 330],
    ["UTC+05:30", 330],
    ["UTC−7", -420],
    ["PST", -480],
    ["PDT", -420],
  ])("%s → %i minutes", (tz, minutes) => {
    expect(parseZone(tz)).toEqual({ kind: "offset", minutes });
  });

  it("accepts IANA zones", () => {
    expect(parseZone("Europe/London")).toEqual({ kind: "iana", zone: "Europe/London" });
  });

  it("rejects ambiguous or garbage zones", () => {
    expect(parseZone("CST")).toBeNull();
    expect(parseZone("IST")).toBeNull();
    expect(parseZone("Mars/Olympus")).toBeNull();
    expect(parseZone("")).toBeNull();
    expect(parseZone(null)).toBeNull();
    expect(parseZone("UTC+19")).toBeNull();
  });
});

describe("wallClockToUtc", () => {
  it("converts AoE to UTC (+12h)", () => {
    const r = wallClockToUtc("2026-01-28 23:59:59", "AoE");
    expect(r?.utc.toISOString()).toBe("2026-01-29T11:59:59.000Z");
    expect(r?.zoneAssumed).toBe(false);
    expect(r?.timeAssumed).toBe(false);
  });

  it("agrees across sources: ICML 2026 abstract (HF AoE vs ccfddl UTC+0)", () => {
    // Real upstream values: huggingface ai-deadlines vs ccfddl/ccf-deadlines (fetched 2026-10).
    const hf = wallClockToUtc("2026-01-23 23:59:59", "AoE");
    const ccf = wallClockToUtc("2026-01-24 11:59:59", "UTC+0");
    expect(hf?.utc.getTime()).toBe(ccf?.utc.getTime());
  });

  it("handles positive offsets", () => {
    expect(wallClockToUtc("2026-03-01 12:00:00", "UTC+8")?.utc.toISOString()).toBe(
      "2026-03-01T04:00:00.000Z",
    );
  });

  it("handles IANA zones including DST", () => {
    // London is UTC+0 in February, UTC+1 in June.
    expect(wallClockToUtc("2026-02-17 23:59:59", "Europe/London")?.utc.toISOString()).toBe(
      "2026-02-17T23:59:59.000Z",
    );
    expect(wallClockToUtc("2026-06-17 23:59:59", "Europe/London")?.utc.toISOString()).toBe(
      "2026-06-17T22:59:59.000Z",
    );
  });

  it("treats date-only values as end of day and flags it", () => {
    const r = wallClockToUtc("2026-10-26", "AoE");
    expect(r?.utc.toISOString()).toBe("2026-10-27T11:59:59.000Z");
    expect(r?.timeAssumed).toBe(true);
  });

  it("falls back to AoE when the zone is missing and flags it", () => {
    const r = wallClockToUtc("2026-10-26", null);
    expect(r?.utc.toISOString()).toBe("2026-10-27T11:59:59.000Z");
    expect(r?.zoneAssumed).toBe(true);
  });

  it("accepts minutes without seconds and ISO 'T' separators", () => {
    expect(wallClockToUtc("2026-05-05T11:59", "UTC+0")?.utc.toISOString()).toBe(
      "2026-05-05T11:59:00.000Z",
    );
  });

  it("rejects malformed values", () => {
    expect(wallClockToUtc("TBD", "AoE")).toBeNull();
    expect(wallClockToUtc("2026-13-01", "AoE")).toBeNull();
    expect(wallClockToUtc("2026-01-01 25:00", "AoE")).toBeNull();
  });
});

describe("describeZone", () => {
  it("labels zones for display", () => {
    expect(describeZone("AoE")).toBe("AoE (UTC−12)");
    expect(describeZone("UTC+5:30")).toBe("UTC+5:30");
    expect(describeZone("UTC-12")).toBe("UTC−12");
    expect(describeZone("Europe/London")).toBe("Europe/London");
    expect(describeZone(null)).toBe("timezone not stated");
  });
});
