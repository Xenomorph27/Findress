import { describe, expect, it } from "vitest";
import { JOURNAL_SEED } from "@/data/journals-seed";
import type { JournalListRow, SpecialIssueListRow } from "@/lib/data/types";
import { DEFAULT_FILTERS } from "@/lib/explore/filters";
import { applyJournalFilters, applySpecialFilters } from "@/lib/explore/journal-filters";
import {
  deadlineFromText,
  extractScopeText,
  journalNameFromTitle,
  matchJournal,
  normalizeOpenAlexSource,
  normalizeTitle,
  normalizeWikiCfpSpecialIssue,
  OpenAlexSourceSchema,
  parseCcfRankJs,
  parseCoreJournalPage,
  parseSpringerMetrics,
  parseSpringerUpdates,
  specialIssueFeedItems,
} from "./journals";
import { fixture } from "./test-utils";

const seed = (slug: string) => JOURNAL_SEED.find((j) => j.slug === slug)!;

/** ISSN check digit (mod 11, "X" = 10): a typo'd or invented ISSN fails this. */
function validIssn(issn: string): boolean {
  const m = /^(\d{4})-(\d{3})([\dX])$/.exec(issn);
  if (!m) return false;
  const digits = (m[1] + m[2]).split("").map(Number);
  const sum = digits.reduce((acc, d, i) => acc + d * (8 - i), 0);
  const check = (11 - (sum % 11)) % 11;
  return m[3] === (check === 10 ? "X" : String(check));
}

describe("journal seed list", () => {
  it("covers the required core journals", () => {
    const names = new Set(JOURNAL_SEED.map((j) => normalizeTitle(j.name)));
    for (const required of [
      "Journal of Machine Learning Research",
      "Transactions on Machine Learning Research",
      "IEEE Transactions on Pattern Analysis and Machine Intelligence",
      "IEEE Transactions on Neural Networks and Learning Systems",
      "International Journal of Computer Vision",
      "Artificial Intelligence",
      "Journal of Artificial Intelligence Research",
      "Machine Learning",
      "Neural Networks",
      "Pattern Recognition",
      "Neurocomputing",
      "IEEE Transactions on Knowledge and Data Engineering",
      "Computational Linguistics",
      "Transactions of the Association for Computational Linguistics",
      "Data Mining and Knowledge Discovery",
      "IEEE Transactions on Image Processing",
      "Neural Computation",
      "Nature Machine Intelligence",
      "ACM Transactions on Intelligent Systems and Technology",
      "ACM Computing Surveys",
      "Knowledge-Based Systems",
      "Expert Systems with Applications",
      "Information Fusion",
      "IEEE Transactions on Artificial Intelligence",
      "Foundations and Trends in Machine Learning",
      "Journal of Data-centric Machine Learning Research",
    ]) {
      expect(names.has(normalizeTitle(required)), required).toBe(true);
    }
    expect(JOURNAL_SEED.length).toBeGreaterThanOrEqual(80);
    expect(JOURNAL_SEED.length).toBeLessThanOrEqual(120);
  });

  it("has unique slugs and only checksum-valid ISSNs", () => {
    expect(new Set(JOURNAL_SEED.map((j) => j.slug)).size).toBe(JOURNAL_SEED.length);
    for (const j of JOURNAL_SEED) {
      for (const issn of [...j.issns, j.issnPrint, j.issnOnline].filter(Boolean) as string[]) {
        expect(validIssn(issn), `${j.abbreviation} ${issn}`).toBe(true);
      }
      if (j.issnPrint) expect(j.issns).toContain(j.issnPrint);
    }
    // DMLR's site says its ISSN is pending: no number is invented.
    expect(seed("dmlr").issns).toEqual([]);
  });
});

describe("OpenAlex source mapping (real records)", () => {
  const load = (f: string) => OpenAlexSourceSchema.parse(JSON.parse(fixture("journals", f)));

  it("keeps curated diamond-OA facts over OpenAlex (JMLR)", () => {
    const m = normalizeOpenAlexSource(load("openalex-jmlr.json"), seed("jmlr"));
    expect(m.openAccess).toBe("full");
    expect(m.openAccessSource).toBe("journal site");
    expect(m.apcUsd).toBe(0);
    expect(m.hIndex).toBe(126);
    // OpenAlex reports 0 two-year citedness for JMLR: treated as unknown, not as zero.
    expect(m.twoYrMeanCitedness).toBeNull();
    expect(m.publisher).toBe(seed("jmlr").publisher);
  });

  it("maps a hybrid subscription journal with an APC (Neural Networks)", () => {
    const m = normalizeOpenAlexSource(load("openalex-neural-networks.json"), seed("nn"));
    expect(m.openAccess).toBe("hybrid");
    expect(m.apcUsd).toBe(3110);
    expect(m.hIndex).toBeGreaterThan(200);
    expect(m.twoYrMeanCitedness).toBeCloseTo(5.89, 1);
    expect(m.countsByYear.map((c) => c.year)).toEqual(
      [...m.countsByYear.map((c) => c.year)].sort((a, b) => a - b),
    );
    expect(m.topics.length).toBeGreaterThan(0);
    expect(m.issns).toEqual(expect.arrayContaining(["0893-6080", "1879-2782"]));
  });

  it("maps a gold-OA journal (Frontiers in AI)", () => {
    const m = normalizeOpenAlexSource(load("openalex-frai.json"), seed("front-artif-intell"));
    expect(m.openAccess).toBe("full");
    expect(m.openAccessSource).toBe("openalex");
    expect(m.apcUsd).toBe(2353);
  });
});

