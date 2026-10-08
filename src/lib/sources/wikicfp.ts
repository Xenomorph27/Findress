import * as cheerio from "cheerio";
import Parser from "rss-parser";
import { parseDateRange, parseSingleDate } from "@/lib/ingest/dates";
import {
  cleanAcronym,
  cleanText,
  decodeEntities,
  dedupeKeyFor,
  normalizeUrl,
  yearFrom,
} from "@/lib/ingest/keys";
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
import type { DeadlineKind, EventType } from "@/lib/taxonomy";

/**
 * WikiCFP: category RSS feeds (a rolling window of the latest ~20 calls per category) plus the
 * linked event page for When/Where/deadlines. Respect robots.txt (Crawl-delay: 5), cache pages,
 * and never prune items that merely scrolled out of a feed.
 */
export const WIKICFP_CATEGORIES = [
  "machine learning",
  "artificial intelligence",
  "deep learning",
  "natural language processing",
  "computer vision",
  "data mining",
  "robotics",
  "generative ai",
  "llm",
  "large language models",
  "reinforcement learning",
];

export function feedUrl(category: string): string {
  return `http://www.wikicfp.com/cfp/rss?cat=${encodeURIComponent(category)}`;
}

export function eventPageUrl(eventId: string): string {
  return `http://www.wikicfp.com/cfp/servlet/event.showcfp?eventid=${eventId}`;
}

const PAGE_TTL_MS = 3 * 24 * 3600_000;
const FEED_TTL_MS = 55 * 60_000;

/** Calls that are not conferences/workshops (courses, schools, journals, books) are skipped. */
const NOT_AN_EVENT =
  /\b(special issue|journal|book|chapter|course|summer school|winter school|spring school|autumn school|bootcamp|webinar|hackathon|competition only|magazine|transactions)\b/i;

/** Major venues that commonly host co-located workshops (for parent detection). */
const PARENT_VENUES = [
  "NeurIPS",
  "ICML",
  "ICLR",
  "AAAI",
  "IJCAI",
  "ACL",
  "EMNLP",
  "NAACL",
  "EACL",
  "COLING",
  "CVPR",
  "ICCV",
  "ECCV",
  "WACV",
  "KDD",
  "WWW",
  "SIGIR",
  "WSDM",
  "CIKM",
  "ICDM",
  "ECAI",
  "ECML-PKDD",
  "ICRA",
  "IROS",
  "CoRL",
  "RSS",
  "MICCAI",
  "ICASSP",
  "Interspeech",
  "ACM MM",
  "CHI",
  "IUI",
  "COLM",
  "AAMAS",
  "UAI",
  "AISTATS",
  "ICDE",
  "IoTBDS",
  "KSE",
  "LREC",
];
const PARENT_RE = new RegExp(
  `(?:@\\s*|\\bat\\s+(?:the\\s+)?|co-located with\\s+(?:the\\s+)?|in conjunction with\\s+(?:the\\s+)?)(${PARENT_VENUES.map((p) => p.replace(/[-\\s]/g, "[-\\s]?")).join("|")})\\b`,
  "i",
);

export interface WikiCfpFeedItem {
  eventId: string;
  acronymRaw: string;
  name: string | null;
  place: string | null;
  when: string | null;
  link: string;
}

/** Parse one RSS document into feed items (pure; used by tests with real fixtures). */
export async function parseFeed(xml: string): Promise<WikiCfpFeedItem[]> {
  const feed = await new Parser().parseString(xml);
  const items: WikiCfpFeedItem[] = [];
  for (const it of feed.items) {
    const link = it.link ?? "";
    const eventId = /eventid=(\d+)/.exec(link)?.[1];
    const title = cleanText(it.title);
    if (!eventId || !title) continue;
    const idx = title.indexOf(" : ");
    const acronymRaw = idx > 0 ? title.slice(0, idx) : title;
    const name = cleanText(idx > 0 ? title.slice(idx + 3) : null);
    const desc = decodeEntities(it.content ?? it.contentSnippet ?? it.summary ?? "");
    const m = /\[([^\]]*)\]\s*\[([^\]]*)\]\s*$/.exec(desc);
    items.push({
      eventId,
      acronymRaw,
      name,
      place: cleanText(m?.[1]?.replace(/,\s*$/, "")),
      when: cleanText(m?.[2]),
      link: eventPageUrl(eventId),
    });
  }
  return items;
}

