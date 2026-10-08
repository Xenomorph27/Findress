import YAML from "yaml";
import { parseDateRange } from "@/lib/ingest/dates";
import { cleanAcronym, cleanText, normalizeUrl, seriesKeyFor } from "@/lib/ingest/keys";
import { parsePlace } from "@/lib/ingest/places";
import {
  emptyEvent,
  validateEvents,
  type AcceptanceInput,
  type AdapterContext,
  type AdapterResult,
  type DeadlineInput,
  type EventInput,
  type SourceAdapter,
} from "@/lib/ingest/types";
import { wallClockToUtc } from "@/lib/time/tz";
import type { DeadlineKind } from "@/lib/taxonomy";

/**
 * ccfddl/ccf-deadlines — YAML per conference series under conference/<SUB>/<name>.yml, plus
 * acceptance rates under accept_rates/<SUB>/<name>.yml. We take every `AI` file and the
 * AI-relevant venues filed under other categories.
 */
const REPO = "ccfddl/ccf-deadlines";
const BRANCH = "main";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;
const BLOB_BASE = `https://github.com/${REPO}/blob/${BRANCH}/`;

export const AI_RELEVANT_OUTSIDE_AI: Record<string, string[]> = {
  DB: ["cikm", "ecir", "icdm", "pakdd", "pkdd", "recsys", "sdm", "sigir", "sigkdd", "wsdm"],
  MX: ["cogsci", "icaif", "miccai", "mlsys", "www"],
  HI: ["chi", "iui", "icmi", "icwsm"],
  CG: ["3dv", "icassp", "icip", "icme", "icmr", "interspeech", "mm", "slt"],
};

export function selectPaths(paths: string[]): { conferences: string[]; acceptRates: string[] } {
  const wanted = (p: string, root: string) => {
    const m = new RegExp(`^${root}/([A-Z]+)/([^/]+)\\.yml$`).exec(p);
    if (!m) return false;
    const [, sub, name] = m;
    return sub === "AI" || (AI_RELEVANT_OUTSIDE_AI[sub]?.includes(name) ?? false);
  };
  return {
    conferences: paths.filter((p) => wanted(p, "conference")),
    acceptRates: paths.filter((p) => wanted(p, "accept_rates")),
  };
}

interface CcfTimeline {
  deadline?: string;
  abstract_deadline?: string;
  rebuttal_deadline?: string;
  decision_deadline?: string;
  comment?: string;
}
interface CcfConf {
  year: number;
  id?: string;
  link?: string;
  timeline?: CcfTimeline[];
  timezone?: string;
  date?: string;
  place?: string;
}
interface CcfSeries {
  title: string;
  description?: string;
  sub?: string;
  rank?: { ccf?: string; core?: string; thcpl?: string };
  dblp?: string;
  confs?: CcfConf[];
}

const rankOrNull = (r: string | undefined) => {
  const v = r?.trim();
  return v && v !== "N" && v !== "-" ? v : null;
};

function deadline(
  kind: DeadlineKind,
  text: unknown,
  tz: string | undefined,
  label: string | null,
  comment: string | null,
): DeadlineInput | null {
  if (typeof text !== "string" || !text.trim()) return null;
  const resolved = wallClockToUtc(text, tz);
  if (!resolved) return null;
  return {
    kind,
    label,
    dueAtUtc: resolved.utc.toISOString(),
    originalTz: tz?.trim() || null,
    originalText: text.trim(),
    comment,
  };
}

