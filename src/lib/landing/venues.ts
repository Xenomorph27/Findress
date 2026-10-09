import type { ExplorerRow } from "@/lib/data/types";
import { nextDeadline } from "@/lib/explore/filters";

/** One place on the landing globe: every current edition held in that city. */
export interface VenueCluster {
  id: string;
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  /** Events held there (current editions). */
  count: number;
  /** The first few, soonest deadline first, for the popover. */
  events: VenueEvent[];
}

export interface VenueEvent {
  slug: string;
  acronym: string;
  year: number;
  type: string;
  startDate: string | null;
  endDate: string | null;
  /** Next open deadline (epoch ms), if any. */
  nextDeadlineAt: number | null;
}

export const MAX_CLUSTERS = 150;
export const EVENTS_PER_CLUSTER = 6;

/**
 * Groups located events by city (country code + city name; rounded coordinates when the city is
 * missing). Coordinates are the cluster mean, so a city with several venues gets one marker.
 */
export function clusterVenues(rows: ExplorerRow[], now: number): VenueCluster[] {
  const groups = new Map<string, ExplorerRow[]>();
  for (const r of rows) {
    if (r.lat == null || r.lng == null) continue;
    const key = r.city
      ? `${(r.countryCode ?? r.country ?? "").toUpperCase()}|${r.city.toLowerCase()}`
      : `${r.lat.toFixed(1)},${r.lng.toFixed(1)}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  const clusters: VenueCluster[] = [];
  for (const [key, list] of groups) {
    const lat = list.reduce((s, r) => s + r.lat!, 0) / list.length;
    const lng = list.reduce((s, r) => s + r.lng!, 0) / list.length;
    const events = list
      .map((r) => {
        const nd = nextDeadline(r, now);
        return {
          slug: r.slug,
          acronym: r.acronym,
          year: r.year,
          type: r.type,
          startDate: r.startDate,
          endDate: r.endDate,
          nextDeadlineAt: nd && !nd.passed ? nd.at : null,
        };
      })
      .sort(
        (a, b) =>
          (a.nextDeadlineAt ?? Infinity) - (b.nextDeadlineAt ?? Infinity) ||
          (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999") ||
          a.acronym.localeCompare(b.acronym),
      );
    const first = list[0];
    clusters.push({
      id: key,
      lat: Math.round(lat * 1e4) / 1e4,
      lng: Math.round(lng * 1e4) / 1e4,
      city: first.city,
      country: first.country,
      countryCode: first.countryCode,
      count: list.length,
      events: events.slice(0, EVENTS_PER_CLUSTER),
    });
  }
  return clusters
    .sort((a, b) => b.count - a.count || (a.city ?? "").localeCompare(b.city ?? ""))
    .slice(0, MAX_CLUSTERS);
}

/** /explore link that shows everything in a cluster's city. */
export function exploreHrefFor(c: Pick<VenueCluster, "city" | "countryCode">): string {
  const p = new URLSearchParams();
  if (c.countryCode) p.set("country", c.countryCode.toUpperCase());
  if (c.city) p.set("q", c.city);
  return `/explore?${p}`;
}
