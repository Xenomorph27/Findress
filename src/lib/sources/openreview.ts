import { parseSingleDate } from "@/lib/ingest/dates";
import { cleanAcronym, cleanText, dedupeKeyFor, normalizeUrl } from "@/lib/ingest/keys";
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

/**
 * OpenReview API v2 (api2.openreview.net): venue groups and their workshop sub-groups.
 * Workshops of a parent are `GET /groups?parent=<Venue>/<year>/Workshop`; the submission
 * deadline is in `content.date` ("Submission Deadline: Sep 05 2026 11:59AM UTC-0") or, when
 * empty, the `duedate` of the Submission invitation (requires `expired=true` once closed).
 */
const API = "https://api2.openreview.net";
/** api2.openreview.net rate-limits bursts; stay well under it. */
const OR_INTERVAL_MS = 1500;

export const OPENREVIEW_VENUES: { series: string; label: string; prefix: string }[] = [
  { series: "neurips", label: "NeurIPS", prefix: "NeurIPS.cc" },
  { series: "icml", label: "ICML", prefix: "ICML.cc" },
  { series: "iclr", label: "ICLR", prefix: "ICLR.cc" },
  { series: "colm", label: "COLM", prefix: "colmweb.org/COLM" },
  { series: "acl", label: "ACL", prefix: "aclweb.org/ACL" },
  { series: "emnlp", label: "EMNLP", prefix: "EMNLP" },
  { series: "naacl", label: "NAACL", prefix: "aclweb.org/NAACL" },
  { series: "cvpr", label: "CVPR", prefix: "thecvf.com/CVPR" },
  { series: "aaai", label: "AAAI", prefix: "AAAI.org" },
  { series: "uai", label: "UAI", prefix: "auai.org/UAI" },
];

type Value<T> = { value?: T };
export interface OrGroup {
  id: string;
  parent?: string;
  content?: {
    title?: Value<string>;
    subtitle?: Value<string>;
    website?: Value<string>;
    location?: Value<string>;
    start_date?: Value<string | number>;
    date?: Value<string>;
    submission_id?: Value<string>;
  };
}

const MONTH = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i;

/** "Sep 05 2026 11:59AM UTC-0" → { local: "2026-09-05 11:59", tz: "UTC-0" }. */
export function parseOrDateTime(text: string): { local: string; tz: string | null } | null {
  const m =
    /\b([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)?\s*((?:UTC|GMT)[+-]?\d{0,2}(?::?\d{2})?)?/i.exec(
      text,
    );
  if (!m || !MONTH.test(m[1])) return null;
  const date = parseSingleDate(`${m[1]} ${m[2]}, ${m[3]}`);
  if (!date) return null;
  let h = Number(m[4]);
  const ampm = m[6]?.toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return { local: `${date} ${String(h).padStart(2, "0")}:${m[5]}`, tz: m[7] ?? null };
}

function startDateOf(v: string | number | undefined): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return new Date(v).toISOString().slice(0, 10);
  return parseSingleDate(v);
}

function submissionDeadline(group: OrGroup, duedateMs: number | null): DeadlineInput | null {
  const text = group.content?.date?.value ?? "";
  const m = /Submission Deadline:\s*([^,]+)/i.exec(text);
  const parsed = m ? parseOrDateTime(m[1]) : null;
  if (parsed) {
    const r = wallClockToUtc(parsed.local, parsed.tz ?? "UTC");
    if (r) {
      return {
        kind: "paper",
        label: "Submission deadline",
        dueAtUtc: r.utc.toISOString(),
        originalTz: parsed.tz ?? "UTC",
        originalText: m![1].trim(),
        comment: null,
      };
    }
  }
  if (duedateMs) {
    const d = new Date(duedateMs);
    return {
      kind: "paper",
      label: "Submission deadline",
      dueAtUtc: d.toISOString(),
      originalTz: "UTC",
      originalText: d.toISOString().replace("T", " ").slice(0, 16),
      comment: "From the OpenReview submission invitation.",
    };
  }
  return null;
}

const VENUE_PREFIX = /^(?:the\s+)?(?:[A-Za-z]+\s+)?\d{4}\s+workshop\s*(?:on)?\s*[:\-–]?\s*/i;

/** Normalize one workshop group ("<Venue>/<year>/Workshop/<ACR>"). */
export function normalizeWorkshop(
  group: OrGroup,
  venue: { series: string; label: string },
  duedateMs: number | null,
): EventInput | null {
  const parts = group.id.split("/");
  const segment = parts.at(-1);
  const year = Number(parts.at(-3));
  if (!segment || !Number.isInteger(year)) return null;
  const c = group.content ?? {};
  const place = parsePlace(c.location?.value);
  const title = cleanText(c.title?.value);
  const deadline = submissionDeadline(group, duedateMs);
  const url = `https://openreview.net/group?id=${group.id}`;
  return {
    ...emptyEvent({
      source: "openreview",
      sourceId: group.id,
      acronym: cleanAcronym(segment),
      year,
    }),
    sourceUrl: url,
    name: title ? title.replace(VENUE_PREFIX, "").trim() || title : null,
    type: "workshop",
    parentKey: `${venue.series}-${year}`,
    tags: [`openreview:${venue.label}`],
    mode: place.mode,
    locationRaw: cleanText(c.location?.value),
    venue: place.venue,
    city: place.city,
    country: place.country,
    countryCode: place.countryCode,
    startDate: startDateOf(c.start_date?.value),
    website: normalizeUrl(c.website?.value),
    submissionSite: url,
    deadlines: deadline ? [deadline] : [],
  };
}

