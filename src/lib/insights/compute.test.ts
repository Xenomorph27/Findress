import { describe, expect, it } from "vitest";
import type { ExplorerRow } from "@/lib/data/types";
import { computeSlice, nextMonths } from "./compute";

const NOW = Date.UTC(2026, 9, 9, 12); // Fri 2026-10-09
const DAY = 86_400_000;

// Synthetic rows for aggregation logic.
const base: Omit<ExplorerRow, "slug" | "id"> = {
  acronym: "X",
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
  startDate: null,
  endDate: null,
  deadlines: [],
  hasRebuttal: null,
  reviewType: null,
  communityOnly: false,
  latestInSeries: true,
  sources: [],
  createdAt: 0,
};
const rows: ExplorerRow[] = [
  {
    ...base,
    id: 1,
    slug: "a",
    subfields: ["nlp"],
    topics: ["LLMs"],
    rankCore: "A*",
    city: "Seoul",
    country: "South Korea",
    countryCode: "KR",
    lat: 37.5,
    lng: 127,
    startDate: "2026-12-01",
    deadlines: [{ kind: "paper", at: NOW + 2 * DAY, label: null }],
  },
  {
    ...base,
    id: 2,
    slug: "b",
    subfields: ["cv", "ml"],
    topics: ["LLMs", "Video"],
    rankCcf: "B",
    city: "Seoul",
    country: "South Korea",
    countryCode: "KR",
    lat: 37.5,
    lng: 127,
    startDate: "2027-03-10",
    deadlines: [{ kind: "paper", at: NOW + 40 * DAY, label: null }],
  },
  {
    ...base,
    id: 3,
    slug: "c",
    subfields: ["nlp"],
    type: "workshop",
    countryCode: "US",
    startDate: "2026-11-02",
    deadlines: [{ kind: "paper", at: NOW - 3 * DAY, label: null }],
  },
  {
    ...base,
    id: 4,
    slug: "d",
    communityOnly: true,
    deadlines: [{ kind: "paper", at: NOW + 1 * DAY, label: null }],
  },
];

describe("computeSlice", () => {
  it("aggregates totals, heatmap, months, places, ranks and topics", () => {
    const s = computeSlice(rows, [], null, NOW);
    expect(s.totals).toEqual({ events: 3, upcoming: 2, workshops: 1, countries: 2, next30: 1 });
    expect(s.heatmap.start).toBe("2026-10-05");
    expect(s.heatmap.counts.reduce((a, b) => a + b, 0)).toBe(3);
    expect(s.heatmap.max).toBe(1);
    expect(s.perMonth.months[0]).toBe("2026-10");
    const nlp = s.perMonth.series.find((x) => x.key === "nlp")!;
    expect(nlp.counts[1] + nlp.counts[2]).toBe(2); // Nov + Dec
    expect(s.places).toEqual([
      expect.objectContaining({ label: "Seoul, South Korea", countryCode: "KR", count: 2 }),
    ]);
    expect(s.ranks.find((r) => r.key === "A*")?.count).toBe(1);
    expect(s.ranks.find((r) => r.key === "unranked")?.count).toBe(1);
    expect(s.topics[0]).toEqual({ topic: "LLMs", count: 2 });
  });

  it("scopes everything to one subfield", () => {
    const s = computeSlice(rows, [], "cv", NOW);
    expect(s.totals.events).toBe(1);
    expect(s.perMonth.series.map((x) => x.key)).toEqual(["cv"]);
  });

  it("lists the next months across a year boundary", () => {
    expect(nextMonths(NOW, 4)).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"]);
  });
});
