import { describe, expect, it } from "vitest";
import { cleanAcronym, decodeEntities, dedupeKeyFor, normalizeUrl, seriesKeyFor } from "./keys";

describe("cleanAcronym", () => {
  // Real WikiCFP titles (left of " : ").
  it.each([
    ["AAIP--EI 2027", "AAIP"],
    ["ACM--CFP--RobCE 2027", "RobCE"],
    ["Springer--AIVR 2027", "AIVR"],
    ["ALTA 2026 2026", "ALTA"],
    ["ALTA  2026", "ALTA"],
    ["AI4HR&amp;amp;PES 2026", "AI4HR&PES"],
    ["ACM MLCI 2027", "ACM MLCI"],
    ["NeurIPS", "NeurIPS"],
  ])("%s → %s", (raw, clean) => {
    expect(cleanAcronym(raw)).toBe(clean);
  });
});

describe("seriesKeyFor / dedupeKeyFor", () => {
  it("unifies spellings across sources", () => {
    expect(seriesKeyFor("NeurIPS")).toBe("neurips");
    expect(seriesKeyFor("NIPS")).toBe("neurips");
    expect(seriesKeyFor("SIGKDD")).toBe("kdd");
    expect(seriesKeyFor("KDD")).toBe("kdd");
    expect(seriesKeyFor("IEEE CEC")).toBe("cec");
    expect(seriesKeyFor("ACM MM")).toBe("acm-mm");
    expect(seriesKeyFor("IJCNLP-AACL")).toBe("ijcnlp");
    expect(seriesKeyFor("RuleML+RR")).toBe("ruleml-rr");
    expect(seriesKeyFor("AAIP--EI 2027")).toBe(seriesKeyFor("AAIP 2027"));
  });

  it("builds acronym-year keys", () => {
    expect(dedupeKeyFor("ICML", 2026)).toBe("icml-2026");
    expect(dedupeKeyFor("EMNLP (Industry Track)", 2025)).toBe("emnlp-industry-track-2025");
  });
});

describe("decodeEntities / normalizeUrl", () => {
  it("decodes double-escaped entities", () => {
    expect(decodeEntities("Data Science &amp;amp; ML")).toBe("Data Science & ML");
  });

  it("normalizes URLs and rejects non-http", () => {
    expect(normalizeUrl("icml.cc/Conferences/2026")).toBe("https://icml.cc/Conferences/2026");
    expect(normalizeUrl("https://x.org/a#frag")).toBe("https://x.org/a");
    expect(normalizeUrl("mailto:a@b.c")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
  });
});
