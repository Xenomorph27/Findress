import { eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { events, extractions } from "@/lib/db/schema";
import {
  buildUserPrompt,
  EXTRACTOR_VERSION,
  parseModelJson,
  RawExtractionSchema,
  SYSTEM_PROMPT,
  verifyExtraction,
  type VerifiedExtraction,
} from "@/lib/sources/cfp-extract";
import { applyExtractions } from "./apply-extractions";

/**
 * The AI extraction is OFF unless ENABLE_AI_EXTRACTION=true (like ENABLE_LLM_TAGGING). The API key
 * alone must not start it: turn it on only after the accuracy sample has been reviewed.
 */
export function extractionEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ENABLE_AI_EXTRACTION === "true";
}

/** Free-tier friendly defaults; the daily cap also protects the quota "Ask FIndress" needs. */
export interface ExtractConfig {
  /** Max model requests in one run. */
  perRun: number;
  /** Max model requests per UTC day across runs (this step only). */
  dailyLimit: number;
  /** Minimum gap between requests; 13 s stays under 5 requests per minute. */
  minIntervalMs: number;
  maxRetries: number;
}

export function extractConfig(
  env: Record<string, string | undefined> = process.env,
): ExtractConfig {
  const n = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    perRun: n(env.EXTRACT_PER_RUN, 12),
    dailyLimit: n(env.EXTRACT_DAILY_LIMIT, 60),
    minIntervalMs: n(env.EXTRACT_MIN_INTERVAL_MS, 13_000),
    maxRetries: n(env.EXTRACT_MAX_RETRIES, 3),
  };
}

export interface ApiErrorInfo {
  quota: boolean;
  /** The per-day quota is spent: retrying today is pointless. */
  daily: boolean;
  retryAfterMs: number | null;
}

/** Recognise rate-limit / quota errors from the AI SDK (HTTP 429, RESOURCE_EXHAUSTED …). */
export function classifyApiError(err: unknown): ApiErrorInfo {
  const e = err as {
    statusCode?: number;
    message?: string;
    responseBody?: string;
    responseHeaders?: Record<string, string>;
  };
  const text = `${e?.message ?? ""} ${e?.responseBody ?? ""}`;
  const quota =
    e?.statusCode === 429 || /RESOURCE_EXHAUSTED|quota|rate.?limit|too many requests/i.test(text);
  if (!quota) return { quota: false, daily: false, retryAfterMs: null };
  const daily = /per.?day|daily|PerDay/i.test(text);
  const hdr = Number(e?.responseHeaders?.["retry-after"]);
  const fromBody = /retry(?:Delay)?"?\s*(?:in|:)?\s*"?(\d+(?:\.\d+)?)\s*s/i.exec(text);
  const seconds = Number.isFinite(hdr) && hdr > 0 ? hdr : fromBody ? Number(fromBody[1]) : null;
  return { quota, daily, retryAfterMs: seconds != null ? Math.ceil(seconds * 1000) : null };
}

export interface Clock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}
export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/** Spaces requests at least `minIntervalMs` apart. */
export class RequestPacer {
  private last = 0;
  constructor(
    private minIntervalMs: number,
    private clock: Clock = realClock,
  ) {}
  async wait(): Promise<void> {
    const gap = this.last + this.minIntervalMs - this.clock.now();
    if (gap > 0) await this.clock.sleep(gap);
    this.last = this.clock.now();
  }
}

export class QuotaExhausted extends Error {
  constructor(
    message: string,
    readonly daily: boolean,
  ) {
    super(message);
  }
}

/**
 * Call `fn`, retrying quota errors with the server's suggested delay (else 30 s, 60 s, 120 s).
 * Throws QuotaExhausted for a spent daily quota or when waiting would pass `deadlineMs`.
 */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: { maxRetries: number; deadlineMs: number; clock?: Clock },
): Promise<T> {
  const clock = opts.clock ?? realClock;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const info = classifyApiError(err);
      if (!info.quota) throw err;
      if (info.daily) throw new QuotaExhausted("daily quota exhausted", true);
      if (attempt >= opts.maxRetries)
        throw new QuotaExhausted("rate limited; retries used up", false);
      const wait = info.retryAfterMs ?? 30_000 * 2 ** attempt;
      if (clock.now() + wait > opts.deadlineMs)
        throw new QuotaExhausted("rate limited; no time left to wait", false);
      await clock.sleep(wait);
    }
  }
}

export interface ExtractTarget {
  id: number;
  acronym: string;
  name: string | null;
  year: number;
  cfpText: string;
  cfpHash: string;
  sourceUrl: string;
}

export type Generate = (system: string, prompt: string) => Promise<string>;

/** One page: ask the model, parse its reply strictly, verify every claim against the page. */
export async function extractOne(
  generate: Generate,
  target: ExtractTarget,
): Promise<{ verified: VerifiedExtraction; claimed: number }> {
  const reply = await generate(SYSTEM_PROMPT, buildUserPrompt(target, target.cfpText));
  const raw = RawExtractionSchema.parse(parseModelJson(reply));
  const verified = verifyExtraction(target.cfpText, target, raw);
  const claimed = raw.deadlines.length + (raw.mode ? 1 : 0) + (raw.description ? 1 : 0);
  return { verified, claimed };
}

