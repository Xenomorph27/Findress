import { SOURCE_PRIORITY, type DeadlineKind, type SourceName } from "@/lib/taxonomy";
import { dedupeKeyFor, seriesKeyFor } from "./keys";
import type { DeadlineInput, EventInput } from "./types";

/**
 * Cross-source merge. Inputs with the same normalized acronym + year become one event.
 * Every field is taken from the most trusted source that has it (SOURCE_PRIORITY) and the
 * winner is recorded in `provenance`, so the UI can show where each fact came from.
 */

export interface MergedDeadline extends DeadlineInput {
  source: SourceName;
}

export interface MergedEvent {
  dedupeKey: string;
  seriesKey: string;
  slug: string;
  acronym: string;
  name: string | null;
  year: number;
  type: EventInput["type"];
  parentKey: string | null;
  tags: string[];
  rankCore: string | null;
  rankCcf: string | null;
  mode: EventInput["mode"];
  locationRaw: string | null;
  venue: string | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  startDate: string | null;
  endDate: string | null;
  dateText: string | null;
  website: string | null;
  description: string | null;
  submissionSite: string | null;
  reviewType: string | null;
  deadlines: MergedDeadline[];
  sources: SourceName[];
  provenance: Record<string, SourceName>;
  refs: { source: SourceName; sourceId: string; url: string | null; fields: string[] }[];
}

const SCALAR_FIELDS = [
  "name",
  "type",
  "parentKey",
  "rankCore",
  "rankCcf",
  "website",
  "description",
  "submissionSite",
  "reviewType",
] as const;

/** Location (and, below, dates) are taken as a unit from one source, never mixed field by field. */
const LOCATION_FIELDS = ["locationRaw", "venue", "city", "country", "countryCode", "mode"] as const;

const byPriority = (a: EventInput, b: EventInput) =>
  SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source] || a.sourceId.localeCompare(b.sourceId);

function providedFields(e: EventInput): string[] {
  const fields: string[] = [];
  for (const [k, v] of Object.entries(e)) {
    if (["source", "sourceId", "sourceUrl", "acronym", "year", "tags", "subfields"].includes(k))
      continue;
    if (Array.isArray(v) ? v.length > 0 : v != null) fields.push(k);
  }
  return fields;
}

export function mergeGroup(group: EventInput[]): MergedEvent {
  const items = [...group].sort(byPriority);
  const top = items[0];
  const dedupeKey = dedupeKeyFor(top.acronym, top.year);
  const provenance: Record<string, SourceName> = {};

  const pick = <K extends keyof EventInput>(field: K): EventInput[K] | null => {
    for (const it of items) {
      const v = it[field];
      if (v != null && v !== "") {
        provenance[field] = it.source;
        return v;
      }
    }
    return null;
  };

  const scalars = Object.fromEntries(SCALAR_FIELDS.map((f) => [f, pick(f)])) as {
    [K in (typeof SCALAR_FIELDS)[number]]: EventInput[K] | null;
  };

  const locSource = items.find((it) => it.city || it.countryCode || it.country);
  const loc = Object.fromEntries(
    LOCATION_FIELDS.map((f) => [f, locSource ? (locSource[f] ?? null) : null]),
  ) as { [K in (typeof LOCATION_FIELDS)[number]]: EventInput[K] | null };
  if (locSource)
    for (const f of LOCATION_FIELDS) if (locSource[f] != null) provenance[f] = locSource.source;
  // Mode can be stated by a source that has no address (e.g. "Online" on WikiCFP).
  if (!loc.mode) loc.mode = pick("mode");

  // Prefer dates that belong to this edition: a source still carrying last year's dates under
  // the new year (seen upstream for UAI 2026) loses to one whose start year matches.
  const dateSource =
    items.find((it) => it.startDate?.startsWith(String(it.year))) ??
    items.find((it) => it.startDate);
  const dates = {
    startDate: dateSource?.startDate ?? null,
    endDate: dateSource?.endDate ?? null,
    dateText: dateSource?.dateText ?? pick("dateText"),
  };
  if (dateSource) {
    provenance.startDate = dateSource.source;
    if (dateSource.endDate) provenance.endDate = dateSource.source;
  }

  // Deadlines: per kind, every entry of that kind from the most trusted source that has it.
  const deadlines: MergedDeadline[] = [];
  const kinds = new Set<DeadlineKind>(items.flatMap((it) => it.deadlines.map((d) => d.kind)));
  for (const kind of kinds) {
    const owner = items.find((it) => it.deadlines.some((d) => d.kind === kind))!;
    for (const d of owner.deadlines)
      if (d.kind === kind) deadlines.push({ ...d, source: owner.source });
    provenance[`deadline:${kind}`] = owner.source;
  }
  deadlines.sort((a, b) => a.dueAtUtc.localeCompare(b.dueAtUtc));

  const sources = [...new Set(items.map((i) => i.source))];
  return {
    dedupeKey,
    seriesKey: seriesKeyFor(top.acronym),
    slug: dedupeKey,
    acronym: top.acronym,
    year: top.year,
    ...scalars,
    type: scalars.type ?? "conference",
    parentKey: scalars.parentKey && scalars.parentKey !== dedupeKey ? scalars.parentKey : null,
    tags: [...new Set(items.flatMap((i) => i.tags))],
    ...loc,
    ...dates,
    deadlines,
    sources,
    provenance,
    refs: items.map((it) => ({
      source: it.source,
      sourceId: it.sourceId,
      url: it.sourceUrl,
      fields: providedFields(it),
    })),
  };
}

export function mergeEventInputs(inputs: EventInput[]): MergedEvent[] {
  const groups = new Map<string, EventInput[]>();
  for (const e of inputs) {
    const key = dedupeKeyFor(e.acronym, e.year);
    const g = groups.get(key);
    if (g) g.push(e);
    else groups.set(key, [e]);
  }
  const merged = [...groups.values()].map(mergeGroup);

  // One display acronym per series ("KDD", not "SIGKDD" for the ccfddl-only 2027 edition and
  // "KDD" for 2026): the spelling of the most trusted source across all its editions.
  const best = new Map<string, { acronym: string; rank: number }>();
  for (const e of inputs) {
    if (e.type === "workshop") continue;
    const key = seriesKeyFor(e.acronym);
    const rank = SOURCE_PRIORITY[e.source];
    const cur = best.get(key);
    if (!cur || rank < cur.rank) best.set(key, { acronym: e.acronym, rank });
  }
  return merged.map((m) => {
    const display = best.get(m.seriesKey)?.acronym;
    return display && m.type !== "workshop" ? { ...m, acronym: display } : m;
  });
}
