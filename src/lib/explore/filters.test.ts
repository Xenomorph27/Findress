import { describe, expect, it } from "vitest";
import type { ExplorerRow } from "@/lib/data/types";
import {
  activeFilterCount,
  applyFilters,
  DEFAULT_FILTERS,
  editionStatus,
  nextDeadline,
  parseFilters,
  serializeFilters,
} from "./filters";

const NOW = Date.UTC(2026, 9, 9, 12);
const DAY = 86_400_000;

// Synthetic rows for logic tests (not presented as real venue data).
function row(p: Partial<ExplorerRow> & { slug: string }): ExplorerRow {
  return {
    id: Math.floor(Math.random() * 1e6),
    acronym: p.slug.toUpperCase(),
    name: null,
    year: 2027,
    type: "conference",
    parent: null,
    subfields: [],
    topics: [],
    rankCore: null,
    rankCcf: null,
    mode: null,
    city: null,
    country: null,
    countryCode: null,
    continent: null,
    lat: null,
    lng: null,
    startDate: "2027-06-01",
    endDate: null,
    deadlines: [],
    hasRebuttal: null,
    reviewType: null,
    communityOnly: false,
    latestInSeries: true,
    sources: ["huggingface"],
    createdAt: 0,
    ...p,
  };
}

const rows = [
  row({
    slug: "soon",
    deadlines: [{ kind: "paper", at: NOW + 3 * DAY, label: null }],
    subfields: ["nlp"],
    rankCore: "A*",
    continent: "Asia",
    countryCode: "KR",
  }),
  row({
    slug: "later",
    deadlines: [
      { kind: "abstract", at: NOW + 40 * DAY, label: null },
      { kind: "paper", at: NOW + 47 * DAY, label: null },
    ],
    subfields: ["cv"],
    rankCcf: "B",
    continent: "Europe",
    reviewType: "Double-blind",
  }),
  // Submissions closed, event still ahead (NeurIPS in October): stays listed.
  row({
    slug: "closed",
    deadlines: [{ kind: "paper", at: NOW - 5 * DAY, label: null }],
    startDate: "2026-12-01",
  }),
  // Latest edition of its series ended in July; next edition not announced yet: stays listed.
  row({
    slug: "lastcycle",
    year: 2026,
    deadlines: [{ kind: "paper", at: NOW - 250 * DAY, label: null }],
    startDate: "2026-07-05",
    endDate: "2026-07-10",
  }),
  // An older edition superseded by a newer one: hidden unless past editions are shown.
  row({
    slug: "past",
    year: 2026,
    deadlines: [{ kind: "paper", at: NOW - 200 * DAY, label: null }],
    startDate: "2026-06-01",
    latestInSeries: false,
  }),
  row({
    slug: "tba",
    startDate: "2027-07-01",
    type: "workshop",
    name: "Workshop on Agents",
    topics: ["Agents"],
  }),
  row({
    slug: "community",
    deadlines: [{ kind: "paper", at: NOW + 10 * DAY, label: null }],
    communityOnly: true,
    sources: ["wikicfp"],
  }),
];

describe("filters URL round-trip", () => {
  it("parses and serializes, omitting defaults", () => {
    const f = parseFilters(
      new URLSearchParams(
        "q=vision&type=workshop,conference&rank=A*,CCF-A&window=30&passed=1&country=kr&sort=rank&view=cards",
      ),
    );
    expect(f).toMatchObject({
      q: "vision",
      types: ["workshop", "conference"],
      ranks: ["A*", "CCF-A"],
      window: "30",
      showPassed: true,
      countries: ["KR"],
      sort: "rank",
      view: "cards",
    });
    expect(serializeFilters(f).toString()).toBe(
      "q=vision&view=cards&sort=rank&type=workshop%2Cconference&rank=A*%2CCCF-A&window=30&passed=1&country=KR",
    );
    expect(serializeFilters(DEFAULT_FILTERS).toString()).toBe("");
    expect(activeFilterCount(f)).toBe(7);
  });

  it("ignores invalid values", () => {
    const f = parseFilters({ sort: "nope", window: "12", from: "yesterday", view: "grid" });
    expect(f.sort).toBe("deadline");
    expect(f.window).toBe("");
    expect(f.dlFrom).toBe("");
    expect(f.view).toBe("list");
  });
});

