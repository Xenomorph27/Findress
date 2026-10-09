import "server-only";
import { and, eq, gte } from "drizzle-orm";
import { cacheTag } from "next/cache";
import { getDb } from "@/lib/db";
import { sourceRuns } from "@/lib/db/schema";
import { inDefaultScope, nextDeadline } from "@/lib/explore/filters";
import { clusterVenues, type VenueCluster } from "@/lib/landing/venues";
import { LIST_SOURCES } from "@/lib/taxonomy";
import { getExplorerRows } from "./events";
import { getJournalRows, getSpecialIssueRows } from "./journals";
import { settle, type Settled, unwrap } from "./settle";

/** Sources counted as "live" on the landing page: event lists plus the journal pipeline. */
const LIVE_SOURCES: readonly string[] = [...LIST_SOURCES, "journals", "special-issues"];

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
  /** Venue clusters (by city) for the landing globe: current editions with a location. */
  venues: VenueCluster[];
  stats: {
    /** Current editions (the /explore default view), split by kind. */
    conferences: number;
    workshops: number;
    journals: number;
    openSpecialIssues: number;
    deadlinesThisMonth: number;
    sourcesLive: number;
    sourcesTotal: number;
  };
}

export async function getLandingData(): Promise<LandingData> {
  return unwrap(await getLandingDataCached());
}

async function getLandingDataCached(): Promise<Settled<LandingData>> {
  "use cache";
  cacheTag("events", "journals");
  return settle("hours", () => getLandingDataQuery());
}

async function getLandingDataQuery(): Promise<LandingData> {
  const now = Date.now();
  const [allRows, journals, specials] = await Promise.all([
    getExplorerRows(),
    getJournalRows(),
    getSpecialIssueRows(),
  ]);
  const rows = allRows.filter((r) => !r.communityOnly);
  const current = rows.filter((r) => inDefaultScope(r, now));

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

  const venues = clusterVenues(current, now);

  const monthStart = new Date(now);
  const startMs = Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1);
  const endMs = Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1);
  const deadlinesThisMonth =
    rows.reduce(
      (n, r) => n + r.deadlines.filter((d) => d.at >= startMs && d.at < endMs).length,
      0,
    ) + specials.filter((s) => s.at != null && s.at >= startMs && s.at < endMs).length;

  let sourcesLive = 0;
  const db = getDb();
  if (db) {
    const since = new Date(now - 48 * 3600_000);
    const live = await db
      .select({ source: sourceRuns.source })
      .from(sourceRuns)
      .where(and(eq(sourceRuns.ok, true), gte(sourceRuns.startedAt, since)))
      .groupBy(sourceRuns.source);
    sourcesLive = live.filter((l) => LIVE_SOURCES.includes(l.source)).length;
  }

  return {
    next,
    venues,
    stats: {
      conferences: current.filter((r) => r.type !== "workshop").length,
      workshops: current.filter((r) => r.type === "workshop").length,
      journals: journals.length,
      openSpecialIssues: specials.filter((s) => s.at != null && s.at >= now).length,
      deadlinesThisMonth,
      sourcesLive,
      sourcesTotal: LIVE_SOURCES.length,
    },
  };
}