/** Normalize a main-conference group ("<Venue>/<year>/Conference"). */
export function normalizeConference(
  group: OrGroup,
  venue: { series: string; label: string },
  duedateMs: number | null,
): EventInput | null {
  const parts = group.id.split("/");
  const year = Number(parts.at(-2));
  if (!Number.isInteger(year)) return null;
  const c = group.content ?? {};
  const place = parsePlace(c.location?.value);
  const deadline = submissionDeadline(group, duedateMs);
  const url = `https://openreview.net/group?id=${group.id}`;
  return {
    ...emptyEvent({ source: "openreview", sourceId: group.id, acronym: venue.label, year }),
    sourceUrl: url,
    name: cleanText(c.title?.value),
    tags: [`openreview:${venue.label}`],
    mode: place.mode,
    locationRaw: cleanText(c.location?.value),
    venue: place.venue,
    city: place.city,
    country: place.country,
    countryCode: place.countryCode,
    startDate: startDateOf(c.start_date?.value),
    website: normalizeUrl(c.website?.value),
    submissionSite: url,
    deadlines: deadline ? [deadline] : [],
  };
}

/** Same workshop acronym under two parents in one year → disambiguate with the parent. */
export function disambiguate(events: EventInput[]): EventInput[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    const k = dedupeKeyFor(e.acronym, e.year);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return events.map((e) => {
    if (e.type !== "workshop" || (counts.get(dedupeKeyFor(e.acronym, e.year)) ?? 0) < 2) return e;
    const parent = e.parentKey?.replace(/-\d{4}$/, "").toUpperCase() ?? "";
    return { ...e, acronym: `${e.acronym}@${parent}` };
  });
}

interface GroupsResponse {
  groups?: OrGroup[];
}
interface InvitationsResponse {
  invitations?: { duedate?: number }[];
}

export const openreviewAdapter: SourceAdapter = {
  name: "openreview",
  async run(ctx: AdapterContext): Promise<AdapterResult> {
    const warnings: string[] = [];
    const year = ctx.now.getUTCFullYear();
    const years = [year, year + 1];
    const events: EventInput[] = [];
    let groupsSeen = 0;
    let invitations = 0;
    const nowMs = ctx.now.getTime();

    const dueDate = async (group: OrGroup): Promise<number | null> => {
      if (/Submission Deadline:/i.test(group.content?.date?.value ?? "")) return null;
      const subId = group.content?.submission_id?.value ?? `${group.id}/-/Submission`;
      if (Date.now() + 1500 > ctx.deadlineMs) return null;
      try {
        invitations++;
        const res = await ctx.fetcher.getJson<InvitationsResponse>(
          `${API}/invitations?id=${encodeURIComponent(subId)}&expired=true`,
          { cacheTtlMs: 12 * 3600_000, minIntervalMs: OR_INTERVAL_MS },
        );
        return res.invitations?.[0]?.duedate ?? null;
      } catch {
        return null;
      }
    };

    for (const venue of OPENREVIEW_VENUES) {
      for (const y of years) {
        if (Date.now() + 2000 > ctx.deadlineMs) {
          warnings.push("time budget reached before all venues were listed");
          break;
        }
        try {
          const conf = await ctx.fetcher.getJson<GroupsResponse>(
            `${API}/groups?id=${encodeURIComponent(`${venue.prefix}/${y}/Conference`)}`,
            { cacheTtlMs: 6 * 3600_000, minIntervalMs: OR_INTERVAL_MS },
          );
          for (const g of conf.groups ?? []) {
            groupsSeen++;
            const e = normalizeConference(g, venue, await dueDate(g));
            if (e) events.push(e);
          }
        } catch (err) {
          if (!/HTTP (400|403|404)/.test((err as Error).message)) {
            warnings.push(`${venue.prefix}/${y}/Conference: ${(err as Error).message}`);
          }
        }
        try {
          const ws = await ctx.fetcher.getJson<GroupsResponse>(
            `${API}/groups?parent=${encodeURIComponent(`${venue.prefix}/${y}/Workshop`)}`,
            { cacheTtlMs: 6 * 3600_000, minIntervalMs: OR_INTERVAL_MS },
          );
          for (const g of ws.groups ?? []) {
            groupsSeen++;
            // Only look up invitation due dates for workshops that haven't happened yet.
            const start = startDateOf(g.content?.start_date?.value);
            const upcoming = !start || Date.parse(start) > nowMs - 7 * 86400_000;
            const e = normalizeWorkshop(g, venue, upcoming ? await dueDate(g) : null);
            if (e) events.push(e);
          }
        } catch (err) {
          if (!/HTTP (400|403|404)/.test((err as Error).message)) {
            warnings.push(`${venue.prefix}/${y}/Workshop: ${(err as Error).message}`);
          }
        }
      }
    }
    const valid = validateEvents(disambiguate(events), warnings);
    return {
      events: valid,
      warnings,
      pruneStale: groupsSeen > 0 && warnings.length === 0,
      stats: {
        groups: groupsSeen,
        events: valid.length,
        workshops: valid.filter((e) => e.type === "workshop").length,
        invitations,
      },
    };
  },
};