describe("applyFilters", () => {
  const slugs = (f: Partial<typeof DEFAULT_FILTERS>) =>
    applyFilters(rows, { ...DEFAULT_FILTERS, ...f }, NOW).map((r) => r.slug);

  it("hides past editions and community-only events by default, open calls first", () => {
    expect(slugs({})).toEqual(["soon", "later", "tba", "closed", "lastcycle"]);
  });

  it("shows past editions and community events when asked", () => {
    expect(slugs({ showPassed: true, community: true })).toEqual([
      "soon",
      "community",
      "later",
      "tba",
      "closed",
      "lastcycle",
      "past",
    ]);
  });

  it("filters by deadline window, subfield, rank, continent, review type and text", () => {
    expect(slugs({ window: "7" })).toEqual(["soon"]);
    expect(slugs({ subfields: ["cv"] })).toEqual(["later"]);
    expect(slugs({ ranks: ["A*"] })).toEqual(["soon"]);
    expect(slugs({ ranks: ["CCF-B"] })).toEqual(["later"]);
    expect(slugs({ ranks: ["unranked"] })).toEqual(["tba", "closed", "lastcycle"]);
    expect(slugs({ continents: ["Asia"] })).toEqual(["soon"]);
    expect(slugs({ doubleBlind: true })).toEqual(["later"]);
    expect(slugs({ hasAbstract: true })).toEqual(["later"]);
    expect(slugs({ q: "agents workshop" })).toEqual(["tba"]);
    expect(slugs({ types: ["workshop"] })).toEqual(["tba"]);
  });

  it("supports a custom deadline range", () => {
    const from = new Date(NOW + 30 * DAY).toISOString().slice(0, 10);
    expect(slugs({ window: "custom", dlFrom: from })).toEqual(["later"]);
  });

  it("sorts by rank and name", () => {
    expect(slugs({ sort: "rank" })[0]).toBe("soon");
    expect(slugs({ sort: "name" })).toEqual(["closed", "lastcycle", "later", "soon", "tba"]);
  });
});

describe("editionStatus (regression: flagships vanished once their call closed)", () => {
  const by = (slug: string) => rows.find((r) => r.slug === slug)!;
  it("classifies open, unknown, closed, tba and past editions", () => {
    expect(editionStatus(by("soon"), NOW)).toBe("open");
    expect(editionStatus(by("tba"), NOW)).toBe("unknown");
    expect(editionStatus(by("closed"), NOW)).toBe("closed");
    expect(editionStatus(by("lastcycle"), NOW)).toBe("tba");
    expect(editionStatus(by("past"), NOW)).toBe("past");
  });
  it("drops a finished latest edition after a year without a successor", () => {
    expect(editionStatus(by("lastcycle"), NOW + 400 * DAY)).toBe("past");
  });
});

describe("nextDeadline", () => {
  it("prefers the earliest upcoming, else the latest passed", () => {
    const by = (slug: string) => rows.find((r) => r.slug === slug)!;
    expect(nextDeadline(by("later"), NOW)?.kind).toBe("abstract");
    expect(nextDeadline(by("closed"), NOW)).toMatchObject({ passed: true });
    expect(nextDeadline(by("tba"), NOW)).toBeNull();
  });
});

describe("packObjects", () => {
  it("round-trips rows through the columnar payload", async () => {
    const { packObjects, unpackObjects } = await import("./pack");
    const rows = [
      { id: 1, slug: "a", topics: ["x"], parent: null, lat: 1.5 },
      { id: 2, slug: "b", topics: [], parent: { slug: "a" }, lat: null },
    ];
    const packed = packObjects(rows);
    expect(packed.k).toEqual(["id", "slug", "topics", "parent", "lat"]);
    expect(unpackObjects(packed)).toEqual(rows);
    expect(unpackObjects(packObjects([]))).toEqual([]);
  });

  it("round-trips explorer rows (deadline and parent tuples; sources stay server-side)", async () => {
    const { packExplorerRows, unpackExplorerRows } = await import("./pack");
    const r = {
      ...row({ slug: "w-2027" }),
      deadlines: [{ kind: "paper" as const, at: 1_800_000_000_000, label: "Submission deadline" }],
      parent: { slug: "icml-2027", acronym: "ICML", year: 2027 },
      sources: ["ccfddl"],
    };
    const [back] = unpackExplorerRows(packExplorerRows([r]));
    expect(back).toEqual({ ...r, sources: [] });
  });
});
