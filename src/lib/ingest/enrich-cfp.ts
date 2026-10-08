import { and, asc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { extractCfp, looksLikeCfpPage, type CfpExtraction } from "@/lib/sources/cfp";
import { extractCfpTopics, tagEvent } from "@/lib/sources/topics";
import { RobotsDisallowedError, type PoliteFetcher } from "./http";
import { sha256Hex } from "./keys";

const REFRESH_AFTER_MS = 7 * 24 * 3600_000;
const CONCURRENCY = 4;

async function fetchCfp(
  fetcher: PoliteFetcher,
  url: string,
): Promise<{ url: string; data: CfpExtraction } | null> {
  const res = await fetcher.get(url, {
    robots: true,
    timeoutMs: 15_000,
    maxBytes: 3_000_000,
    accept: "text/html,application/xhtml+xml",
  });
  if (!res.ok || (res.contentType && !/html|xml/i.test(res.contentType))) return null;
  const first = extractCfp(res.text, res.url);
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
        if (second.text.length > 400) {
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
 * Text is only re-processed when its hash changes.
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
    })
    .from(events)
    .where(
      and(
        isNotNull(events.website),
        or(isNull(events.cfpFetchedAt), lt(events.cfpFetchedAt, staleBefore)),
        or(isNull(events.endDate), sql`${events.endDate} >= ${recentCutoff}`),
      ),
    )
    .orderBy(sql`${events.cfpFetchedAt} asc nulls first`, asc(events.nextDeadlineAt));

  let attempted = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < rows.length && Date.now() + 16_000 < deadlineMs) {
      const r = rows[cursor++];
      attempted++;
      try {
        const got = await fetchCfp(fetcher, r.website!);
        if (!got || got.data.text.length < 200) {
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
            submissionSite: r.submissionSite ?? got.data.submissionSite,
            reviewType: r.reviewType ?? got.data.reviewType,
            pageLimit: r.pageLimit ?? got.data.pageLimit,
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
  return { attempted, updated, unchanged, failed, pending: rows.length - attempted };
}
