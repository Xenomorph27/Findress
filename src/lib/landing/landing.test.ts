import { describe, expect, it } from "vitest";
import type { ExplorerRow } from "@/lib/data/types";
import {
  angularDistance,
  latLngToVec,
  nearestWithin,
  phiFacing,
  project,
  unproject,
  vecToLatLng,
} from "./globe-math";
import { clusterVenues, exploreHrefFor } from "./venues";

const LONDON: [number, number] = [51.5072, -0.1276];
const TOKYO: [number, number] = [35.6762, 139.6503];

describe("globe math (cobe projection)", () => {
  it("round-trips lat/lng through the unit sphere", () => {
    for (const p of [
      LONDON,
      TOKYO,
      [-33.86, 151.21] as [number, number],
      [0, 0] as [number, number],
    ]) {
      const [lat, lng] = vecToLatLng(latLngToVec(p));
      expect(lat).toBeCloseTo(p[0], 6);
      expect(lng).toBeCloseTo(p[1], 6);
    }
  });

  it("puts a longitude at the centre when facing it", () => {
    const pt = project([0, -0.1276], phiFacing(-0.1276), 0);
    expect(pt.visible).toBe(true);
    expect(pt.x).toBeCloseTo(0.5, 6);
    expect(pt.y).toBeCloseTo(0.5, 6);
  });

  it("hides the far side", () => {
    expect(project(TOKYO, phiFacing(LONDON[1]), 0.2).visible).toBe(false);
    expect(project(LONDON, phiFacing(LONDON[1]), 0.2).visible).toBe(true);
  });

  it("keeps markers inside the sphere's edge (radius 0.8 → 0.1..0.9 of the canvas)", () => {
    for (let lng = -180; lng < 180; lng += 15) {
      for (let lat = -80; lat <= 80; lat += 20) {
        const pt = project([lat, lng], 4.4, 0.28);
        const r = Math.hypot(pt.x - 0.5, pt.y - 0.5);
        expect(r).toBeLessThanOrEqual(0.4 + 1e-9);
      }
    }
  });

  it("unprojects a click back to the lat/lng under it, for any rotation", () => {
    for (const [phi, theta] of [
      [4.4, 0.28],
      [1.2, -0.4],
      [phiFacing(TOKYO[1]), 0.1],
    ]) {
      for (const p of [LONDON, TOKYO]) {
        const pt = project(p, phi, theta);
        if (!pt.visible) continue;
        const back = unproject(pt.x, pt.y, phi, theta)!;
        expect(angularDistance(back, p)).toBeLessThan(1e-6);
      }
    }
  });

  it("returns null off the sphere", () => {
    expect(unproject(0.02, 0.02, 0, 0)).toBeNull();
  });

  it("finds the nearest cluster within 5°, and nothing over open ocean", () => {
    const clusters = [
      { id: "ldn", lat: LONDON[0], lng: LONDON[1] },
      { id: "tky", lat: TOKYO[0], lng: TOKYO[1] },
    ];
    expect(nearestWithin(clusters, [52.2, 0.12], 5)?.id).toBe("ldn"); // Cambridge
    expect(nearestWithin(clusters, [30, -40], 5)).toBeNull(); // mid-Atlantic
  });
});

const row = (over: Partial<ExplorerRow>): ExplorerRow =>
  ({
    id: 1,
    slug: "x-2027",
    acronym: "X",
    year: 2027,
    name: null,
    type: "conference",
    city: null,
    country: null,
    countryCode: null,
    lat: null,
    lng: null,
    startDate: "2027-06-01",
    endDate: "2027-06-05",
    deadlines: [],
    ...over,
  }) as ExplorerRow;

describe("venue clusters", () => {
  it("groups by city, averages coordinates and sorts events by next deadline", () => {
    const now = Date.parse("2026-10-09T00:00:00Z");
    const rows = [
      row({
        id: 1,
        slug: "a-2027",
        acronym: "A",
        city: "London",
        country: "United Kingdom",
        countryCode: "GB",
        lat: 51.5,
        lng: -0.1,
      }),
      row({
        id: 2,
        slug: "b-2027",
        acronym: "B",
        city: "London",
        country: "United Kingdom",
        countryCode: "GB",
        lat: 51.52,
        lng: -0.14,
        deadlines: [{ kind: "paper", at: now + 86_400_000 }] as ExplorerRow["deadlines"],
      }),
      row({
        id: 3,
        slug: "c-2027",
        acronym: "C",
        city: "Tokyo",
        country: "Japan",
        countryCode: "JP",
        lat: 35.68,
        lng: 139.65,
      }),
      row({ id: 4, slug: "d-2027", acronym: "D" }),
    ];
    const clusters = clusterVenues(rows, now);
    expect(clusters).toHaveLength(2);
    const ldn = clusters[0];
    expect(ldn.city).toBe("London");
    expect(ldn.count).toBe(2);
    expect(ldn.lat).toBeCloseTo(51.51, 2);
    expect(ldn.events.map((e) => e.acronym)).toEqual(["B", "A"]);
    expect(exploreHrefFor(ldn)).toBe("/explore?country=GB&q=London");
  });

  it("merges spelling variants and nearby venues into one place", () => {
    const now = Date.parse("2026-10-09T00:00:00Z");
    const mk = (id: number, city: string, countryCode: string, lat: number, lng: number) =>
      row({
        id,
        slug: `e${id}-2027`,
        acronym: `E${id}`,
        city,
        country: "x",
        countryCode,
        lat,
        lng,
      });
    const clusters = clusterVenues(
      [
        mk(1, "Montréal", "CA", 45.5019, -73.5674),
        mk(2, "Montréal", "CA", 45.503, -73.56),
        mk(3, "Montreal", "CA", 45.5017, -73.5673),
        mk(4, "Palais des congrès de Montréal", "CA", 45.5035, -73.5605),
        mk(5, "Atlanta", "US", 33.749, -84.388),
        mk(6, "Atlanta", "GE", 33.7489, -84.3879),
      ],
      now,
    );
    expect(clusters.map((c) => [c.city, c.count])).toEqual([
      ["Montréal", 4],
      ["Atlanta", 2],
    ]);
  });
});