/** Normalize one conference/<SUB>/<name>.yml file into one EventInput per edition. */
export function normalizeConferenceFile(text: string, path: string): EventInput[] {
  const data = YAML.parse(text) as CcfSeries[] | null;
  if (!Array.isArray(data)) return [];
  const out: EventInput[] = [];
  for (const series of data) {
    if (!series?.title) continue;
    const acronym = cleanAcronym(String(series.title));
    for (const conf of series.confs ?? []) {
      const year = Number(conf.year);
      if (!Number.isInteger(year)) continue;
      const place = parsePlace(conf.place);
      const range = parseDateRange(conf.date, year);
      const timeline = conf.timeline ?? [];
      const deadlines: DeadlineInput[] = [];
      timeline.forEach((t, i) => {
        const label = timeline.length > 1 ? `Cycle ${i + 1}` : null;
        const comment = cleanText(t.comment);
        for (const d of [
          deadline("abstract", t.abstract_deadline, conf.timezone, label, null),
          deadline("paper", t.deadline, conf.timezone, label, comment),
          deadline("rebuttal", t.rebuttal_deadline, conf.timezone, label, null),
          deadline("notification", t.decision_deadline, conf.timezone, label, null),
        ]) {
          if (d) deadlines.push(d);
        }
      });

      out.push({
        ...emptyEvent({
          source: "ccfddl",
          sourceId: conf.id ? String(conf.id) : `${seriesKeyFor(acronym)}${year}`,
          acronym,
          year,
        }),
        sourceUrl: `${BLOB_BASE}${path}`,
        name: cleanText(series.description),
        tags: series.sub ? [`ccf:${series.sub}`] : [],
        rankCcf: rankOrNull(series.rank?.ccf),
        rankCore: rankOrNull(series.rank?.core),
        mode: place.mode,
        locationRaw: cleanText(conf.place),
        venue: place.venue,
        city: place.city,
        country: place.country,
        countryCode: place.countryCode,
        startDate: range?.start ?? null,
        endDate: range?.end ?? null,
        dateText: cleanText(conf.date),
        website: normalizeUrl(conf.link),
        deadlines,
      });
    }
  }
  return out;
}

interface CcfAcceptFile {
  title: string;
  accept_rates?: {
    year: number;
    submitted?: number;
    accepted?: number;
    rate?: number;
    source?: string;
  }[];
}

export function normalizeAcceptRates(text: string): AcceptanceInput[] {
  const data = YAML.parse(text) as CcfAcceptFile[] | null;
  if (!Array.isArray(data)) return [];
  const out: AcceptanceInput[] = [];
  for (const item of data) {
    if (!item?.title) continue;
    const seriesKey = seriesKeyFor(String(item.title));
    for (const r of item.accept_rates ?? []) {
      const year = Number(r.year);
      if (!Number.isInteger(year)) continue;
      const submitted = Number.isFinite(r.submitted) ? Number(r.submitted) : null;
      const accepted = Number.isFinite(r.accepted) ? Number(r.accepted) : null;
      let rate = Number.isFinite(r.rate) ? Number(r.rate) : null;
      if (rate == null && submitted && accepted != null) rate = accepted / submitted;
      out.push({
        seriesKey,
        year,
        submitted,
        accepted,
        rate: rate != null && rate >= 0 && rate <= 1 ? rate : null,
        sourceUrl: r.source ?? null,
      });
    }
  }
  return out;
}

interface TreeResponse {
  tree: { path: string; type: string; sha: string }[];
  truncated: boolean;
}

export const ccfddlAdapter: SourceAdapter = {
  name: "ccfddl",
  async run(ctx: AdapterContext): Promise<AdapterResult> {
    const warnings: string[] = [];
    const headers: Record<string, string> = { "X-GitHub-Api-Version": "2022-11-28" };
    if (ctx.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${ctx.env.GITHUB_TOKEN}`;
    const tree = await ctx.fetcher.getJson<TreeResponse>(
      `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`,
      { headers, minIntervalMs: 250 },
    );
    const shaByPath = new Map(
      tree.tree.filter((t) => t.type === "blob").map((t) => [t.path, t.sha]),
    );
    const { conferences, acceptRates } = selectPaths([...shaByPath.keys()]);

    const load = async (path: string) => {
      const url = `${RAW_BASE}${path}`;
      // Cache by blob SHA: unchanged files are never downloaded twice.
      return ctx.fetcher.getText(url, {
        cacheKey: `${url}?sha=${shaByPath.get(path)}`,
        cacheTtlMs: 60 * 24 * 3600_000,
        minIntervalMs: 250,
      });
    };

    const events: EventInput[] = [];
    const acceptance: AcceptanceInput[] = [];
    let files = 0;
    for (const path of conferences) {
      try {
        events.push(...normalizeConferenceFile(await load(path), path));
        files++;
      } catch (err) {
        warnings.push(`${path}: ${(err as Error).message}`);
      }
    }
    for (const path of acceptRates) {
      try {
        acceptance.push(...normalizeAcceptRates(await load(path)));
      } catch (err) {
        warnings.push(`${path}: ${(err as Error).message}`);
      }
    }
    const valid = validateEvents(events, warnings);
    return {
      events: valid,
      acceptance,
      warnings,
      pruneStale: files > 0 && warnings.length < conferences.length / 2,
      stats: { files, editions: valid.length, acceptanceRows: acceptance.length },
    };
  },
};
