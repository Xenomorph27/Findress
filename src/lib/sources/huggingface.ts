import YAML from "yaml";
import { parseDateRange, parseSingleDate } from "@/lib/ingest/dates";
import { cleanAcronym, cleanText, dedupeKeyFor, normalizeUrl } from "@/lib/ingest/keys";
import { countryByName } from "@/lib/ingest/countries";
import { parsePlace } from "@/lib/ingest/places";
import {
  emptyEvent,
  validateEvents,
  type AdapterContext,
  type AdapterResult,
  type DeadlineInput,
  type EventInput,
  type SourceAdapter,
} from "@/lib/ingest/types";
import { wallClockToUtc } from "@/lib/time/tz";
import type { DeadlineKind } from "@/lib/taxonomy";

/**
 * Hugging Face ai-deadlines space: src/data/conferences/<name>.yml, a list of editions.
 * Two shapes exist upstream: the current `deadlines: [{type,label,date,timezone}]` list and a
 * legacy flat form (`deadline`, `abstract_deadline`, `timezone`, …). Both are handled.
 */
const SPACE = "huggingface/ai-deadlines";
const DATA_DIR = "src/data/conferences";

interface HfDeadline {
  type?: string;
  label?: string;
  date?: string;
  timezone?: string;
}
interface HfConf {
  title: string;
  year: number;
  id?: string;
  full_name?: string;
  link?: string;
  date?: string;
  start?: string | Date;
  end?: string | Date;
  city?: string;
  country?: string;
  venue?: string;
  tags?: string[];
  rankings?: string;
  note?: string;
  paperslink?: string;
  deadlines?: HfDeadline[];
  // legacy flat fields
  deadline?: string;
  abstract_deadline?: string;
  timezone?: string;
  rebuttal_period_end?: string;
  final_decision_date?: string;
  review_release_date?: string;
}

const TYPE_MAP: Record<string, DeadlineKind> = {
  abstract: "abstract",
  paper: "paper",
  submission: "paper",
  full_paper: "paper",
  supplementary: "supplementary",
  rebuttal: "rebuttal",
  rebuttal_start: "rebuttal",
  rebuttal_end: "rebuttal",
  author_response: "rebuttal",
  rebuttal_and_revision: "rebuttal",
  notification: "notification",
  "first-notification": "notification",
  "final-notification": "notification",
  camera_ready: "camera_ready",
  "camera-ready": "camera_ready",
  registration: "registration",
};

export function mapDeadlineType(type: string | undefined): DeadlineKind {
  return TYPE_MAP[(type ?? "").trim().toLowerCase()] ?? "other";
}

/** "CCF: A, CORE: A*, THCPL: A" → { ccf: "A", core: "A*" } ("N"/empty → null). */
export function parseRankings(text: string | undefined): {
  ccf: string | null;
  core: string | null;
} {
  const get = (key: string) => {
    const m = new RegExp(`${key}\\s*:\\s*([A-Z*]+)`, "i").exec(text ?? "");
    const v = m?.[1]?.toUpperCase();
    return v && v !== "N" ? v : null;
  };
  return { ccf: get("CCF"), core: get("CORE") };
}

function toIsoDate(v: string | Date | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  return parseSingleDate(String(v));
}

function mk(
  kind: DeadlineKind,
  text: string | undefined,
  tz: string | undefined,
  label: string | null,
): DeadlineInput | null {
  if (!text || typeof text !== "string") return null;
  const r = wallClockToUtc(text, tz);
  if (!r) return null;
  return {
    kind,
    label: cleanText(label),
    dueAtUtc: r.utc.toISOString(),
    originalTz: tz?.trim() || null,
    originalText: text.trim(),
    comment: null,
  };
}

