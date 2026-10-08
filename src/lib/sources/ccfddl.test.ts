import { describe, expect, it } from "vitest";
import { EventInputSchema } from "@/lib/ingest/types";
import { normalizeAcceptRates, normalizeConferenceFile, selectPaths } from "./ccfddl";
import { fixture } from "./test-utils";

describe("ccfddl normalize", () => {
  const icml = normalizeConferenceFile(
    fixture("ccfddl", "conference__AI__icml.yml"),
    "conference/AI/icml.yml",
  );

  it("emits one valid event per edition", () => {
    expect(icml.map((e) => e.year)).toEqual([2021, 2022, 2023, 2024, 2025, 2026]);
    for (const e of icml) expect(EventInputSchema.safeParse(e).success).toBe(true);
  });

  it("maps ICML 2026 fields from the real file", () => {
    const e = icml.find((x) => x.year === 2026)!;
    expect(e).toMatchObject({
      source: "ccfddl",
      sourceId: "icml26",
      acronym: "ICML",
      name: "International Conference on Machine Learning",
      rankCcf: "A",
      rankCore: "A*",
      city: "Seoul",
      countryCode: "KR",
      startDate: "2026-07-06",
      endDate: "2026-07-11",
      website: "https://icml.cc/Conferences/2026",
    });
    const abstract = e.deadlines.find((d) => d.kind === "abstract")!;
    const paper = e.deadlines.find((d) => d.kind === "paper")!;
    expect(abstract.dueAtUtc).toBe("2026-01-24T11:59:59.000Z");
    expect(paper.dueAtUtc).toBe("2026-01-29T11:59:59.000Z");
    expect(paper.originalTz).toBe("UTC+0");
    expect(paper.comment).toMatch(/OpenReview/);
  });

  it("handles AoE, multi-city dates and rebuttal/decision deadlines", () => {
    const nips = normalizeConferenceFile(fixture("ccfddl", "conference__AI__nips.yml"), "x");
    const n25 = nips.find((e) => e.year === 2025)!;
    expect(n25.acronym).toBe("NeurIPS");
    expect(n25.deadlines.find((d) => d.kind === "paper")?.dueAtUtc).toBe(
      "2025-05-16T11:59:59.000Z",
    );
    const n26 = nips.find((e) => e.year === 2026)!;
    expect(n26.startDate).toBe("2026-12-08");
    expect(n26.endDate).toBe("2026-12-11");
    expect(n26.city).toBe("Sydney");

    const aaai = normalizeConferenceFile(fixture("ccfddl", "conference__AI__aaai.yml"), "x");
    const a27 = aaai.find((e) => e.year === 2027)!;
    expect(a27.deadlines.map((d) => d.kind).sort()).toEqual(
      ["abstract", "notification", "paper", "rebuttal"].sort(),
    );
    expect(a27.countryCode).toBe("CA");
  });

  it("parses acceptance rates", () => {
    const rates = normalizeAcceptRates(fixture("ccfddl", "accept_rates__AI__icml.yml"));
    expect(rates.find((r) => r.year === 2024)).toMatchObject({
      seriesKey: "icml",
      submitted: 9473,
      accepted: 2609,
    });
    const nips = normalizeAcceptRates(fixture("ccfddl", "accept_rates__AI__nips.yml"));
    expect(nips.every((r) => r.seriesKey === "neurips")).toBe(true);
  });

  it("selects AI files plus AI-relevant venues elsewhere", () => {
    const { conferences, acceptRates } = selectPaths([
      "conference/AI/icml.yml",
      "conference/DB/sigkdd.yml",
      "conference/DB/sigmod.yml",
      "conference/CG/icassp.yml",
      "accept_rates/AI/icml.yml",
      "conference/types.yml",
    ]);
    expect(conferences).toEqual([
      "conference/AI/icml.yml",
      "conference/DB/sigkdd.yml",
      "conference/CG/icassp.yml",
    ]);
    expect(acceptRates).toEqual(["accept_rates/AI/icml.yml"]);
  });
});
