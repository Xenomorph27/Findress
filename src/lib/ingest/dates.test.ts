import { describe, expect, it } from "vitest";
import { parseDateRange, parseSingleDate } from "./dates";

// Real `date:` strings from ccfddl / HF ai-deadlines / WikiCFP.
describe("parseDateRange", () => {
  it.each([
    ["July 13-19, 2025", "2025-07-13", "2025-07-19"],
    ["June 30 - July 3, 2026", "2026-06-30", "2026-07-03"],
    ["November 30-December 1, 2026", "2026-11-30", "2026-12-01"],
    ["Nov 6-10, 2026", "2026-11-06", "2026-11-10"],
    ["July 5, 2026", "2026-07-05", "2026-07-05"],
    ["November 02-04, 2026", "2026-11-02", "2026-11-04"],
    ["March 30 - April 01, 2026", "2026-03-30", "2026-04-01"],
    ["August 7-13 and August 15-17, 2027", "2027-08-07", "2027-08-17"],
    ["December 8-10 (Sydney), December 9-11 (Atlanta and Paris), 2026", "2026-12-08", "2026-12-11"],
    ["December 3-5 (San Diego and Mexico City), 2025", "2025-12-03", "2025-12-05"],
    ["March, 24-28, 2025", "2025-03-24", "2025-03-28"],
    ["Jan 4 - 8, 2027", "2027-01-04", "2027-01-08"],
    ["Dec 14, 2026 - Dec 17, 2026", "2026-12-14", "2026-12-17"],
    ["Dec 30, 2026 - Jan 2, 2027", "2026-12-30", "2027-01-02"],
    ["Sept 1-4, 2026", "2026-09-01", "2026-09-04"],
  ])("%s", (text, start, end) => {
    expect(parseDateRange(text)).toEqual({ start, end });
  });

  it("returns null for TBD / unparseable", () => {
    expect(parseDateRange("TBD")).toBeNull();
    expect(parseDateRange("N/A")).toBeNull();
    expect(parseDateRange("")).toBeNull();
    expect(parseDateRange("sometime next summer")).toBeNull();
  });

  it("uses a fallback year when the text has none", () => {
    expect(parseDateRange("June 3-7", 2027)).toEqual({ start: "2027-06-03", end: "2027-06-07" });
  });
});

describe("parseSingleDate", () => {
  it("parses ISO timestamps and month-name dates", () => {
    expect(parseSingleDate("2026-10-26T00:00:00")).toBe("2026-10-26");
    expect(parseSingleDate("Oct 26, 2026")).toBe("2026-10-26");
    expect(parseSingleDate("2026-02-30")).toBeNull();
  });
});
