import { describe, expect, it } from "vitest";
import { normalizeConferenceFile } from "@/lib/sources/ccfddl";
import { normalizeHfFile } from "@/lib/sources/huggingface";
import { normalizeConference, normalizeWorkshop, type OrGroup } from "@/lib/sources/openreview";
import { fixture } from "@/lib/sources/test-utils";
import { mergeEventInputs } from "./merge";

/**
 * Regression: flagship conferences must survive normalize → merge as type "conference" with
 * deadlines, even when OpenReview also lists dozens of their workshops (all real upstream files).
 */
const ccf = (f: string) => normalizeConferenceFile(fixture("ccfddl", f), `conference/AI/${f}`);
const hf = (f: string) => normalizeHfFile(fixture("huggingface", f), `src/data/conferences/${f}`);
const groups = (name: string) =>
  (JSON.parse(fixture("openreview", name)) as { groups: OrGroup[] }).groups;

const NEURIPS = { series: "neurips", label: "NeurIPS" };
const ICML = { series: "icml", label: "ICML" };

const inputs = [
  ...ccf("conference__AI__icml.yml"),
  ...hf("icml.yml"),
  ...ccf("conference__AI__nips.yml"),
  ...hf("neurips.yml"),
  ...ccf("conference__AI__iclr.yml"),
  ...hf("iclr.yml"),
  ...ccf("conference__AI__uai.yml"),
  ...hf("uai.yml"),
  ...groups("iclr-2027-conference.json").map((g) =>
    normalizeConference(g, { series: "iclr", label: "ICLR" }, null)!,
  ),
  ...groups("neurips-2026-workshops.json").flatMap(
    (g) => normalizeWorkshop(g, NEURIPS, null) ?? [],
  ),
  ...groups("icml-2026-workshops.json").flatMap((g) => normalizeWorkshop(g, ICML, null) ?? []),
];
const merged = new Map(mergeEventInputs(inputs).map((m) => [m.dedupeKey, m]));

describe("conference type regression (real ICML, NeurIPS, ICLR data)", () => {
  it.each(["icml-2026", "neurips-2026", "iclr-2026", "iclr-2027"])(
    "%s is a conference with submission deadlines",
    (key) => {
      const e = merged.get(key);
      expect(e, key).toBeDefined();
      expect(e!.type).toBe("conference");
      expect(e!.parentKey).toBeNull();
      expect(e!.deadlines.some((d) => d.kind === "paper")).toBe(true);
    },
  );

  it("every ccfddl and Hugging Face input normalizes to a conference", () => {
    const fromFiles = inputs.filter((i) => i.source === "ccfddl" || i.source === "huggingface");
    expect(fromFiles.length).toBeGreaterThan(30);
    expect(fromFiles.every((i) => i.type === "conference")).toBe(true);
  });

  it("workshops keep their own keys and never absorb the parent conference", () => {
    const workshops = [...merged.values()].filter((m) => m.type === "workshop");
    const workshopKeys = new Set(
      inputs.filter((i) => i.type === "workshop").map((i) => `${i.acronym}-${i.year}`),
    );
    expect(workshops.length).toBe(workshopKeys.size);
    expect(workshops.length).toBeGreaterThan(0);
    for (const w of workshops) {
      expect(["icml-2026", "neurips-2026", "iclr-2027"]).not.toContain(w.dedupeKey);
      expect(w.parentKey).toMatch(/^(icml|neurips)-2026$/);
    }
  });

  it("uses one display acronym per series across sources", () => {
    const kdd = mergeEventInputs([
      ...normalizeConferenceFile(
        fixture("ccfddl", "conference__DB__sigkdd.yml"),
        "conference/DB/sigkdd.yml",
      ),
      ...hf("kdd.yml"),
    ]).filter((m) => m.seriesKey === "kdd");
    // ccfddl says "SIGKDD", Hugging Face says "KDD": every edition shows the trusted spelling.
    expect(kdd.length).toBeGreaterThan(3);
    expect(new Set(kdd.map((m) => m.acronym))).toEqual(new Set(["KDD"]));
    expect(merged.get("neurips-2026")!.acronym).toBe(merged.get("neurips-2021")!.acronym);
  });

  it("takes dates from the source whose start year matches the edition (UAI 2026)", () => {
    // Hugging Face's uai26 entry still carries "August 17-21, 2025"; ccfddl has the 2026 dates.
    const uai = merged.get("uai-2026")!;
    expect(uai.startDate?.startsWith("2026")).toBe(true);
    expect(uai.provenance.startDate).toBe("ccfddl");
  });
});