export interface WikiCfpPage {
  when: string | null;
  where: string | null;
  website: string | null;
  deadlines: { summary: string; date: string }[];
  categories: string[];
  cfpText: string | null;
}

/** Parse an event page. Deadlines come from the RDFa `v:summary` / `v:startDate` pairs. */
export function parseEventPage(html: string): WikiCfpPage {
  const $ = cheerio.load(html);
  const row = (label: string) => {
    const th = $("th").filter((_, el) => $(el).text().trim().toLowerCase() === label);
    return cleanText(th.first().next("td").text());
  };
  const deadlines: { summary: string; date: string }[] = [];
  $('span[typeof="v:Event"]').each((_, el) => {
    const summary = $(el).find('[property="v:summary"]').attr("content");
    const date = $(el).find('[property="v:startDate"]').attr("content");
    if (summary && date) deadlines.push({ summary: summary.trim(), date: date.trim() });
  });
  const categories = $('a[href*="call?conference="]')
    .map((_, a) => $(a).text().trim().toLowerCase())
    .get()
    .filter(Boolean);
  const cfp = $("div.cfp").first();
  cfp.find("br").replaceWith("\n");
  const cfpText = cfp.length
    ? cfp
        .text()
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    : null;
  return {
    when: row("when"),
    where: row("where"),
    website: normalizeUrl($('span[property="dc:source"]').attr("content")),
    deadlines,
    categories,
    cfpText: cfpText || null,
  };
}

function deadlineKind(summary: string): DeadlineKind {
  const s = summary.toLowerCase();
  if (/abstract/.test(s)) return "abstract";
  if (/submission|paper due|deadline/.test(s)) return "paper";
  if (/notification/.test(s)) return "notification";
  if (/final|camera/.test(s)) return "camera_ready";
  if (/registration/.test(s)) return "registration";
  return "other";
}

function eventType(acronym: string, name: string | null): EventType {
  const text = `${acronym} ${name ?? ""}`;
  if (/\bworkshop\b|\bspecial session\b|\bspecial track\b/i.test(text)) return "workshop";
  if (/\bsymposium\b/i.test(text)) return "symposium";
  return "conference";
}

/** Build an EventInput from a feed item and (optionally) its parsed event page. */
export function normalizeWikiCfp(
  item: WikiCfpFeedItem,
  page: WikiCfpPage | null,
): EventInput | null {
  const text = `${item.acronymRaw} ${item.name ?? ""}`;
  if (NOT_AN_EVENT.test(text)) return null;
  const acronym = cleanAcronym(item.acronymRaw);
  const when = page?.when ?? item.when;
  const range = parseDateRange(when);
  const year = yearFrom(item.acronymRaw) ?? (range ? Number(range.start.slice(0, 4)) : null);
  if (!year) return null;

  const deadlines: DeadlineInput[] = [];
  for (const d of page?.deadlines ?? []) {
    // The first RDFa event on the page is the conference itself (summary = "WLLFM 2026").
    if (
      !/due|deadline|registration|notification|submission|camera|final version/i.test(d.summary)
    ) {
      continue;
    }
    const date = parseSingleDate(d.date);
    if (!date) continue;
    const r = wallClockToUtc(date, null);
    if (!r) continue;
    deadlines.push({
      kind: deadlineKind(d.summary),
      label: d.summary,
      dueAtUtc: r.utc.toISOString(),
      originalTz: null,
      originalText: date,
      comment: "WikiCFP lists dates without a time zone; shown as end of day AoE.",
    });
  }
  if (!range && deadlines.length === 0) return null; // journals and undated calls

  const place = parsePlace(page?.where ?? item.place);
  const parent = PARENT_RE.exec(text);
  const type = eventType(acronym, item.name);

  return {
    ...emptyEvent({ source: "wikicfp", sourceId: item.eventId, acronym, year }),
    sourceUrl: item.link,
    name: item.name,
    type,
    parentKey: parent && type === "workshop" ? dedupeKeyFor(parent[1], year) : null,
    tags: page?.categories ?? [],
    mode: place.mode,
    locationRaw: cleanText(page?.where ?? item.place),
    venue: place.venue,
    city: place.city,
    country: place.country,
    countryCode: place.countryCode,
    startDate: range?.start ?? null,
    endDate: range?.end ?? null,
    dateText: cleanText(when),
    website: page?.website ?? null,
    description: page?.cfpText ? page.cfpText.slice(0, 4000) : null,
    deadlines,
  };
}

