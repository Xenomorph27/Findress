import "server-only";
import { desc, inArray } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/lib/db";
import { acceptanceStats, events } from "@/lib/db/schema";
import {
  computeSlice,
  type AcceptanceSeriesInput,
  type InsightsSlice,
} from "@/lib/insights/compute";
import { SUBFIELDS } from "@/lib/taxonomy";
import { getExplorerRows } from "./events";

/** Flagship series shown in the acceptance-rate chart (first six that have data). */
const FLAGSHIPS = [
  "neurips",
  "icml",
  "iclr",
  "cvpr",
  "acl",
  "aaai",
  "emnlp",
  "kdd",
  "iccv",
  "ijcai",
  "eccv",
  "naacl",
  "sigir",
  "www",
  "interspeech",
  "icra",
];

async function acceptanceSeries(): Promise<AcceptanceSeriesInput[]> {
  const db = getDb();
  if (!db) return [];
  const stats = await db
    .select()
    .from(acceptanceStats)
    .where(inArray(acceptanceStats.eventAcronym, FLAGSHIPS));
  const latest = await db
    .select({
      seriesKey: events.seriesKey,
      slug: events.slug,
      acronym: events.acronym,
      year: events.year,
      subfields: events.subfields,
    })
    .from(events)
    .where(inArray(events.seriesKey, FLAGSHIPS))
    .orderBy(desc(events.year));
  const meta = new Map<string, (typeof latest)[number]>();
  for (const l of latest) if (!meta.has(l.seriesKey)) meta.set(l.seriesKey, l);

  const out: AcceptanceSeriesInput[] = [];
  for (const key of FLAGSHIPS) {
    const points = stats
      .filter((s) => s.eventAcronym === key && s.rate != null)
      .map((s) => ({ year: s.year, rate: s.rate! }))
      .sort((a, b) => a.year - b.year);
    if (points.length < 3) continue;
    const m = meta.get(key);
    out.push({
      seriesKey: key,
      label: m?.acronym ?? key.toUpperCase(),
      slug: m?.slug ?? null,
      subfields: m?.subfields ?? [],
      points,
    });
  }
  return out;
}

export interface InsightsPayload {
  generatedAt: number;
  slices: Record<string, InsightsSlice>;
}

export async function getInsightsPayload(): Promise<InsightsPayload> {
  "use cache";
  cacheLife("hours");
  cacheTag("events");
  const now = Date.now();
  const [rows, acceptance] = await Promise.all([getExplorerRows(), acceptanceSeries()]);
  const slices: Record<string, InsightsSlice> = { all: computeSlice(rows, acceptance, null, now) };
  for (const s of SUBFIELDS) slices[s.id] = computeSlice(rows, acceptance, s.id, now);
  return { generatedAt: now, slices };
}