/** Store the verified values (with quotes) and mark the page as read. */
export async function storeExtraction(
  db: Db,
  target: ExtractTarget,
  verified: VerifiedExtraction,
  model: string,
): Promise<void> {
  const common = {
    eventId: target.id,
    sourceUrl: target.sourceUrl,
    model,
    promptVersion: EXTRACTOR_VERSION,
    contentHash: target.cfpHash,
  };
  await db.transaction(async (tx) => {
    await tx.delete(extractions).where(eq(extractions.eventId, target.id));
    const rows: (typeof extractions.$inferInsert)[] = [
      ...verified.deadlines.map((d) => ({
        ...common,
        field: "deadline",
        kind: d.kind,
        label: d.label,
        dueAtUtc: d.dueAtUtc,
        originalText: d.originalText,
        originalTz: d.originalTz,
        zoneAssumed: d.zoneAssumed,
        quote: d.quote,
      })),
      ...(verified.mode
        ? [{ ...common, field: "mode", value: verified.mode.value, quote: verified.mode.quote }]
        : []),
      ...(verified.description
        ? [
            {
              ...common,
              field: "description",
              value: verified.description.value,
              quote: verified.description.quote,
            },
          ]
        : []),
    ];
    if (rows.length) await tx.insert(extractions).values(rows);
    await tx
      .update(events)
      .set({ aiExtractedHash: target.cfpHash, aiExtractedAt: new Date() })
      .where(eq(events.id, target.id));
  });
}

/** Events worth reading: upcoming, with CFP text, not yet read at this text version. */
export async function loadCandidates(db: Db, limit: number): Promise<ExtractTarget[]> {
  if (limit <= 0) return [];
  const res = await db.execute(sql`
    select e.id, e.acronym, e.name, e.year, e.cfp_text, e.cfp_hash, coalesce(e.cfp_url, e.website) as source_url
    from events e
    where e.cfp_text is not null and length(e.cfp_text) >= 400 and e.cfp_hash is not null
      and (e.end_date is null or e.end_date >= current_date - 7)
      and e.year >= extract(year from now())::int - 1
      and e.ai_extracted_hash is distinct from e.cfp_hash
      and (
        not exists (select 1 from deadlines d where d.event_id = e.id)
        or e.mode is null or e.description is null or e.description = ''
        -- already read once and the page has changed since: the old values may be stale
        or e.ai_extracted_hash is not null
      )
    order by exists (select 1 from deadlines d where d.event_id = e.id) asc,
             e.ai_extracted_at asc nulls first, e.start_date asc nulls last, e.id
    limit ${limit}`);
  return (res.rows as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    acronym: String(r.acronym),
    name: (r.name as string | null) ?? null,
    year: Number(r.year),
    cfpText: String(r.cfp_text),
    cfpHash: String(r.cfp_hash),
    sourceUrl: String(r.source_url ?? ""),
  }));
}

async function requestsToday(db: Db): Promise<number> {
  const res = await db.execute(sql`
    select coalesce(sum((stats ->> 'requests')::int), 0)::int as n
    from source_runs
    where source = 'extract' and started_at >= (now() at time zone 'utc')::date`);
  return Number((res.rows[0] as { n?: number } | undefined)?.n ?? 0);
}

export interface ExtractStepDeps {
  generate: Generate;
  model: string;
  clock?: Clock;
  config?: ExtractConfig;
}

/**
 * The pipeline step: small batches, paced, capped per day, backing off on rate limits, and always
 * keeping whatever it already finished when it has to stop.
 */
export async function runExtractStep(
  db: Db,
  deadlineMs: number,
  log: (m: string) => void,
  deps: ExtractStepDeps,
) {
  const cfg = deps.config ?? extractConfig();
  const clock = deps.clock ?? realClock;
  const used = await requestsToday(db);
  const budget = Math.max(0, Math.min(cfg.perRun, cfg.dailyLimit - used));
  const targets = await loadCandidates(db, budget);
  const pacer = new RequestPacer(cfg.minIntervalMs, clock);
  const stats = {
    requests: 0,
    processed: 0,
    deadlines: 0,
    modes: 0,
    descriptions: 0,
    rejected: 0,
    invalid: 0,
    quotaHit: 0,
    dailyUsed: used,
    dailyLimit: cfg.dailyLimit,
  };
  const warnings: string[] = [];
  if (budget === 0)
    warnings.push(`daily request budget used (${used}/${cfg.dailyLimit}); nothing sent`);

  for (const t of targets) {
    if (clock.now() + cfg.minIntervalMs + 20_000 > deadlineMs) {
      warnings.push("time budget reached; the rest is read in later runs");
      break;
    }
    try {
      await pacer.wait();
      stats.requests++;
      const { verified } = await withBackoff(() => extractOne(deps.generate, t), {
        maxRetries: cfg.maxRetries,
        deadlineMs,
        clock,
      });
      stats.rejected += verified.rejected.length;
      stats.deadlines += verified.deadlines.length;
      stats.modes += verified.mode ? 1 : 0;
      stats.descriptions += verified.description ? 1 : 0;
      await storeExtraction(db, t, verified, deps.model);
      stats.processed++;
      log(
        `  extract ${t.acronym} ${t.year}: ${verified.deadlines.length} deadlines${verified.mode ? ", mode" : ""}${verified.description ? ", description" : ""}${verified.rejected.length ? `, ${verified.rejected.length} rejected` : ""}`,
      );
    } catch (err) {
      if (err instanceof QuotaExhausted) {
        stats.quotaHit = 1;
        warnings.push(
          `stopped: ${err.message}${err.daily ? " (resumes after the daily reset)" : ""}`,
        );
        break;
      }
      stats.invalid++;
      warnings.push(`${t.acronym} ${t.year}: ${(err as Error).message}`.slice(0, 160));
      // Mark as tried so one unreadable reply cannot starve the queue; it is retried after the rest.
      await db.update(events).set({ aiExtractedAt: new Date() }).where(eq(events.id, t.id));
    }
  }
  await applyExtractions(db);
  return { items: stats.processed, stats, warnings };
}