export function normalizeHfFile(text: string, path: string): EventInput[] {
  const data = YAML.parse(text) as HfConf[] | null;
  if (!Array.isArray(data)) return [];
  const out: EventInput[] = [];
  for (const c of data) {
    if (!c?.title || !Number.isInteger(Number(c.year))) continue;
    const year = Number(c.year);
    const title = cleanAcronym(String(c.title));
    // "EMNLP (Industry Track)" is a track of EMNLP: own event, parent = the main conference.
    const track = /^(.*?)\s*\(([^)]*(?:track|demo)[^)]*)\)\s*$/i.exec(title);
    const parentKey = track ? dedupeKeyFor(track[1], year) : null;

    const deadlines: DeadlineInput[] = [];
    if (Array.isArray(c.deadlines) && c.deadlines.length > 0) {
      for (const d of c.deadlines) {
        const item = mk(mapDeadlineType(d.type), d.date, d.timezone, d.label ?? null);
        if (item) deadlines.push(item);
      }
    } else {
      for (const item of [
        mk("abstract", c.abstract_deadline, c.timezone, "Abstract deadline"),
        mk("paper", c.deadline, c.timezone, "Paper deadline"),
        mk("other", c.review_release_date, c.timezone, "Reviews released"),
        mk("rebuttal", c.rebuttal_period_end, c.timezone, "Rebuttal period ends"),
        mk("notification", c.final_decision_date, c.timezone, "Final decisions"),
      ]) {
        if (item) deadlines.push(item);
      }
    }

    // Location: prefer city + a recognised country; fall back to parsing the venue string
    // (upstream occasionally puts a US state in `country`).
    const knownCountry = countryByName(c.country);
    const place = knownCountry
      ? parsePlace(`${c.city ?? ""}, ${knownCountry.name}`)
      : parsePlace([c.venue, c.city, c.country].filter(Boolean).join(", "));
    const venuePlace = parsePlace(c.venue);
    const range =
      toIsoDate(c.start) != null
        ? { start: toIsoDate(c.start)!, end: toIsoDate(c.end) ?? toIsoDate(c.start)! }
        : parseDateRange(c.date, year);
    const rankings = parseRankings(c.rankings);
    const papers = normalizeUrl(c.paperslink);

    out.push({
      ...emptyEvent({
        source: "huggingface",
        sourceId: c.id ? String(c.id) : `${title}-${year}`,
        acronym: title,
        year,
      }),
      sourceUrl: `https://huggingface.co/spaces/${SPACE}/blob/main/${path}`,
      name: cleanText(c.full_name),
      type: "conference",
      parentKey,
      tags: (c.tags ?? []).map((t) => String(t).toLowerCase()),
      rankCcf: rankings.ccf,
      rankCore: rankings.core,
      mode: place.mode ?? venuePlace.mode,
      locationRaw: cleanText([c.venue, c.city, c.country].filter(Boolean).join(" · ")),
      venue: venuePlace.venue ?? cleanText(c.venue),
      city: cleanText(c.city) ?? place.city,
      country: place.country,
      countryCode: place.countryCode,
      startDate: range?.start ?? null,
      endDate: range?.end ?? null,
      dateText: cleanText(c.date),
      website: normalizeUrl(c.link),
      description: cleanText(c.note),
      submissionSite: papers && /openreview\.net\/group/.test(papers) ? papers : null,
      deadlines,
    });
  }
  return out;
}

interface HfTreeEntry {
  type: string;
  oid: string;
  path: string;
}

export const huggingfaceAdapter: SourceAdapter = {
  name: "huggingface",
  async run(ctx: AdapterContext): Promise<AdapterResult> {
    const warnings: string[] = [];
    const tree = await ctx.fetcher.getJson<HfTreeEntry[]>(
      `https://huggingface.co/api/spaces/${SPACE}/tree/main/${DATA_DIR}`,
      { minIntervalMs: 300 },
    );
    const files = tree.filter((t) => t.type === "file" && /\.ya?ml$/.test(t.path));
    const events: EventInput[] = [];
    let ok = 0;
    for (const f of files) {
      const url = `https://huggingface.co/spaces/${SPACE}/resolve/main/${f.path}`;
      try {
        const text = await ctx.fetcher.getText(url, {
          cacheKey: `${url}?oid=${f.oid}`,
          cacheTtlMs: 60 * 24 * 3600_000,
          minIntervalMs: 300,
        });
        events.push(...normalizeHfFile(text, f.path));
        ok++;
      } catch (err) {
        warnings.push(`${f.path}: ${(err as Error).message}`);
      }
    }
    const valid = validateEvents(events, warnings);
    return {
      events: valid,
      warnings,
      pruneStale: ok > 0 && ok >= files.length / 2,
      stats: { files: ok, editions: valid.length },
    };
  },
};
