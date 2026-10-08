import { describe, expect, it } from "vitest";
import { EventInputSchema } from "@/lib/ingest/types";
import { mapDeadlineType, normalizeHfFile, parseRankings } from "./huggingface";
import { fixture } from "./test-utils";

const load = (name: string) =>
  normalizeHfFile(fixture("huggingface", `${name}.yml`), `x/${name}.yml`);

describe("huggingface normalize", () => {
  it("maps the full milestone list (ICML 2026)", () => {
    const e = load("icml").find((x) => x.year === 2026)!;
    expect(EventInputSchema.safeParse(e).success).toBe(true);
    expect(e).toMatchObject({
      acronym: "ICML",
      rankCcf: "A",
      rankCore: "A*",
      city: "Seoul",
      countryCode: "KR",
      startDate: "2026-07-06",
      endDate: "2026-07-11",
    });
    expect(e.deadlines.map((d) => d.kind)).toEqual([
      "abstract",
      "paper",
      "other",
      "rebuttal",
      "notification",
    ]);
    // Cross-source agreement: same instant as ccfddl's "2026-01-24 11:59:59 UTC+0".
    expect(e.deadlines[0].dueAtUtc).toBe("2026-01-24T11:59:59.000Z");
    expect(e.deadlines[0].originalTz).toBe("AoE");
  });

  it("handles the legacy flat format and a wrong `country` (CVPR 2025: 'Tennessee')", () => {
    const cvpr = load("cvpr");
    const c25 = cvpr.find((x) => x.year === 2025)!;
    expect(c25.deadlines.find((d) => d.kind === "paper")?.originalTz).toBe("UTC-8");
    expect(c25.deadlines.find((d) => d.kind === "abstract")).toBeDefined();
    expect(c25.countryCode).toBe("US");
    expect(c25.city).toBe("Nashville");
    // CVPR 2027: deadlines not announced → no deadlines, never invented.
    const c27 = cvpr.find((x) => x.year === 2027)!;
    expect(c27.deadlines).toEqual([]);
    expect(c27.description).toBe("Submission deadlines to be announced.");
  });

  it("keeps IANA zones and 'submission' type (3DV, MathAI)", () => {
    const d3 = load("3dv")[0];
    expect(d3.deadlines[0]).toMatchObject({ kind: "paper", originalTz: "UTC-7" });
    expect(d3.deadlines[0].dueAtUtc).toBe("2026-08-28T18:00:00.000Z");
    const m = load("mathai").find((x) => x.year === 2026)!;
    expect(m.deadlines[0].originalTz).toBe("Europe/London");
    expect(m.submissionSite).toMatch(/^https:\/\/openreview\.net\/group/);
  });

  it("treats tracks as child events of the main conference", () => {
    const t = load("emnlp_industry_track")[0];
    expect(t.acronym).toBe("EMNLP (Industry Track)");
    expect(t.parentKey).toBe("emnlp-2025");
  });

  it("maps deadline types and rankings", () => {
    expect(mapDeadlineType("submission")).toBe("paper");
    expect(mapDeadlineType("rebuttal_start")).toBe("rebuttal");
    expect(mapDeadlineType("camera-ready")).toBe("camera_ready");
    expect(mapDeadlineType("review_release")).toBe("other");
    expect(parseRankings("CCF: N, CORE: B, THCPL: N")).toEqual({ ccf: null, core: "B" });
    expect(parseRankings("CCF: , CORE: , THCPL: ")).toEqual({ ccf: null, core: null });
  });
});
