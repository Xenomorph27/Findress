import { z } from "zod";
import { DEADLINE_KINDS, EVENT_TYPES, MODES, SOURCES, type SourceName } from "@/lib/taxonomy";
import type { PoliteFetcher } from "./http";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const nullableText = (max: number) => z.string().trim().max(max).nullable();

export const DeadlineInputSchema = z.object({
  kind: z.enum(DEADLINE_KINDS),
  label: nullableText(200),
  /** UTC instant, ISO-8601. */
  dueAtUtc: z.iso.datetime(),
  /** Zone exactly as the source wrote it; null when the source gave none. */
  originalTz: nullableText(60),
  /** Local wall-clock text as the source wrote it. */
  originalText: nullableText(60),
  comment: nullableText(1000),
});
export type DeadlineInput = z.infer<typeof DeadlineInputSchema>;

/** One event as reported by one source, after normalization. Validated before it is stored. */
export const EventInputSchema = z.object({
  source: z.enum(SOURCES),
  sourceId: z.string().min(1).max(300),
  sourceUrl: z.url().nullable(),
  acronym: z.string().trim().min(1).max(80),
  name: nullableText(400),
  year: z.number().int().min(1990).max(2100),
  type: z.enum(EVENT_TYPES),
  /** Dedupe key of the parent event (e.g. "neurips-2026") for workshops and tracks. */
  parentKey: z.string().max(120).nullable(),
  subfields: z.array(z.string()).default([]),
  /** Free-form tags provided by the source (normalized later by topic tagging). */
  tags: z.array(z.string().max(80)).default([]),
  rankCore: nullableText(8),
  rankCcf: nullableText(8),
  mode: z.enum(MODES).nullable(),
  locationRaw: nullableText(300),
  venue: nullableText(300),
  city: nullableText(120),
  country: nullableText(120),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
  startDate: isoDate.nullable(),
  endDate: isoDate.nullable(),
  dateText: nullableText(200),
  website: z.url().nullable(),
  description: nullableText(4000),
  submissionSite: z.url().nullable(),
  reviewType: nullableText(60),
  deadlines: z.array(DeadlineInputSchema),
});
export type EventInput = z.infer<typeof EventInputSchema>;

export const AcceptanceInputSchema = z.object({
  seriesKey: z.string().min(1),
  year: z.number().int().min(1950).max(2100),
  submitted: z.number().int().nonnegative().nullable(),
  accepted: z.number().int().nonnegative().nullable(),
  rate: z.number().min(0).max(1).nullable(),
  sourceUrl: z.string().nullable(),
});
export type AcceptanceInput = z.infer<typeof AcceptanceInputSchema>;

/** Blank EventInput with every optional field null — adapters spread over it. */
export function emptyEvent(
  base: Pick<EventInput, "source" | "sourceId" | "acronym" | "year">,
): EventInput {
  return {
    sourceUrl: null,
    name: null,
    type: "conference",
    parentKey: null,
    subfields: [],
    tags: [],
    rankCore: null,
    rankCcf: null,
    mode: null,
    locationRaw: null,
    venue: null,
    city: null,
    country: null,
    countryCode: null,
    startDate: null,
    endDate: null,
    dateText: null,
    website: null,
    description: null,
    submissionSite: null,
    reviewType: null,
    deadlines: [],
    ...base,
  };
}

export interface AdapterContext {
  fetcher: PoliteFetcher;
  /** Wall-clock deadline for this run (ms epoch); adapters stop optional work when exceeded. */
  deadlineMs: number;
  now: Date;
  log: (message: string) => void;
  /** Previously stored payloads for this source, keyed by sourceId (used to keep enrichment). */
  previous: Map<string, EventInput>;
  env: Record<string, string | undefined>;
}

export interface AdapterResult {
  events: EventInput[];
  acceptance?: AcceptanceInput[];
  warnings: string[];
  stats: Record<string, number>;
  /** When false, the source is a rolling window and stale items must not be pruned. */
  pruneStale: boolean;
}

export interface SourceAdapter {
  name: SourceName;
  run(ctx: AdapterContext): Promise<AdapterResult>;
}

/** Validate a batch, dropping (and reporting) invalid items instead of failing the source. */
export function validateEvents(items: EventInput[], warnings: string[]): EventInput[] {
  const ok: EventInput[] = [];
  for (const item of items) {
    const parsed = EventInputSchema.safeParse(item);
    if (parsed.success) ok.push(parsed.data);
    else {
      const issue = parsed.error.issues[0];
      warnings.push(
        `invalid ${item.source}:${item.sourceId} — ${issue?.path.join(".")}: ${issue?.message}`,
      );
    }
  }
  return ok;
}
