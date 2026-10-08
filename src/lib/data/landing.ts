import "server-only";
import { and, eq, gte } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/lib/db";
import { sourceRuns } from "@/lib/db/schema";
import { nextDeadline } from "@/lib/explore/filters";
import { LIST_SOURCES } from "@/lib/taxonomy";
import { getExplorerRows } from "./events";

export interface LandingDeadline {
  id: number;
  slug: string;
  acronym: string;
  year: number;
  name: string | null;
  kind: "abstract" | "paper";
  at: number;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
}

export interface LandingData {
  next: LandingDeadline[];
  markers: { id: string; lat: number; lng: number }[];
  stats: {
    tracked: number;
    deadlinesThisMonth: number;
    sourcesLive: number;
    sourcesTotal: number;
    workshops: number;
  };
}

export async function getLandingData(): Promise<LandingData> {
  "use cache";
  cacheLife("hours");
  cacheTag("events");
  const now = Date.now();
  const rows = (await getExplorerRows()).filter((r) => !r.communityOnly);

  const upcoming = rows
    .map((r) => ({ r, nd: nextDeadline(r, now) }))
    .filter((x) => x.nd && !x.nd.passed)
    .sort((a, b) => a.nd!.at - b.nd!.at);

  const next = upcoming.slice(0, 5).map(({ r, nd }) => ({
    id: r.id,
    slug: r.slug,
    acronym: r.acronym,
    year: r.year,
    name: r.name,
    kind: nd!.kind,
    at: nd!.at,
    city: r.city,
    country: r.country,
    lat: r.lat,
    lng: r.lng,
  }));

  const seen = new Set<string>();
  const markers: LandingData["markers"] = [];
  for (const { r } of upcoming) {
    if (r.lat == null || r.lng == null) continue;
    const key = `${r.lat.toFixed(1)},${r.lng.toFixed(1)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    markers.push({ id: r.slug, lat: r.lat, lng: r.lng });
    if (markers.length >= 160) break;
  }

  const monthStart = new Date(now);
  const startMs = Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1);
  const endMs = Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1);
  const deadlinesThisMonth = rows.reduce(
    (n, r) => n + r.deadlines.filter((d) => d.at >= startMs && d.at < endMs).length,
    0,
  );

  let sourcesLive = 0;
  const db = getDb();
  if (db) {
    const since = new Date(now - 48 * 3600_000);
    const live = await db
      .select({ source: sourceRuns.source })
      .from(sourceRuns)
      .where(and(eq(sourceRuns.ok, true), gte(sourceRuns.startedAt, since)))
      .groupBy(sourceRuns.source);
    sourcesLive = live.filter((l) => (LIST_SOURCES as readonly string[]).includes(l.source)).length;
  }

  return {
    next,
    markers,
    stats: {
      tracked: rows.length,
      deadlinesThisMonth,
      sourcesLive,
      sourcesTotal: LIST_SOURCES.length,
      workshops: rows.filter((r) => r.type === "workshop").length,
    },
  };
}
