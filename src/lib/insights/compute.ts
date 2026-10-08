import type { ExplorerRow } from "@/lib/data/types";
import { SUBFIELD_LABEL, type SubfieldId } from "@/lib/taxonomy";

/**
 * Aggregations for /insights, computed on the server for "all" and for each subfield so the
 * client only switches between small precomputed objects.
 */

export interface AcceptanceSeriesInput {
  seriesKey: string;
  label: string;
  slug: string | null;
  subfields: string[];
  points: { year: number; rate: number }[];
}

export interface InsightsSlice {
  totals: {
    events: number;
    upcoming: number;
    workshops: number;
    countries: number;
    next30: number;
  };
  /** Submission deadlines per day for 53 weeks starting on the Monday of the current week. */
  heatmap: { start: string; counts: number[]; max: number };
  perMonth: { months: string[]; series: { key: string; label: string; counts: number[] }[] };
  places: {
    key: string;
    label: string;
    countryCode: string | null;
    lat: number;
    lng: number;
    count: number;
  }[];
  ranks: { key: string; label: string; count: number }[];
  topics: { topic: string; count: number }[];
  acceptance: AcceptanceSeriesInput[];
}

const DAY = 86_400_000;

function mondayOf(now: number): number {
  const d = new Date(now);
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (new Date(utc).getUTCDay() + 6) % 7; // Monday = 0
  return utc - dow * DAY;
}

/** The next `n` calendar months starting with the current one, as "YYYY-MM". */
export function nextMonths(now: number, n: number): string[] {
  const d = new Date(now);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(
      new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1)).toISOString().slice(0, 7),
    );
  }
  return out;
}

const MAX_STACK = 6;

export function computeSlice(
  rows: ExplorerRow[],
  acceptance: AcceptanceSeriesInput[],
  subfield: string | null,
  now: number,
): InsightsSlice {
  const scoped = (subfield ? rows.filter((r) => r.subfields.includes(subfield)) : rows).filter(
    (r) => !r.communityOnly,
  );
  const today = new Date(now).toISOString().slice(0, 10);

  // Heatmap: abstract/paper deadlines per day.
  const start = mondayOf(now);
  const days = 53 * 7;
  const counts = new Array<number>(days).fill(0);
  let upcoming = 0;
  let next30 = 0;
  for (const r of scoped) {
    let hasUpcoming = false;
    for (const d of r.deadlines) {
      const idx = Math.floor((d.at - start) / DAY);
      if (idx >= 0 && idx < days) counts[idx]++;
      if (d.at >= now) {
        hasUpcoming = true;
        if (d.at <= now + 30 * DAY) next30++;
      }
    }
    if (hasUpcoming) upcoming++;
  }

  // Events per month (by start date) for the next 12 months, stacked by primary subfield.
  const months = nextMonths(now, 12);
  const monthIdx = new Map(months.map((m, i) => [m, i]));
  const bySub = new Map<string, number[]>();
  for (const r of scoped) {
    if (!r.startDate) continue;
    const i = monthIdx.get(r.startDate.slice(0, 7));
    if (i == null) continue;
    const key = subfield ?? r.subfields[0] ?? "other";
    const arr = bySub.get(key) ?? new Array<number>(12).fill(0);
    arr[i]++;
    bySub.set(key, arr);
  }
  const ranked = [...bySub.entries()]
    .filter(([k]) => k !== "other")
    .sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0));
  const series = ranked.slice(0, MAX_STACK).map(([key, c]) => ({
    key,
    label: SUBFIELD_LABEL[key as SubfieldId] ?? key,
    counts: c,
  }));
  const rest = new Array<number>(12).fill(0);
  for (const [, c] of ranked.slice(MAX_STACK)) c.forEach((v, i) => (rest[i] += v));
  bySub.get("other")?.forEach((v, i) => (rest[i] += v));
  if (rest.some((v) => v > 0)) series.push({ key: "other", label: "Other", counts: rest });

  // Places: upcoming/ongoing events grouped by city (or country centroid).
  const placeMap = new Map<string, InsightsSlice["places"][number]>();
  const countries = new Set<string>();
  for (const r of scoped) {
    if (r.countryCode) countries.add(r.countryCode);
    if (r.lat == null || r.lng == null) continue;
    if ((r.endDate ?? r.startDate ?? "9999") < today) continue;
    const key = `${r.city ?? ""}|${r.countryCode ?? ""}`;
    const cur = placeMap.get(key);
    if (cur) cur.count++;
    else {
      placeMap.set(key, {
        key,
        label:
          [r.city, r.country && r.country !== r.city ? r.country : null]
            .filter(Boolean)
            .join(", ") || "Unknown",
        countryCode: r.countryCode,
        lat: r.lat,
        lng: r.lng,
        count: 1,
      });
    }
  }

  // Rank mix.
  const rankCount = (pred: (r: ExplorerRow) => boolean) => scoped.filter(pred).length;
  const ranks = [
    { key: "A*", label: "CORE A*", count: rankCount((r) => r.rankCore === "A*") },
    { key: "A", label: "CORE A", count: rankCount((r) => r.rankCore === "A") },
    { key: "B", label: "CORE B", count: rankCount((r) => r.rankCore === "B") },
    { key: "C", label: "CORE C", count: rankCount((r) => r.rankCore === "C") },
    { key: "CCF-A", label: "CCF A", count: rankCount((r) => r.rankCcf === "A") },
    { key: "CCF-B", label: "CCF B", count: rankCount((r) => r.rankCcf === "B") },
    { key: "CCF-C", label: "CCF C", count: rankCount((r) => r.rankCcf === "C") },
    { key: "unranked", label: "Unranked", count: rankCount((r) => !r.rankCore && !r.rankCcf) },
  ];

  // Topics among upcoming events.
  const topicMap = new Map<string, number>();
  for (const r of scoped) {
    if (!r.deadlines.some((d) => d.at >= now) && (r.startDate ?? "0000") < today) continue;
    for (const t of r.topics) topicMap.set(t, (topicMap.get(t) ?? 0) + 1);
  }
  const topics = [...topicMap.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
    .slice(0, 12);

  return {
    totals: {
      events: scoped.length,
      upcoming,
      workshops: scoped.filter((r) => r.type === "workshop").length,
      countries: countries.size,
      next30,
    },
    heatmap: {
      start: new Date(start).toISOString().slice(0, 10),
      counts,
      max: Math.max(0, ...counts),
    },
    perMonth: { months, series },
    places: [...placeMap.values()].sort((a, b) => b.count - a.count),
    ranks,
    topics,
    acceptance: (subfield
      ? acceptance.filter((a) => a.subfields.includes(subfield))
      : acceptance
    ).slice(0, 6),
  };
}
