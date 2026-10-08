import { describe, expect, it } from "vitest";
import { normalizeConferenceFile } from "@/lib/sources/ccfddl";
import { normalizeHfFile } from "@/lib/sources/huggingface";
import { fixture } from "@/lib/sources/test-utils";
import { mergeEventInputs } from "./merge";
import { emptyEvent } from "./types";

const ccf = (f: string) => normalizeConferenceFile(fixture("ccfddl", f), `conference/AI/${f}`);
const hf = (f: string) => normalizeHfFile(fixture("huggingface", f), `src/data/conferences/${f}`);

describe("mergeEventInputs (real ccfddl + Hugging Face data)", () => {
  const merged = mergeEventInputs([
    ...ccf("conference__AI__icml.yml"),
    ...hf("icml.yml"),
    ...ccf("conference__AI__nips.yml"),
    ...hf("neurips.yml"),
  ]);
  const byKey = new Map(merged.map((m) => [m.dedupeKey, m]));

  it("dedupes by acronym + year across sources (NeurIPS = nips.yml + neurips.yml)", () => {
    const n26 = byKey.get("neurips-2026")!;
    expect(n26.sources.sort()).toEqual(["ccfddl", "huggingface"]);
    expect(n26.refs).toHaveLength(2);
    expect(merged.filter((m) => m.dedupeKey === "icml-2026")).toHaveLength(1);
  });

  it("takes each field from the most trusted source and records provenance", () => {
    const i26 = byKey.get("icml-2026")!;
    // Ranks: HF has them too (priority 1); full timeline from HF (5 milestones).
    expect(i26.provenance.rankCore).toBe("huggingface");
    expect(i26.provenance["deadline:paper"]).toBe("huggingface");
    expect(i26.deadlines.map((d) => d.kind)).toContain("notification");
    // ccfddl-only years still merge fine.
    const i21 = byKey.get("icml-2021")!;
    expect(i21.sources).toEqual(["ccfddl"]);
    expect(i21.provenance.startDate).toBe("ccfddl");
  });

  it("keeps deadlines sorted chronologically", () => {
    const d = byKey.get("neurips-2026")!.deadlines.map((x) => x.dueAtUtc);
    expect([...d].sort()).toEqual(d);
  });
});

describe("merge priority rules", () => {
  // Synthetic inputs (logic test): WikiCFP posted a placeholder deadline; HF has the real one.
  const wikicfp = {
    ...emptyEvent({ source: "wikicfp", sourceId: "201213", acronym: "ACL", year: 2027 }),
    city: "Somewhere",
    countryCode: "JP",
    country: "Japan",
    deadlines: [
      {
        kind: "paper" as const,
        label: "Submission Deadline",
        dueAtUtc: "2027-01-02T11:59:59.000Z",
        originalTz: null,
        originalText: "2027-01-01",
        comment: null,
      },
      {
        kind: "notification" as const,
        label: "Notification Due",
        dueAtUtc: "2027-04-01T11:59:59.000Z",
        originalTz: null,
        originalText: "2027-04-01",
        comment: null,
      },
    ],
  };
  const hfItem = {
    ...emptyEvent({ source: "huggingface", sourceId: "acl27", acronym: "ACL", year: 2027 }),
    name: "Annual Meeting of the ACL",
    deadlines: [
      {
        kind: "paper" as const,
        label: "Paper",
        dueAtUtc: "2027-02-15T11:59:59.000Z",
        originalTz: "AoE",
        originalText: "2027-02-15 23:59:59",
        comment: null,
      },
    ],
  };

  it("lets the trusted source win per deadline kind but keeps kinds only others know", () => {
    const [m] = mergeEventInputs([wikicfp, hfItem]);
    expect(m.deadlines.find((d) => d.kind === "paper")?.source).toBe("huggingface");
    expect(m.deadlines.find((d) => d.kind === "notification")?.source).toBe("wikicfp");
    expect(m.deadlines.filter((d) => d.kind === "paper")).toHaveLength(1);
  });

  it("takes location as a unit from the first source that has one", () => {
    const [m] = mergeEventInputs([wikicfp, hfItem]);
    expect(m.city).toBe("Somewhere");
    expect(m.provenance.city).toBe("wikicfp");
    expect(m.name).toBe("Annual Meeting of the ACL");
  });
});