export const wikicfpAdapter: SourceAdapter = {
  name: "wikicfp",
  async run(ctx: AdapterContext): Promise<AdapterResult> {
    const warnings: string[] = [];
    const feedItems = new Map<string, WikiCfpFeedItem>();
    let feedsOk = 0;
    for (const cat of WIKICFP_CATEGORIES) {
      try {
        const xml = await ctx.fetcher.getText(feedUrl(cat), {
          robots: true,
          cacheTtlMs: FEED_TTL_MS,
          accept: "application/rss+xml, application/xml",
        });
        for (const item of await parseFeed(xml)) feedItems.set(item.eventId, item);
        feedsOk++;
      } catch (err) {
        warnings.push(`feed "${cat}": ${(err as Error).message}`);
      }
    }

    // Event pages: never-fetched first, then upcoming events whose cached page is stale.
    const todayIso = ctx.now.toISOString().slice(0, 10);
    const candidates: { item: WikiCfpFeedItem; priority: number }[] = [];
    for (const item of feedItems.values()) {
      const prev = ctx.previous.get(item.eventId);
      candidates.push({ item, priority: prev ? 1 : 0 });
    }
    for (const [id, prev] of ctx.previous) {
      if (feedItems.has(id)) continue;
      if ((prev.endDate ?? prev.startDate ?? "9999") < todayIso) continue;
      candidates.push({
        item: {
          eventId: id,
          acronymRaw: `${prev.acronym} ${prev.year}`,
          name: prev.name,
          place: prev.locationRaw,
          when: prev.dateText,
          link: eventPageUrl(id),
        },
        priority: 2,
      });
    }
    candidates.sort((a, b) => a.priority - b.priority);

    const interval = await ctx.fetcher.intervalFor("http://www.wikicfp.com");
    const events: EventInput[] = [];
    let pagesFetched = 0;
    let pagesFromCache = 0;
    let skippedForBudget = 0;
    for (const { item } of candidates) {
      let page: WikiCfpPage | null = null;
      const cached = await ctx.fetcher.isCached(item.link, PAGE_TTL_MS);
      if (cached || Date.now() + interval < ctx.deadlineMs) {
        try {
          const res = await ctx.fetcher.get(item.link, { robots: true, cacheTtlMs: PAGE_TTL_MS });
          if (res.ok) page = parseEventPage(res.text);
          if (res.fromCache) pagesFromCache++;
          else pagesFetched++;
        } catch (err) {
          warnings.push(`event ${item.eventId}: ${(err as Error).message}`);
        }
      } else {
        skippedForBudget++;
      }
      const prev = ctx.previous.get(item.eventId);
      const normalized = normalizeWikiCfp(item, page);
      if (normalized) {
        // Page not fetched this run: keep the deadlines we learned last time.
        if (!page && prev && normalized.deadlines.length === 0) {
          normalized.deadlines = prev.deadlines;
          normalized.website ??= prev.website;
          normalized.description ??= prev.description;
        }
        events.push(normalized);
      } else if (prev && !page) {
        events.push(prev);
      }
    }

    const valid = validateEvents(events, warnings);
    return {
      events: valid,
      warnings,
      pruneStale: false,
      stats: {
        feedsOk,
        feedItems: feedItems.size,
        events: valid.length,
        pagesFetched,
        pagesFromCache,
        skippedForBudget,
      },
    };
  },
};
