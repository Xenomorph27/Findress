import { eq, inArray, notInArray, sql } from "drizzle-orm";
import { JOURNAL_SEED, type JournalSeed } from "@/data/journals-seed";
import type { Db } from "@/lib/db";
import { journals, specialIssues } from "@/lib/db/schema";
import {
  coreJournalPageUrl,
  extractScopeText,
  normalizeOpenAlexSource,
  normalizeTitle,
  normalizeWikiCfpSpecialIssue,
  openAlexUrl,
  OpenAlexSourceSchema,
  parseCcfRankJs,
  parseCoreJournalPage,
  parseSpringerMetrics,
  parseSpringerUpdates,
  specialIssueFeedItems,
  type SpecialIssueInput,
} from "@/lib/sources/journals";
import { tagEvent } from "@/lib/sources/topics";
import { eventPageUrl, feedUrl, WIKICFP_CATEGORIES } from "@/lib/sources/wikicfp";
import { RobotsDisallowedError, type PoliteFetcher } from "./http";
import { sha256Hex } from "./keys";

/**
 * Journal ingestion steps (fail soft per journal; every network call goes through the polite
 * fetcher: robots.txt for HTML, ≥1 req/s per host, DB cache):
 * - journals:        upsert the curated seed list, then OpenAlex metrics per ISSN
 * - journal-ranks:   CCF (CCFrank4dblp data, MIT) + CORE2020 journal list (portal.core.edu.au)
 * - journal-pages:   aims & scope text; Springer metrics + calls for papers
 * - special-issues:  WikiCFP "special issue" / "journal" feeds and category feeds
 */

interface StepOut {
  items: number;
  stats: Record<string, number | string>;
  warnings: string[];
}

type Log = (m: string) => void;
const DAY = 86_400_000;

function provenance(fields: string[], source: string) {
  return Object.fromEntries(fields.map((f) => [f, source]));
}