describe("journal rankings", () => {
  it("parses the CCF journal list (CCFrank4dblp data)", () => {
    const ccf = parseCcfRankJs(
      fixture("journals", "ccfrank-ccfRankFull.js"),
      fixture("journals", "ccfrank-ccfRankUrl.js"),
    );
    expect(ccf.size).toBeGreaterThan(250);
    expect(
      ccf.get(normalizeTitle("IEEE Transactions on Pattern Analysis and Machine Intelligence")),
    ).toBe("A");
    expect(ccf.get(normalizeTitle("Journal of Machine Learning Research"))).toBe("A");
    expect(ccf.get(normalizeTitle("Neural Networks"))).toBe("B");
    // Conferences in the same file are not journals.
    expect(ccf.get(normalizeTitle("AAAI Conference on Artificial Intelligence"))).toBeUndefined();
  });

  it("parses a CORE2020 journal portal page", () => {
    const page = parseCoreJournalPage(fixture("journals", "core-jnl-ranks-p1.html"));
    expect(page.total).toBe(639);
    expect(page.rows.length).toBeGreaterThan(40);
    expect(page.rows.find((r) => r.title === "ACM Computing Surveys")).toEqual({
      title: "ACM Computing Surveys",
      source: "CORE2020",
      rank: "A*",
    });
  });
});

describe("journal pages", () => {
  it("reads Springer's published metrics with their year", () => {
    const m = parseSpringerMetrics(fixture("journals", "springer-10994-home.html"));
    expect(m.impactMetrics).toEqual([
      { name: "Journal Impact Factor", value: "4.9", year: 2025 },
      { name: "5-year Journal Impact Factor", value: "8.0", year: 2025 },
    ]);
    expect(m.timeToFirstDecision).toBe("5 days");
  });

  it("keeps only Springer calls that state a submission deadline", () => {
    const calls = parseSpringerUpdates(
      fixture("journals", "springer-10994-updates.html"),
      "https://link.springer.com/journal/10994/updates",
      "mlj",
    );
    expect(calls.length).toBe(3);
    const xai = calls.find((c) => c.title.includes("Explainable AI"))!;
    expect(xai.deadlineText).toBe("February 25, 2025");
    // Date only, no zone stated: end of day AoE (UTC−12).
    expect(xai.submissionDeadlineUtc).toBe("2025-02-26T11:59:59.000Z");
    expect(xai.deadlineTz).toBeNull();
    expect(xai.guestEditors.length).toBe(4);
    expect(xai.url).toBe("https://link.springer.com/journal/10994/updates/27325590");
    expect(calls.every((c) => c.journalSlug === "mlj")).toBe(true);
  });

  it("parses deadlines written day-first or month-first, end of day AoE", () => {
    expect(deadlineFromText("1 February 2027").utc).toBe("2027-02-02T11:59:59.000Z");
    expect(deadlineFromText("15th Aug. 2024").utc).toBe("2024-08-16T11:59:59.000Z");
    expect(deadlineFromText("April 15 2021").utc).toBe("2021-04-16T11:59:59.000Z");
    expect(deadlineFromText("extended to October 31st, 2023").utc).toBe("2023-11-01T11:59:59.000Z");
    expect(deadlineFromText("soon").utc).toBeNull();
  });

  it("extracts aims & scope text (Springer, Nature, TACL)", () => {
    const mlj = extractScopeText(
      fixture("journals", "springer-10994-aims.html"),
      "https://link.springer.com/journal/10994/aims-and-scope",
    );
    expect(mlj).toMatch(/^Machine Learning is an international forum/);
    const nmi = extractScopeText(
      fixture("journals", "nature-natmachintell-aims.html"),
      "https://www.nature.com/natmachintell/aims",
    );
    expect(nmi).toMatch(/Nature Machine Intelligence publishes/);
    const tacl = extractScopeText(
      fixture("journals", "tacl-about.html"),
      "https://transacl.org/index.php/tacl/about",
    );
    expect(tacl?.length).toBeGreaterThan(500);
  });
});

