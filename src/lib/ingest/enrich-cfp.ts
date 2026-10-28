import { and, asc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { extractCfp, looksLikeCfpPage, type CfpExtraction } from "@/lib/sources/cfp";
import { extractCfpTopics, tagEvent } from "@/lib/sources/topics";
import { looksBlocked } from "./blocked-page";
import { RobotsDisallowedError, type PoliteFetcher } from "./http";
import { sha256Hex } from "./keys";

const REFRESH_AFTER_MS = 7 * 24 * 3600_000;
const CONCURRENCY = 4;
/** Shorter extracted text is not a CFP (navigation shells, error stubs). */
const MIN_CFP_CHARS = 200;

/** A login wall in place of the page (CFP pages are public; this is checked on CFPs only). */
const LOGIN_WALL =
  /(please )?(log|sign)[ -]?in to (continue|view this page|access this (page|site))/i;

/** A bot challenge, login wall or error page served with HTTP 200 (title or body). */
function isBlockPage(page: CfpExtraction): boolean {
  return (
    looksBlocked(page.title) ||
    looksBlocked(page.text) ||
    (page.text.length < 2000 && LOGIN_WALL.test(page.text))
  );
}

/**
 * The official CFP page as text, or `{ blocked: true }` when the site answered with a challenge
 * or login wall instead (never stored), or null when there is nothing usable.
 */
async function fetchCfp(
  fetcher: PoliteFetcher,
  url: string,
): Promise<{ url: string; data: CfpExtraction } | { blocked: true } | null> {
  const res = await fetcher.get(url, {
    robots: true,
    timeoutMs: 15_000,
    maxBytes: 3_000_000,
    accept: "text/html,application/xhtml+xml",
  });
  if (!res.ok || (res.contentType && !/html|xml/i.test(res.contentType))) return null;
  const first = extractCfp(res.text, res.url);
  if (isBlockPage(first)) return { blocked: true };
  // From a homepage, follow one same-site "Call for Papers" link.
  if (first.cfpLink && !looksLikeCfpPage(res.url, first.title)) {
    try {
      const next = await fetcher.get(first.cfpLink, {
        robots: true,
        timeoutMs: 15_000,
        maxBytes: 3_000_000,
      });
      if (next.ok && (!next.contentType || /html/i.test(next.contentType))) {
        const second = extractCfp(next.text, next.url);
        if (second.text.length > 400 && !isBlockPage(second)) {
          return {
            url: next.url,
            data: { ...second, submissionSite: second.submissionSite ?? first.submissionSite },
          };
        }
      }
    } catch {
      /* keep the homepage text */
    }
  }
  return { url: res.url, data: first };
}

/**
 * Fetch official CFP pages for upcoming events (stale after 7 days), within the time budget.
 * Text is only re-processed when its hash changes. A block page never replaces stored text.
 *
 * Submission facts parsed from the page (submission site, review type, page limit) follow the
 * page when it changes, including disappearing when the page no longer states them, unless a
 * list source supplied the value (merge records that in field_provenance, every run): those win.
 */
export async function enrichCfps(
  db: Db,
  fetcher: PoliteFetcher,
  deadlineMs: number,
  log: (m: string) => void = () => {},
): Promise<{
  attempted: number;
  updated: number;
  unchanged: number;
  failed: number;
  blocked: number;
  pending: number;
}> {
  const staleBefore = new Date(Date.now() - REFRESH_AFTER_MS);
  const recentCutoff = new Date(Date.now() - 30 * 24 * 3600_000).toISOString().slice(0, 10);
  const rows = await db
    .select({
      id: events.id,
      website: events.website,
      cfpHash: events.cfpHash,
      seriesKey: events.seriesKey,
      name: events.name,
      description: events.description,
      submissionSite: events.submissionSite,
      reviewType: events.reviewType,
      pageLimit: events.pageLimit,
      fieldProvenance: events.fieldProvenance,
    })
    .from(events)
    .where(
      and(
        isNotNull(events.website),
        or(isNull(events.cfpFetchedAt), lt(events.cfpFetchedAt, staleBefore)),
        or(isNull(events.endDate), sql`${events.endDate} >= ${recentCutoff}`),
        // Undated old editions (e.g. "CICAI 2022") are not worth a fetch.
        sql`${events.year} >= ${new Date().getUTCFullYear() - 1}`,
      ),
    )
    .orderBy(sql`${events.cfpFetchedAt} asc nulls first`, asc(events.nextDeadlineAt));

  let attempted = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  let blocked = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < rows.length && Date.now() + 16_000 < deadlineMs) {
      const r = rows[cursor++];
      attempted++;
      try {
        const got = await fetchCfp(fetcher, r.website!);
        if (got && "blocked" in got) {
          // Keep the last good text; only note that the page was tried.
          blocked++;
          await db.update(events).set({ cfpFetchedAt: new Date() }).where(eq(events.id, r.id));
          continue;
        }
        if (!got || got.data.text.length < MIN_CFP_CHARS) {
          failed++;
          await db.update(events).set({ cfpFetchedAt: new Date() }).where(eq(events.id, r.id));
          continue;
        }
        const hash = await sha256Hex(got.data.text);
        if (hash === r.cfpHash) {
          unchanged++;
          await db
            .update(events)
            .set({ cfpFetchedAt: new Date(), cfpUrl: got.url })
            .where(eq(events.id, r.id));
          continue;
        }
        const tagged = tagEvent({
          seriesKey: r.seriesKey,
          name: r.name,
          description: r.description,
          cfpText: got.data.text,
        });
        await db
          .update(events)
          .set({
            cfpText: got.data.text,
            cfpHash: hash,
            cfpUrl: got.url,
            cfpFetchedAt: new Date(),
            cfpTopics: extractCfpTopics(got.data.text),
            // A value a list source supplied stays; otherwise the field follows the page.
            submissionSite: r.fieldProvenance.submissionSite
              ? r.submissionSite
              : got.data.submissionSite,
            reviewType: r.fieldProvenance.reviewType ? r.reviewType : got.data.reviewType,
            pageLimit: got.data.pageLimit,
            hasRebuttal: got.data.hasRebuttal,
            ...(tagged.subfields.length
              ? { subfields: tagged.subfields, topics: tagged.topics }
              : {}),
          })
          .where(eq(events.id, r.id));
        updated++;
      } catch (err) {
        failed++;
        if (!(err instanceof RobotsDisallowedError))
          log(`cfp ${r.website}: ${(err as Error).message}`);
        await db.update(events).set({ cfpFetchedAt: new Date() }).where(eq(events.id, r.id));
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { attempted, updated, unchanged, failed, blocked, pending: rows.length - attempted };
}
