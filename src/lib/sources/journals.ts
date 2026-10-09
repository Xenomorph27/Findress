import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import { parseHTML } from "linkedom";
import { z } from "zod";
import type { JournalSeed } from "@/data/journals-seed";
import { parseSingleDate } from "@/lib/ingest/dates";
import { cleanText, normalizeUrl } from "@/lib/ingest/keys";
import { wallClockToUtc } from "@/lib/time/tz";
import { htmlToStructuredText } from "./cfp";
import { parseEventPage, parseFeed, type WikiCfpFeedItem } from "./wikicfp";

/**
 * Journal sources (pure parsers; the ingest step in src/lib/ingest/journals.ts fetches).
 * Every mapper keeps only what the upstream states; unknown stays null.
 */

/* ------------------------------------------------------------------ OpenAlex */

const num = z.number().nullable().optional();
export const OpenAlexSourceSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  issn_l: z.string().nullable().optional(),
  issn: z.array(z.string()).nullable().optional(),
  host_organization_name: z.string().nullable().optional(),
  homepage_url: z.string().nullable().optional(),
  works_count: num,
  cited_by_count: num,
  is_oa: z.boolean().nullable().optional(),
  is_in_doaj: z.boolean().nullable().optional(),
  is_high_oa_rate: z.boolean().nullable().optional(),
  apc_usd: num,
  apc_prices: z
    .array(
      z.object({
        price: z.number().nullable().optional(),
        currency: z.string().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
  summary_stats: z
    .object({
      h_index: num,
      i10_index: num,
      "2yr_mean_citedness": num,
    })
    .nullable()
    .optional(),
  topics: z
    .array(z.object({ display_name: z.string(), count: z.number().optional() }))
    .nullable()
    .optional(),
  counts_by_year: z
    .array(z.object({ year: z.number(), works_count: z.number(), cited_by_count: z.number() }))
    .nullable()
    .optional(),
  updated_date: z.string().nullable().optional(),
});
export type OpenAlexSource = z.infer<typeof OpenAlexSourceSchema>;

export type OpenAccess = "full" | "hybrid" | "subscription";

export interface JournalMetricsUpdate {
  publisher: string | null;
  homepage: string | null;
  openAccess: OpenAccess | null;
  openAccessSource: string | null;
  apcUsd: number | null;
  hIndex: number | null;
  i10Index: number | null;
  twoYrMeanCitedness: number | null;
  worksCount: number | null;
  citedByCount: number | null;
  metricsAsOf: Date | null;
  topics: string[];
  countsByYear: { year: number; works: number; citations: number }[];
  issns: string[];
}

const int = (v: number | null | undefined) => (v == null ? null : Math.round(v));

/**
 * Map an OpenAlex source record onto a seed journal. Curated facts in the seed (publisher
 * spelling, diamond-OA status) win over OpenAlex; OpenAlex supplies the metrics.
 */
export function normalizeOpenAlexSource(
  src: OpenAlexSource,
  seed: JournalSeed,
): JournalMetricsUpdate {
  const stats = src.summary_stats ?? {};
  const works = src.works_count ?? null;
  let openAccess: OpenAccess | null = null;
  let openAccessSource: string | null = null;
  if (seed.openAccess) {
    openAccess = seed.openAccess;
    openAccessSource = "journal site";
  } else if (src.is_in_doaj || src.is_oa) {
    openAccess = "full";
    openAccessSource = "openalex";
  } else if (src.apc_usd != null || (src.apc_prices?.length ?? 0) > 0 || src.is_high_oa_rate) {
    // A subscription journal that charges an APC for optional open access.
    openAccess = "hybrid";
    openAccessSource = "openalex";
  } else if (src.is_oa === false) {
    openAccess = "subscription";
    openAccessSource = "openalex";
  }
  // OpenAlex reports 0 for titles whose recent works it hasn't attributed; that is "unknown".
  const citedness = stats["2yr_mean_citedness"];
  return {
    publisher: seed.publisher ?? cleanText(src.host_organization_name),
    homepage: seed.homepage ?? normalizeUrl(src.homepage_url ?? null),
    openAccess,
    openAccessSource,
    apcUsd: seed.apcUsd ?? (openAccess === "subscription" ? null : int(src.apc_usd)),
    hIndex: int(stats.h_index),
    i10Index: int(stats.i10_index),
    twoYrMeanCitedness:
      citedness == null || (citedness === 0 && (works ?? 0) > 50)
        ? null
        : Math.round(citedness * 100) / 100,
    worksCount: int(works),
    citedByCount: int(src.cited_by_count),
    metricsAsOf: src.updated_date ? new Date(`${src.updated_date.slice(0, 19)}Z`) : null,
    topics: (src.topics ?? []).slice(0, 8).map((t) => t.display_name),
    countsByYear: (src.counts_by_year ?? [])
      .map((c) => ({ year: c.year, works: c.works_count, citations: c.cited_by_count }))
      .sort((a, b) => a.year - b.year),
    issns: [...new Set([...seed.issns, ...(src.issn ?? [])])],
  };
}

export function openAlexUrl(
  seed: JournalSeed,
  env: Record<string, string | undefined>,
): string | null {
  const id = seed.openalexId ? seed.openalexId : seed.issns[0] ? `issn:${seed.issns[0]}` : null;
  if (!id) return null;
  const params = new URLSearchParams();
  if (env.OPENALEX_API_KEY) params.set("api_key", env.OPENALEX_API_KEY);
  if (env.OPENALEX_EMAIL) params.set("mailto", env.OPENALEX_EMAIL);
  const qs = params.toString();
  return `https://api.openalex.org/sources/${id}${qs ? `?${qs}` : ""}`;
}

/* ------------------------------------------------------------- name matching */

export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/&/g, " and ")
    .replace(/®|™/g, "")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Index seeds by normalized full name, for ranking lists keyed by title. */