describe("special issues from WikiCFP", () => {
  it("keeps special-issue items and skips whole-journal calls", async () => {
    const items = await specialIssueFeedItems(fixture("journals", "wikicfp-rss-journal.xml"));
    expect(items.map((i) => i.acronymRaw)).not.toContain("IJNLC 2026");
    const si = await specialIssueFeedItems(fixture("journals", "wikicfp-rss-special-issue.xml"));
    expect(si.some((i) => i.acronymRaw === "Special Issue IEEE TSC: LLM-SOA 2026")).toBe(true);
  });

  it("normalizes a call and matches it to a seed journal (LRE)", () => {
    const item = {
      eventId: "203521",
      acronymRaw: "LRE-PPLD 2027",
      name: "Special Issue Preserving the Privacy of Language Data: Emerging Technologies, Evolving Standards and Beyond at the Language Resources and Evaluation Journal",
      place: null,
      when: null,
      link: "http://www.wikicfp.com/cfp/servlet/event.showcfp?eventid=203521",
    };
    const si = normalizeWikiCfpSpecialIssue(
      item,
      fixture("journals", "wikicfp-si-203521.html"),
      JOURNAL_SEED,
    )!;
    expect(si.journalSlug).toBe("lre");
    expect(si.title).toMatch(/^Preserving the Privacy of Language Data/);
    expect(si.submissionDeadlineUtc).toBe("2026-11-03T11:59:59.000Z");
    expect(si.descriptionText).toMatch(/Call for Abstracts/);
  });

  it("does not match generic names without journal context", () => {
    const mdpi =
      "SI: AI for Control Systems 2027 : Special Issue on Applied Artificial Intelligence for Control Systems (Electronics, MDPI)";
    expect(matchJournal(mdpi, JOURNAL_SEED)).toBeNull();
    expect(journalNameFromTitle(mdpi)).toBe("Electronics, MDPI");
    expect(journalNameFromTitle("Special Issue IEEE TSC: LLM-SOA 2026")).toBe("IEEE TSC");
    expect(matchJournal("Call for papers, Neurocomputing (Elsevier)", JOURNAL_SEED)?.slug).toBe(
      "neucom",
    );
    expect(matchJournal("Special issue in the journal Machine Learning", JOURNAL_SEED)?.slug).toBe(
      "mlj",
    );
  });
});

describe("journal and special-issue filters", () => {
  const NOW = Date.UTC(2026, 9, 9);
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
    subfields: [],
    topics: [],
    nextCall: null,
    openCalls: 0,
    ...p,
  });
  const journals = [
    j({ slug: "diamond", openAccess: "full", apcUsd: 0, hIndex: 100, rankCcf: "A" }),
    j({ slug: "hybrid", openAccess: "hybrid", apcUsd: 3110, hIndex: 250, publisher: "Elsevier" }),
    j({ slug: "subs", openAccess: "subscription", hIndex: 90, rankCoreJournal: "A*" }),
    j({ slug: "unknown", hIndex: 10 }),
    j({ slug: "calls", hIndex: 5, nextCall: { id: 1, title: "SI", at: NOW + 86_400_000 } }),
  ];
  const slugs = (f: Partial<typeof DEFAULT_FILTERS>) =>
    applyJournalFilters(journals, { ...DEFAULT_FILTERS, ...f }, NOW).map((r) => r.slug);

  it("filters by open access, APC, rank and publisher", () => {
    expect(slugs({ oa: ["full"] })).toEqual(["diamond"]);
    // Free to publish: diamond OA and subscription journals; unknown fees are excluded.
    expect(slugs({ apcMax: "0", jsort: "name" })).toEqual(["diamond", "subs"]);
    expect(slugs({ apcMax: "4000", jsort: "name" })).toEqual(["diamond", "hybrid", "subs"]);
    expect(slugs({ jranks: ["CCF-A", "A*"], jsort: "name" })).toEqual(["diamond", "subs"]);
    expect(slugs({ publishers: ["Elsevier"] })).toEqual(["hybrid"]);
  });

  it("sorts by open calls first, h-index and APC", () => {
    expect(slugs({})[0]).toBe("calls");
    expect(slugs({ jsort: "hindex" })).toEqual(["hybrid", "diamond", "subs", "unknown", "calls"]);
    expect(slugs({ jsort: "apc" }).slice(0, 2)).toEqual(["diamond", "subs"]);
  });

  it("hides closed special-issue calls unless asked, open ones by deadline", () => {
    const s = (id: number, at: number | null): SpecialIssueListRow => ({
      id,
      title: `call ${id}`,
      journal: null,
      journalName: null,
      at,
      deadlineText: null,
      url: null,
      source: "wikicfp",
      subfields: [],
      topics: [],
      guestEditors: [],
    });
    const rows = [
      s(1, NOW + 20 * 86_400_000),
      s(2, NOW - 86_400_000),
      s(3, null),
      s(4, NOW + 86_400_000),
    ];
    const ids = (f: Partial<typeof DEFAULT_FILTERS>) =>
      applySpecialFilters(rows, { ...DEFAULT_FILTERS, ...f }, NOW).map((r) => r.id);
    expect(ids({})).toEqual([4, 1, 3]);
    expect(ids({ showPassed: true })).toEqual([4, 1, 3, 2]);
    expect(ids({ window: "7" })).toEqual([4]);
  });
});
