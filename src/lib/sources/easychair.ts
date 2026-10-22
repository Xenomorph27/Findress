import * as cheerio from "cheerio";
import { parseSingleDate } from "@/lib/ingest/dates";
import { cleanAcronym, cleanText, yearFrom } from "@/lib/ingest/keys";
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
import { tagEvent } from "./topics";
import { eventType } from "./wikicfp";

/**
 * EasyChair Smart CFP (https://easychair.org/cfp/): one public HTML page listing every open call
 * with its submission deadline, start date, place and topic tags. robots.txt allows /cfp/. The
 * list covers all of computing and beyond, so only calls that are genuinely about AI/ML come in
 * (see `isAiRelevant`). Entries are community-listed, like WikiCFP: they stay out of the default
 * Explore view unless another source (or a rank) backs them.
 */
export const EASYCHAIR_URL = "https://easychair.org/cfp/";

/** Strong AI/ML topic tags (lowercased). */
const STRONG_TAG =
  /^(machine learning|deep learning|neural networks?|natural language processing|computer vision|reinforcement learning|large language models?|llms?|generative ai|generative models?|foundation models?|ai safety|explainable ai|trustworthy ai|federated learning|representation learning|transfer learning|machine vision|speech recognition|text mining|multimodal learning)$/;
/** Weaker AI-adjacent tags: they only count next to a strong one. */
const WEAK_TAG =
  /^(artificial intelligence|data mining|knowledge representation|multi-?agent systems?|pattern recognition|knowledge graphs?|bayesian (methods|inference|networks?)|data science|autonomous systems)$/;

/**
 * Words in the title that really are about AI/ML. Deliberately NOT here: "intelligent",
 * "robotics", "smart", "knowledge", "learning" alone: they describe much that is not AI research
 * (intelligent transportation, robot law, e-learning).
 */
const TITLE_WORDS = new RegExp(
  String.raw`\b(artificial intelligence|machine learning|deep learning|neural (network|net)s?|language models?|large language|natural language|computer vision|machine vision|reinforcement learning|generative (ai|models?)|foundation models?|data science|data mining|knowledge (graphs?|discovery)|explainable|agentic|multi-?agent|computational intelligence|cognitive computing|pattern recognition|machine intelligence|image analysis|clustering|speech (recognition|processing)|chatbots?|conversational (ai|agents?)|diffusion models?|self-supervised|federated learning|representation learning|transfer learning|multimodal|nlp|llms?)\b`,
  "i",
);
/** The abbreviations AI / ML / XAI / NLP, also inside acronyms: UrbanAI, GeoAI, AI4Science, NL4AI. */
const TITLE_ABBREV =
  /(?:^|[^A-Za-z])(?:AI|ML|XAI|NLP|LLMs?|GenAI)(?![A-Za-z])|[a-z]AI(?![A-Za-z])|(?:AI|ML)4|4(?:AI|ML)/;
/** Names that merely contain the letters ML: modelling/markup languages. */
const NOT_ML = /\b\w*(?:SysML|UML|XML|HTML|MathML|GraphML|SBML|YAML)\w*\b/g;
/**
 * Titles that are about something else even if they mention AI in passing (policy, the economy,
 * "the age of AI"). Note that law, architecture and education are NOT here: AI & Law, AI hardware
 * and AI-in-education research are legitimate.
 */
const OFF_TOPIC =
  /\b(e-?learning|nursing|accounting|tourism|marketing|civil engineering|econometric|entrepreneurship|urbanism|age of ai|ai-enabled economy|digital transformation|governing)\b/i;

export interface RelevanceVerdict {
  ok: boolean;
  why: string;
}

/**
 * Is this call genuinely about AI/ML? Yes when the title or acronym itself names AI/ML
 * (artificial intelligence, machine/deep learning, NLP, vision, LLMs …, or the AI/ML
 * abbreviations), or the call carries at least three AI/ML topic tags of which one is strong.
 * A lone topic tag, a generic "intelligent" in the title, or robotics alone is not enough.
 */
export function isAiRelevant(name: string, acronym: string, tags: string[]): RelevanceVerdict {
  const title = `${acronym} ${name}`;
  const abbrevTitle = title.replace(NOT_ML, " ");
  const lower = tags.map((t) => t.toLowerCase().trim());
  const strong = lower.filter((t) => STRONG_TAG.test(t));
  const weak = lower.filter((t) => WEAK_TAG.test(t));
  if (OFF_TOPIC.test(name)) return { ok: false, why: "off-topic title" };
  const word = TITLE_WORDS.exec(title)?.[0];
  if (word) return { ok: true, why: `title: ${word.toLowerCase()}` };
  if (TITLE_ABBREV.test(abbrevTitle)) return { ok: true, why: "title: AI/ML abbreviation" };
  if (strong.length > 0 && strong.length + weak.length >= 3)
    return { ok: true, why: `tags: ${[...strong, ...weak].slice(0, 2).join(" + ")}` };
  return {
    ok: false,
    why:
      strong.length + weak.length === 1
        ? `only one AI tag (${strong[0] ?? weak[0]})`
        : "no AI/ML signal",
  };
}

