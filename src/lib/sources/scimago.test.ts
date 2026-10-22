import { describe, expect, it } from "vitest";
import {
  formatIssn,
  indexByIssn,
  matchSjr,
  normalizeIssn,
  parseDelimited,
  parseScimagoCsv,
  SJR_CREDIT,
} from "./scimago";
import { fixture } from "./test-utils";

// NOTE: sample-synthetic.csv is made up for tests (real SCImago column layout, invented numbers).
const csv = () => fixture("scimago", "sample-synthetic.csv");

describe("SCImago CSV", () => {
  it("parses semicolons, quotes (including doubled quotes) and newlines", () => {
    const rows = parseDelimited('a;"b;c";"say ""hi"""\n1;2;3\r\n');
    expect(rows).toEqual([
      ["a", "b;c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("reads decimal commas, quartiles, ISSN lists and the data year", () => {
    const recs = parseScimagoCsv(csv());
    expect(recs).toHaveLength(6);
    const jmlr = recs[0];
    expect(jmlr.title).toBe("Journal of Machine Learning Research");
    expect(jmlr.sjr).toBe(2.5);
    expect(jmlr.quartile).toBe("Q1");
    expect(jmlr.issns).toEqual(["15337928", "15324435"]);
    expect(jmlr.hIndex).toBe(300);
    expect(jmlr.year).toBe(2024);
    expect(recs[2].title).toBe('Machine Learning; A Synthetic "Quoted" Title');
  });

  it("treats '-' as no quartile and a missing ISSN as no ISSNs", () => {
    const recs = parseScimagoCsv(csv());
    expect(recs[3].quartile).toBeNull();
    expect(recs[3].sjr).toBe(0.15);
    expect(recs[4].issns).toEqual([]);
  });

  it("rejects a file that is not a SCImago journal export", () => {
    expect(() => parseScimagoCsv("name,age\nx,1\n")).toThrow(/SCImago/);
  });

  it("normalizes ISSNs", () => {
    expect(normalizeIssn("1532-4435")).toBe("15324435");
    expect(normalizeIssn("ISSN 1879-2782")).toBe("18792782");
    expect(normalizeIssn("0893-608x")).toBe("0893608X");
    expect(normalizeIssn("12345")).toBeNull();
    expect(normalizeIssn(null)).toBeNull();
    expect(formatIssn("15324435")).toBe("1532-4435");
  });

  it("matches by print or online ISSN and prefers the better-ranked duplicate", () => {
    const idx = indexByIssn(parseScimagoCsv(csv()));
    // 15324435 is listed twice (rank 1 and rank 900): the better rank wins.
    expect(matchSjr(["1532-4435"], idx)?.quartile).toBe("Q1");
    expect(matchSjr([null, "1879-2782"], idx)?.title).toBe("Neural Networks");
    expect(matchSjr(["0000-0000", undefined], idx)).toBeNull();
  });

  it("carries the exact attribution text", () => {
    expect(SJR_CREDIT).toBe("Data: SCImago Journal & Country Rank, source Scopus®");
  });
});