export function seedNameIndex(seeds: JournalSeed[]): Map<string, JournalSeed> {
  return new Map(seeds.map((s) => [normalizeTitle(s.name), s]));
}

/* ------------------------------------------------------------- CCF (journals) */

/**
 * CCF recommended list, journal entries. Source: the MIT-licensed CCFrank4dblp extension data
 * (ccfRankFull.js = DBLP key → full name, ccfRankUrl.js = DBLP key → rank), updated to the
 * CCF 2026 list.
 */
export function parseCcfRankJs(fullJs: string, rankJs: string): Map<string, "A" | "B" | "C"> {
  const pairs = (js: string) =>
    new Map([...js.matchAll(/"(\/journals\/[^"]+)":\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]));
  const names = pairs(fullJs);
  const ranks = pairs(rankJs);
  const out = new Map<string, "A" | "B" | "C">();
  for (const [key, name] of names) {
    const rank = ranks.get(key);
    if (rank === "A" || rank === "B" || rank === "C") out.set(normalizeTitle(name), rank);
  }
  return out;
}

/* ------------------------------------------------------- CORE journal ranks */

export interface CoreJournalRank {
  title: string;
  source: string;
  rank: string;
}

/**
 * One page of the CORE journal portal (portal.core.edu.au/jnl-ranks). CORE discontinued journal
 * rankings in 2022; the last edition is CORE2020, kept as published.
 */
export function parseCoreJournalPage(html: string): {
  rows: CoreJournalRank[];
  total: number | null;
} {
  const $ = cheerio.load(html);
  const rows: CoreJournalRank[] = [];
  $('tr[class$="row"]').each((_, tr) => {
    const tds = $(tr).find("td");
    const title = cleanText(tds.eq(0).text());
    const source = cleanText(tds.eq(1).text());
    const rank = cleanText(tds.eq(2).text());
    if (title && source && rank && /^(A\*|A|B|C)$/.test(rank)) rows.push({ title, source, rank });
  });
  const total = /Showing results \d+ - \d+ of (\d+)/.exec($.root().text())?.[1];
  return { rows, total: total ? Number(total) : null };
}

export function coreJournalPageUrl(page: number): string {
  return `https://portal.core.edu.au/jnl-ranks/?search=&by=all&source=CORE2020&sort=atitle&page=${page}`;
}

/* -------------------------------------------------- journal pages: scope etc */

const MAX_SCOPE = 20_000;

/** Readability-extracted "aims & scope" text, structure kept (## headings, - bullets). */
export function extractScopeText(html: string, url: string): string | null {
  const { document } = parseHTML(html);
  // Springer pages put the aims & scope in a dedicated container; prefer it when present.
  const $ = cheerio.load(html);
  const springer = $('[data-test="aims-and-scope"], .app-journal-aims-and-scope, #aims-and-scope')
    .first()
    .html();
  let text: string | null = null;
  if (springer) text = htmlToStructuredText(springer);
  if (!text || text.length < 200) {
    try {
      Object.defineProperty(document, "baseURI", { value: url });
    } catch {
      /* linkedom documents may not allow it; Readability only needs it for links */
    }
    const article = new Readability(document as unknown as Document).parse();
    if (article?.content) text = htmlToStructuredText(article.content);
  }
  if (!text) return null;
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text.length >= 120 ? text.slice(0, MAX_SCOPE) : null;
}

export interface SpringerJournalMetrics {
  impactMetrics: { name: string; value: string; year: number | null }[];
  timeToFirstDecision: string | null;
}

/** Springer journal home: the "Journal metrics" block as published (label → value (year)). */
export function parseSpringerMetrics(html: string): SpringerJournalMetrics {
  const $ = cheerio.load(html);
  const impactMetrics: SpringerJournalMetrics["impactMetrics"] = [];
  let timeToFirstDecision: string | null = null;
  $(".app-journal-homepage-metrics dl").each((_, dl) => {
    const label = cleanText($(dl).find("dt").text());
    const raw = cleanText($(dl).find("dd").text());
    if (!label || !raw) return;
    if (/first decision/i.test(label)) {
      timeToFirstDecision = raw;
      return;
    }
    if (!/impact factor/i.test(label)) return;
    const m = /^([\d.]+)\s*\((\d{4})\)$/.exec(raw);
    impactMetrics.push({
      name: label,
      value: m ? m[1] : raw,
      year: m ? Number(m[2]) : null,
    });
  });
  return { impactMetrics, timeToFirstDecision };
}

/* ------------------------------------------------------------ special issues */

export interface SpecialIssueInput {
  source: "springer" | "wikicfp";
  sourceId: string;
  journalSlug: string | null;
  journalName: string | null;
  title: string;
  guestEditors: string[];
  descriptionText: string | null;
  /** ISO instant, end of day AoE when only a date is stated (flagged by deadlineTz = null). */
  submissionDeadlineUtc: string | null;
  deadlineText: string | null;
  deadlineTz: string | null;
  url: string | null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "1 February 2027" / "15th Aug. 2024" (day first, as many journals write it) → ISO date. */
export function parseDayFirstDate(text: string): string | null {
  const m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
  const day = Number(m[1]);
  if (month < 0 || day < 1 || day > 31) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function deadlineFromText(text: string | null): {
  utc: string | null;
  text: string | null;
} {
  if (!text) return { utc: null, text: null };
  const cleaned = text.replace(/\b(extended to|new deadline:?)\s*/i, "").trim();
  const date = parseDayFirstDate(cleaned) ?? parseSingleDate(cleaned);
  const r = date ? wallClockToUtc(date, null) : null;
  return { utc: r ? r.utc.toISOString() : null, text: cleanText(text) };
}

/**
 * Springer journal "updates" page: each card is a news item; calls for papers state a
 * "Submission Deadline:" and usually guest editors. Non-call items are skipped.
 */
export function parseSpringerUpdates(
  html: string,
  pageUrl: string,
  journalSlug: string,
): SpecialIssueInput[] {
  const $ = cheerio.load(html);
  const out: SpecialIssueInput[] = [];
  $("article.app-card-highlight").each((_, el) => {
    const link = $(el).find("a.app-card-highlight__heading-link").first();
    const heading = cleanText(link.text());
    const body = $(el).find(".app-card-highlight__text").first();
    const text = cleanText(body.text().replace(/ /g, " ")) ?? "";
    const dl =
      /Submission Deadline:?\s*([A-Z][a-z]+ \d{1,2},? \d{4}|\d{1,2} [A-Z][a-z]+ \d{4}|\d{4}-\d{2}-\d{2})/i.exec(
        text,
      );
    // Only calls that state a submission deadline (the page also keeps years of old news).
    if (!heading || !dl) return;
    const href = link.attr("href") ?? "";
    const path = href.split("?")[0];
    const url = path ? new URL(path, pageUrl).toString() : null;
    const id = /updates\/(\d+)/.exec(path)?.[1] ?? heading.toLowerCase().replace(/\W+/g, "-");
    const editors: string[] = [];
    body.find("li").each((_, li) => {
      const t = cleanText($(li).text().replace(/ /g, " "));
      if (t) editors.push(t);
    });
    if (editors.length === 0) {
      const inline = /Guest Editors?:?\s*([^|]+?)(?:Submission|$)/i.exec(text)?.[1];
      if (inline)
        editors.push(
          ...inline
            .split(/,\s*|\s+and\s+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 2),
        );
    }
    const deadline = deadlineFromText(dl?.[1] ?? null);
    out.push({
      source: "springer",
      sourceId: `${journalSlug}:${id}`,
      journalSlug,
      journalName: null,
      title: heading.replace(/^(?:Call for Papers|CfP)\s*[:\-–]\s*/i, ""),
      guestEditors: editors,
      descriptionText: text || null,
      submissionDeadlineUtc: deadline.utc,
      deadlineText: deadline.text,
      deadlineTz: null,
      url,
    });
  });
  return out;
}

const SPECIAL_ISSUE_RE =
  /special\s+issue|\bSI\b|topical\s+collection|thematic\s+issue|special\s+section/i;

/** WikiCFP feed items that are journal special issues (whole-journal calls are skipped). */
export async function specialIssueFeedItems(xml: string): Promise<WikiCfpFeedItem[]> {
  const items = await parseFeed(xml);
  return items.filter((i) => SPECIAL_ISSUE_RE.test(`${i.acronymRaw} ${i.name ?? ""}`));
}

/**
 * Find which seed journal a call names. Full names first (longest wins), then distinctive
 * abbreviations as whole words ("IEEE TSC" never matches "TSC" inside another word).
 */
/**
 * Find which seed journal a call names. Full names first (longest wins). Short generic names
 * ("Artificial Intelligence", "Machine Learning", "Patterns") only count when the text also
 * names the publisher or calls it a journal, so "Applied Artificial Intelligence for Control
 * Systems (Electronics, MDPI)" never lands on AIJ. Then distinctive abbreviations as whole words.
 */
export function matchJournal(text: string, seeds: JournalSeed[]): JournalSeed | null {
  const norm = ` ${normalizeTitle(text)} `;
  const byName = [...seeds]
    .sort((a, b) => b.name.length - a.name.length)
    .find((s) => {
      const name = normalizeTitle(s.name);
      if (!norm.includes(` ${name} `)) return false;
      if (name.split(" ").length >= 3) return true;
      const publisher = s.publisher ? normalizeTitle(s.publisher).split(" ")[0] : null;
      const calledJournal =
        norm.includes(` ${name} journal `) || norm.includes(` journal ${name} `);
      const publisherNamed = !!publisher && norm.includes(` ${publisher} `);
      return calledJournal || publisherNamed;
    });
  if (byName) return byName;
  for (const s of seeds) {
    if (s.abbreviation.length < 4 || /\s/.test(s.abbreviation)) continue;
    if (
      new RegExp(
        `(^|[^A-Za-z])${s.abbreviation.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}([^A-Za-z]|$)`,
      ).test(text)
    )
      return s;
  }
  return null;
}

/**
 * Journal named by a call that isn't in the seed list: "(Electronics, MDPI)", "IEEE TSC",
 * "at the Language Resources and Evaluation Journal", "… - Journal of Systems and Software".
 */
export function journalNameFromTitle(title: string): string | null {
  const paren =
    /\(([^()]*(?:journal|transactions|letters|review|mdpi|elsevier|springer|ieee|acm)[^()]*)\)/i.exec(
      title,
    )?.[1];
  if (paren) return cleanText(paren);
  const society = /\b((?:IEEE|ACM)(?:\/ACM)?\s+T[A-Z]{1,6})\b/.exec(title)?.[1];
  if (society) return cleanText(society);
  const at =
    /\b(?:at|in|of)\s+(?:the\s+)?((?:[A-Z][\w&-]*\s+){1,8}(?:Journal|Transactions|Letters|Review))\b/.exec(
      title,
    )?.[1];
  if (at) return cleanText(at);
  const dash = /\s[-–]\s((?:IEEE |ACM )?(?:[A-Z][\w&-]*\s?){2,8})(?:\s*\(|$)/.exec(title)?.[1];
  return dash ? cleanText(dash) : null;
}

/** Build a special issue from a WikiCFP feed item and its event page. */
export function normalizeWikiCfpSpecialIssue(
  item: WikiCfpFeedItem,
  pageHtml: string | null,
  seeds: JournalSeed[],
): SpecialIssueInput | null {
  const page = pageHtml ? parseEventPage(pageHtml) : null;
  const title = cleanText(item.name ?? item.acronymRaw);
  if (!title) return null;
  const sub = page?.deadlines.find((d) => /submission|deadline|due/i.test(d.summary));
  const deadline = deadlineFromText(sub?.date ?? null);
  const haystack = `${item.acronymRaw} ${item.name ?? ""} ${page?.cfpText?.slice(0, 3000) ?? ""}`;
  const journal =
    matchJournal(`${item.acronymRaw} ${item.name ?? ""}`, seeds) ?? matchJournal(haystack, seeds);
  return {
    source: "wikicfp",
    sourceId: item.eventId,
    journalSlug: journal?.slug ?? null,
    journalName: journal ? null : journalNameFromTitle(`${item.acronymRaw} : ${item.name ?? ""}`),
    title: title.replace(/^Special Issue(?:\s+on|\s*:)?\s+/i, ""),
    guestEditors: [],
    descriptionText: page?.cfpText ?? null,
    submissionDeadlineUtc: deadline.utc,
    deadlineText: deadline.text,
    deadlineTz: null,
    url: page?.website ?? item.link,
  };
}