const NOT_AN_EVENT = /\b(special issue|book chapter|edited (book|volume)|journal)\b/i;

export interface EasyChairRow {
  slug: string;
  acronym: string;
  name: string;
  place: string;
  deadline: string;
  start: string;
  tags: string[];
}

/** Parse the Smart CFP table: Acronym | Name | Location | Submission Deadline | Start Date | Topics. */
export function parseEasyChairList(html: string): EasyChairRow[] {
  const $ = cheerio.load(html);
  const rows: EasyChairRow[] = [];
  $("tr").each((_, tr) => {
    const tds = $(tr).children("td");
    if (tds.length !== 6) return;
    const link = tds.eq(0).find('a[href^="/cfp/"]').first();
    const href = link.attr("href") ?? "";
    const slug = href.replace(/^\/cfp\//, "").split(/[?#]/)[0];
    if (!slug || slug.includes("/") || slug.startsWith("topic")) return;
    rows.push({
      slug,
      acronym: cleanText(link.text()) ?? "",
      name: cleanText(tds.eq(1).text()) ?? "",
      place: cleanText(tds.eq(2).text()) ?? "",
      deadline: cleanText(tds.eq(3).text()) ?? "",
      start: cleanText(tds.eq(4).text()) ?? "",
      tags: tds
        .eq(5)
        .find(".tag")
        .map((__, el) => cleanText($(el).text()) ?? "")
        .get()
        .filter(Boolean),
    });
  });
  return rows;
}

/** One list row → an event, or null (not an event, no year, or not AI/ML). */
export function normalizeEasyChair(row: EasyChairRow): { event: EventInput | null; why: string } {
  const text = `${row.acronym} ${row.name}`;
  if (!row.acronym || NOT_AN_EVENT.test(text)) return { event: null, why: "not an event" };
  const start = parseSingleDate(row.start);
  const year =
    yearFrom(row.acronym) ?? yearFrom(row.name) ?? (start ? Number(start.slice(0, 4)) : null);
  if (!year) return { event: null, why: "no year" };
  const verdict = isAiRelevant(row.name, row.acronym, row.tags);
  if (!verdict.ok) return { event: null, why: verdict.why };

  const acronym = cleanAcronym(row.acronym);
  const deadlines: DeadlineInput[] = [];
  const due = parseSingleDate(row.deadline);
  const resolved = due ? wallClockToUtc(due, null) : null;
  if (due && resolved) {
    deadlines.push({
      kind: "paper",
      label: "Submission deadline",
      dueAtUtc: resolved.utc.toISOString(),
      originalTz: null,
      originalText: row.deadline,
      comment: "EasyChair lists dates without a time zone; shown as end of day AoE.",
    });
  }
  const place = parsePlace(row.place);
  const url = `${EASYCHAIR_URL}${row.slug}`;
  const type = eventType(acronym, row.name);
  const tagged = tagEvent({ seriesKey: "", name: row.name, tags: row.tags });
  return {
    why: verdict.why,
    event: {
      ...emptyEvent({ source: "easychair", sourceId: row.slug, acronym, year }),
      sourceUrl: url,
      name: row.name || null,
      type,
      tags: row.tags,
      subfields: tagged.subfields,
      mode: place.mode,
      locationRaw: cleanText(row.place),
      venue: place.venue,
      city: place.city,
      country: place.country,
      countryCode: place.countryCode,
      startDate: start,
      website: url,
      deadlines,
    },
  };
}

export const easychairAdapter: SourceAdapter = {
  name: "easychair",
  async run(ctx: AdapterContext): Promise<AdapterResult> {
    const warnings: string[] = [];
    const html = await ctx.fetcher.getText(EASYCHAIR_URL, {
      robots: true,
      cacheTtlMs: 6 * 3600_000,
      timeoutMs: 45_000,
      maxBytes: 8_000_000,
      accept: "text/html",
    });
    const rows = parseEasyChairList(html);
    if (rows.length < 100) {
      throw new Error(`EasyChair list looks wrong: only ${rows.length} rows parsed`);
    }
    const events: EventInput[] = [];
    const dropped: Record<string, number> = {};
    for (const row of rows) {
      const { event, why } = normalizeEasyChair(row);
      if (event) events.push(event);
      else
        dropped[why.startsWith("only") || why.startsWith("no AI") ? "notAi" : why] =
          (dropped[why.startsWith("only") || why.startsWith("no AI") ? "notAi" : why] ?? 0) + 1;
    }
    const valid = validateEvents(events, warnings);
    return {
      events: valid,
      warnings,
      pruneStale: true,
      stats: {
        rows: rows.length,
        kept: valid.length,
        workshops: valid.filter((e) => e.type === "workshop").length,
        withDeadline: valid.filter((e) => e.deadlines.length > 0).length,
        droppedNotAi: dropped.notAi ?? 0,
        droppedOther:
          (dropped["not an event"] ?? 0) +
          (dropped["no year"] ?? 0) +
          (dropped["off-topic title"] ?? 0),
      },
    };
  },
};
