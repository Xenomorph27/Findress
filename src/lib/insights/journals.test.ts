import { describe, expect, it } from "vitest";
import type { JournalListRow, SpecialIssueListRow } from "@/lib/data/types";
import { buildJournalSystemPrompt } from "@/lib/ai/context";
import { computeSlice } from "./compute";
import { computeJournalInsights } from "./journals";

const NOW = Date.UTC(2026, 9, 9, 12);
const DAY = 86_400_000;

// Synthetic rows for logic tests (not presented as real journal data).
const j = (p: Partial<JournalListRow> & { slug: string }): JournalListRow => ({
  id: Math.floor(Math.random() * 1e6),
  abbreviation: p.slug.toUpperCase(),
  name: p.slug,
  publisher: null,
  openAccess: null,
  apcUsd: null,
  hIndex: null,
  twoYrMeanCitedness: null,
  worksCount: null,
  rankCoreJournal: null,
  rankCcf: null,
  sjrQuartile: null,
  subfields: ["ml"],
  topics: [],
  nextCall: null,
  openCalls: 0,
  ...p,
});
const si = (id: number, at: number | null, subfields = ["ml"]): SpecialIssueListRow => ({
  id,
  title: `call ${id}`,
  journal: id === 1 ? { slug: "a", abbreviation: "A", name: "a" } : null,
  journalName: id === 1 ? null : "Other Journal",
  at,
  deadlineText: null,
  url: id === 1 ? null : "https://example.org/call",
  source: "wikicfp",
  subfields,
  topics: [],
  guestEditors: [],
});

describe("computeJournalInsights", () => {
  const journals = [
    j({ slug: "a", openAccess: "full", apcUsd: 0, hIndex: 120 }),
    j({ slug: "b", openAccess: "hybrid", apcUsd: 3000, hIndex: 250 }),
    j({ slug: "c", openAccess: "full", apcUsd: 2000, hIndex: 80, subfields: ["cv"] }),
    j({ slug: "d", openAccess: "subscription", hIndex: 60 }),
  ];
  const specials = [si(1, NOW + 5 * DAY), si(2, NOW - DAY), si(3, NOW + 2 * DAY, ["cv"])];

  it("plots only journals with a known fee and an OA option", () => {
    const out = computeJournalInsights(journals, specials, null, NOW);
    expect(out.scatter.map((d) => d.slug).sort()).toEqual(["a", "b", "c"]);
    expect(out.totals).toEqual({ journals: 4, fullOa: 2, openCalls: 2, medianApc: 2500 });
    expect(out.topByH.map((t) => t.slug)).toEqual(["b", "a", "c", "d"]);
  });

  it("lists open calls soonest first, linking tracked journals in-app", () => {
    const out = computeJournalInsights(journals, specials, null, NOW);
    expect(out.upcomingCalls.map((c) => c.id)).toEqual([3, 1]);
    expect(out.upcomingCalls[1]).toMatchObject({ href: "/j/a#si-1", external: false });
    expect(out.upcomingCalls[0]).toMatchObject({ external: true, journal: "Other Journal" });
  });

  it("slices by subfield", () => {
    const out = computeJournalInsights(journals, specials, "cv", NOW);
    expect(out.totals.journals).toBe(1);
    expect(out.upcomingCalls.map((c) => c.id)).toEqual([3]);
  });

  it("adds special-issue deadlines to the event heatmap", () => {
    const slice = computeSlice([], [], null, NOW, specials);
    expect(slice.heatmap.counts.reduce((a, b) => a + b, 0)).toBe(3);
    expect(slice.totals.specialOpen).toBe(2);
    expect(slice.totals.next30).toBe(2);
  });
});

describe("buildJournalSystemPrompt", () => {
  it("grounds answers in the record, scope sections and special issues", () => {
    const { system, chunks } = buildJournalSystemPrompt(
      {
        id: 1,
        slug: "mlj",
        name: "Machine Learning",
        abbreviation: "MLJ",
        publisher: "Springer",
        issnPrint: "0885-6125",
        issnOnline: "1573-0565",
        issns: ["0885-6125", "1573-0565"],
        openalexId: "S1",
        homepage: "https://link.springer.com/journal/10994",
        submissionUrl: null,
        scopeUrl: "https://link.springer.com/journal/10994/aims-and-scope",
        scopeText:
          "## Aims\n\nMachine Learning is an international forum for research on learning.",
        scopeFetchedAt: "2026-10-09T00:00:00.000Z",
        subfields: ["ml"],
        topics: ["Learning theory"],
        openAccess: "hybrid",
        apcUsd: 3290,
        hIndex: 170,
        i10Index: 1000,
        twoYrMeanCitedness: 4.1,
        worksCount: 4000,
        citedByCount: 300000,
        metricsAsOf: "2026-10-08T00:00:00.000Z",
        countsByYear: [{ year: 2025, works: 120, citations: 9000 }],
        impactMetrics: [
          {
            name: "Journal Impact Factor",
            value: "4.9",
            year: 2025,
            source: "Springer journal page",
            url: null,
          },
        ],
        rankCoreJournal: "A*",
        rankCcf: "B",
        sjrQuartile: null,
        reviewModel: null,
        avgTimeToFirstDecision: "5 days",
        sources: ["seed", "openalex"],
        provenance: { hIndex: "openalex", apcUsd: "openalex" },
        updatedAt: "2026-10-09T00:00:00.000Z",
        specialIssues: [
          {
            id: 9,
            title: "Trustworthy Foundation Models",
            guestEditors: ["A. Editor"],
            descriptionText: null,
            submissionDeadlineUtc: "2026-12-02T11:59:59.000Z",
            deadlineText: "December 1, 2026",
            deadlineTz: null,
            url: "https://link.springer.com/journal/10994/updates/1",
            source: "springer",
            lastSeenAt: "2026-10-09T00:00:00.000Z",
          },
        ],
      },
      "Does my paper on bandits fit the scope?",
      "Asia/Kolkata",
      "2026-10-09",
    );
    expect(chunks.length).toBeGreaterThan(0);
    expect(system).toContain("[§1] Aims");
    expect(system).toContain("Journal Impact Factor 4.9 (2025) — source: Springer journal page");
    expect(system).toContain("[SI1] Trustworthy Foundation Models");
    expect(system).toContain('call states "December 1, 2026"');
    expect(system).toContain("OPEN");
    expect(system).toContain("rolling");
    expect(system).not.toContain("CFP sections as");
  });
});