async function mergeSources(db: Db, id: number, source: string, prov: Record<string, string>) {
  await db
    .update(journals)
    .set({
      sources: sql`(select array(select distinct unnest(${journals.sources} || array[${source}]::text[])))`,
      fieldProvenance: sql`${journals.fieldProvenance} || ${JSON.stringify(prov)}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(journals.id, id));
}

/** Upsert the seed list (the source of truth for which journals exist). */
export async function upsertSeedJournals(db: Db, seeds: JournalSeed[] = JOURNAL_SEED) {
  for (const s of seeds) {
    const values = {
      slug: s.slug,
      name: s.name,
      abbreviation: s.abbreviation,
      publisher: s.publisher,
      issnPrint: s.issnPrint,
      issnOnline: s.issnOnline,
      issns: s.issns,
      openalexId: s.openalexId,
      homepage: s.homepage,
      submissionUrl: s.submissionUrl,
      scopeUrl: s.scopeUrl,
      subfields: s.subfields,
      ...(s.openAccess ? { openAccess: s.openAccess } : {}),
    };
    await db
      .insert(journals)
      .values({ ...values, sources: ["seed"] })
      .onConflictDoUpdate({ target: journals.slug, set: { ...values, updatedAt: new Date() } });
  }
  const removed = await db
    .delete(journals)
    .where(
      notInArray(
        journals.slug,
        seeds.map((s) => s.slug),
      ),
    )
    .returning({ id: journals.id });
  return { upserted: seeds.length, removed: removed.length };
}

export async function runJournalsStep(
  db: Db,
  fetcher: PoliteFetcher,
  deadlineMs: number,
  env: Record<string, string | undefined>,
  log: Log,
): Promise<StepOut> {
  const seeded = await upsertSeedJournals(db);
  const rows = await db.select({ id: journals.id, slug: journals.slug }).from(journals);
  const idBySlug = new Map(rows.map((r) => [r.slug, r.id]));
  const warnings: string[] = [];
  let updated = 0;
  let skipped = 0;
  for (const seed of JOURNAL_SEED) {
    if (Date.now() > deadlineMs - 5_000) {
      warnings.push("time budget reached; remaining journals keep previous metrics");
      break;
    }
    const url = openAlexUrl(seed, env);
    const id = idBySlug.get(seed.slug);
    if (!url || !id) {
      skipped++;
      continue;
    }
    try {
      const raw = await fetcher.getJson<unknown>(url, {
        cacheTtlMs: 20 * 3600_000,
        cacheKey: `openalex:source:${seed.openalexId ?? seed.issns[0]}`,
        minIntervalMs: 150,
        timeoutMs: 20_000,
      });
      const parsed = OpenAlexSourceSchema.safeParse(raw);
      if (!parsed.success) {
        warnings.push(`${seed.abbreviation}: unexpected OpenAlex shape`);
        continue;
      }
      const m = normalizeOpenAlexSource(parsed.data, seed);
      await db
        .update(journals)
        .set({
          publisher: m.publisher,
          homepage: m.homepage,
          openAccess: m.openAccess,
          apcUsd: m.apcUsd,
          hIndex: m.hIndex,
          i10Index: m.i10Index,
          twoYrMeanCitedness: m.twoYrMeanCitedness,
          worksCount: m.worksCount,
          citedByCount: m.citedByCount,
          metricsAsOf: m.metricsAsOf,
          topics: m.topics,
          countsByYear: m.countsByYear,
          issns: m.issns,
        })
        .where(eq(journals.id, id));
      await mergeSources(db, id, "openalex", {
        ...provenance(
          [
            "hIndex",
            "i10Index",
            "twoYrMeanCitedness",
            "worksCount",
            "citedByCount",
            "topics",
            "apcUsd",
          ],
          "openalex",
        ),
        ...(m.openAccessSource ? { openAccess: m.openAccessSource } : {}),
        ...(seed.publisher ? { publisher: "crossref" } : { publisher: "openalex" }),
      });
      updated++;
    } catch (err) {
      warnings.push(`${seed.abbreviation}: ${(err as Error).message}`.slice(0, 200));
    }
  }
  log(`  journals: ${seeded.upserted} seeded, ${updated} with OpenAlex metrics`);
  return {
    items: updated,
    stats: { seeded: seeded.upserted, removed: seeded.removed, openalex: updated, skipped },
    warnings,
  };
}

const CCFRANK_BASE = "https://raw.githubusercontent.com/WenyanLiu/CCFrank4dblp/master/data";

export async function runJournalRanksStep(
  db: Db,
  fetcher: PoliteFetcher,
  deadlineMs: number,
  log: Log,
): Promise<StepOut> {
  const warnings: string[] = [];
  const rows = await db.select({ id: journals.id, name: journals.name }).from(journals);
  const byName = new Map(rows.map((r) => [normalizeTitle(r.name), r.id]));

  // CCF (2026 list) via the MIT-licensed CCFrank4dblp data files.
  let ccfMatched = 0;
  try {
    const [full, rank] = await Promise.all([
      fetcher.getText(`${CCFRANK_BASE}/ccfRankFull.js`, {
        cacheTtlMs: 7 * DAY,
        minIntervalMs: 200,
      }),
      fetcher.getText(`${CCFRANK_BASE}/ccfRankUrl.js`, { cacheTtlMs: 7 * DAY, minIntervalMs: 200 }),
    ]);
    const ccf = parseCcfRankJs(full, rank);
    for (const [name, id] of byName) {
      const r = ccf.get(name) ?? null;
      await db.update(journals).set({ rankCcf: r }).where(eq(journals.id, id));
      if (r) {
        ccfMatched++;
        await mergeSources(db, id, "ccf", { rankCcf: "ccf" });
      }
    }
  } catch (err) {
    warnings.push(`CCF: ${(err as Error).message}`.slice(0, 200));
  }

  // CORE journal ranks (CORE2020, the final edition; CORE stopped ranking journals in 2022).
  let coreMatched = 0;
  try {
    const first = parseCoreJournalPage(
      await fetcher.getText(coreJournalPageUrl(1), { robots: true, cacheTtlMs: 30 * DAY }),
    );
    const pages = Math.ceil((first.total ?? first.rows.length) / 50);
    const all = [...first.rows];
    for (let p = 2; p <= pages && Date.now() < deadlineMs - 10_000; p++) {
      const html = await fetcher.getText(coreJournalPageUrl(p), {
        robots: true,
        cacheTtlMs: 30 * DAY,
      });
      all.push(...parseCoreJournalPage(html).rows);
    }
    const core = new Map(all.map((r) => [normalizeTitle(r.title), r.rank]));
    for (const [name, id] of byName) {
      const r = core.get(name) ?? null;
      await db.update(journals).set({ rankCoreJournal: r }).where(eq(journals.id, id));
      if (r) {
        coreMatched++;
        await mergeSources(db, id, "core", { rankCoreJournal: "core" });
      }
    }
    log(`  journal-ranks: CORE ${all.length} rows, ${coreMatched} matched; CCF ${ccfMatched}`);
  } catch (err) {
    warnings.push(
      err instanceof RobotsDisallowedError
        ? "CORE: robots.txt disallows the journal portal; skipped"
        : `CORE: ${(err as Error).message}`.slice(0, 200),
    );
  }
  return {
    items: ccfMatched + coreMatched,
    stats: { ccf: ccfMatched, core: coreMatched },
    warnings,
  };
}

async function writeSpecialIssues(db: Db, items: SpecialIssueInput[], now: Date) {
  if (items.length === 0) return 0;
  const slugs = [...new Set(items.map((i) => i.journalSlug).filter((s): s is string => !!s))];
  const rows = slugs.length
    ? await db
        .select({ id: journals.id, slug: journals.slug })
        .from(journals)
        .where(inArray(journals.slug, slugs))
    : [];
  const idBySlug = new Map(rows.map((r) => [r.slug, r.id]));
  for (const it of items) {
    const tags = tagEvent({
      seriesKey: "",
      name: it.title,
      description: it.descriptionText?.slice(0, 4000) ?? null,
    });
    const values = {
      journalId: it.journalSlug ? (idBySlug.get(it.journalSlug) ?? null) : null,
      journalName: it.journalName,
      title: it.title,
      guestEditors: it.guestEditors,
      descriptionText: it.descriptionText?.slice(0, 30_000) ?? null,
      submissionDeadlineUtc: it.submissionDeadlineUtc ? new Date(it.submissionDeadlineUtc) : null,
      deadlineText: it.deadlineText,
      deadlineTz: it.deadlineTz,
      url: it.url,
      subfields: tags.subfields,
      topics: tags.topics.slice(0, 6),
      lastSeenAt: now,
    };
    await db
      .insert(specialIssues)
      .values({ ...values, source: it.source, sourceId: it.sourceId })
      .onConflictDoUpdate({
        target: [specialIssues.source, specialIssues.sourceId],
        set: values,
      });
  }
  return items.length;
}

export async function runJournalPagesStep(
  db: Db,
  fetcher: PoliteFetcher,
  deadlineMs: number,
  log: Log,
): Promise<StepOut> {
  const warnings: string[] = [];
  const rows = await db.select().from(journals);
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  let scopes = 0;
  let unchanged = 0;
  let metrics = 0;
  const calls: SpecialIssueInput[] = [];
  const now = new Date();
  for (const seed of JOURNAL_SEED) {
    if (Date.now() > deadlineMs - 10_000) {
      warnings.push("time budget reached; remaining journal pages next run");
      break;
    }
    const row = bySlug.get(seed.slug);
    if (!row) continue;
    const opts = { robots: true, cacheTtlMs: 7 * DAY, timeoutMs: 20_000, maxBytes: 3_000_000 };
    if (seed.scopeUrl) {
      try {
        const res = await fetcher.get(seed.scopeUrl, opts);
        const text = res.ok ? extractScopeText(res.text, seed.scopeUrl) : null;
        if (text) {
          const hash = await sha256Hex(text);
          if (hash === row.scopeHash) unchanged++;
          else {
            const topics = tagEvent({ seriesKey: "", name: seed.name, description: text }).topics;
            await db
              .update(journals)
              .set({
                scopeText: text,
                scopeHash: hash,
                scopeFetchedAt: now,
                topics: [...new Set([...topics, ...row.topics])].slice(0, 10),
              })
              .where(eq(journals.id, row.id));
            await mergeSources(db, row.id, "journal-site", { scopeText: "journal-site" });
            scopes++;
          }
        } else if (!res.ok) warnings.push(`${seed.abbreviation} scope: HTTP ${res.status}`);
      } catch (err) {
        warnings.push(`${seed.abbreviation} scope: ${(err as Error).message}`.slice(0, 160));
      }
    }
    if (seed.homepage?.startsWith("https://link.springer.com/journal/")) {
      try {
        const home = await fetcher.get(seed.homepage, opts);
        if (home.ok) {
          const m = parseSpringerMetrics(home.text);
          await db
            .update(journals)
            .set({
              impactMetrics: m.impactMetrics.map((x) => ({
                ...x,
                source: "Springer journal page",
                url: seed.homepage,
              })),
              avgTimeToFirstDecision: m.timeToFirstDecision,
            })
            .where(eq(journals.id, row.id));
          await mergeSources(db, row.id, "journal-site", {
            ...(m.impactMetrics.length ? { impactMetrics: "journal-site" } : {}),
            ...(m.timeToFirstDecision ? { avgTimeToFirstDecision: "journal-site" } : {}),
          });
          metrics++;
        }
        if (seed.cfpUrl) {
          const up = await fetcher.get(seed.cfpUrl, { ...opts, cacheTtlMs: DAY });
          if (up.ok) calls.push(...parseSpringerUpdates(up.text, seed.cfpUrl, seed.slug));
        }
      } catch (err) {
        warnings.push(`${seed.abbreviation} springer: ${(err as Error).message}`.slice(0, 160));
      }
    }
  }
  const written = await writeSpecialIssues(db, calls, now);
  log(
    `  journal-pages: ${scopes} scopes updated, ${metrics} metric blocks, ${written} Springer calls`,
  );
  return {
    items: scopes + unchanged + metrics,
    stats: { scopes, unchanged, metrics, springerCalls: written },
    warnings,
  };
}

/** Categories whose feeds carry journal special issues next to conferences. */
const SI_FEEDS = ["special issue", "journal"];

export async function runSpecialIssuesStep(
  db: Db,
  fetcher: PoliteFetcher,
  deadlineMs: number,
  log: Log,
): Promise<StepOut> {
  const warnings: string[] = [];
  const now = new Date();
  const seen = new Map<string, Awaited<ReturnType<typeof specialIssueFeedItems>>[number]>();
  for (const cat of [...SI_FEEDS, ...WIKICFP_CATEGORIES]) {
    try {
      const xml = await fetcher.getText(feedUrl(cat), {
        robots: true,
        cacheTtlMs: 12 * 3600_000,
        timeoutMs: 20_000,
      });
      for (const it of await specialIssueFeedItems(xml)) seen.set(it.eventId, it);
    } catch (err) {
      warnings.push(`feed ${cat}: ${(err as Error).message}`.slice(0, 160));
    }
  }
  const out: SpecialIssueInput[] = [];
  let pages = 0;
  for (const item of seen.values()) {
    if (Date.now() > deadlineMs - 15_000) {
      warnings.push("time budget reached; remaining calls next run");
      break;
    }
    let html: string | null = null;
    try {
      const res = await fetcher.get(eventPageUrl(item.eventId), {
        robots: true,
        cacheTtlMs: 3 * DAY,
        timeoutMs: 20_000,
      });
      if (res.ok) html = res.text;
      pages++;
    } catch (err) {
      warnings.push(`page ${item.eventId}: ${(err as Error).message}`.slice(0, 160));
    }
    const si = normalizeWikiCfpSpecialIssue(item, html, JOURNAL_SEED);
    if (!si) continue;
    // Keep calls for seed journals, plus AI-related calls elsewhere; skip long-closed ones.
    const relevant =
      si.journalSlug != null ||
      tagEvent({ seriesKey: "", name: si.title, description: si.descriptionText }).subfields
        .length > 0;
    const stale =
      si.submissionDeadlineUtc != null &&
      Date.parse(si.submissionDeadlineUtc) < now.getTime() - 365 * DAY;
    if (relevant && !stale) out.push(si);
  }
  const written = await writeSpecialIssues(db, out, now);
  log(`  special-issues: ${seen.size} candidate calls, ${written} kept`);
  return { items: written, stats: { candidates: seen.size, pages, kept: written }, warnings };
}
