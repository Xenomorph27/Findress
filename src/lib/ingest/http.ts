import { USER_AGENT } from "@/lib/site";

/**
 * Polite HTTP for ingestion (CLAUDE.md data rules):
 * - identifies as FIndressBot with a contact URL
 * - at most one request per host per `minIntervalMs` (default 1s), raised to the host's
 *   robots.txt Crawl-delay when larger; requests to one host are serialized
 * - honours robots.txt Allow/Disallow for HTML scraping
 * - timeouts + one retry on network errors / 5xx; never throws for HTTP status codes
 */

export interface RobotsRules {
  allow: string[];
  disallow: string[];
  crawlDelaySec: number | null;
}

/** Parse robots.txt, keeping the group for our bot name, else the "*" group. */
export function parseRobots(text: string, botName = "findressbot"): RobotsRules {
  const groups: { agents: string[]; rules: RobotsRules }[] = [];
  let current: { agents: string[]; rules: RobotsRules } | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: { allow: [], disallow: [], crawlDelaySec: null } };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "disallow" && value) current.rules.disallow.push(value);
    else if (key === "allow" && value) current.rules.allow.push(value);
    else if (key === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.rules.crawlDelaySec = n;
    }
  }
  const mine = groups.find((g) => g.agents.some((a) => a !== "*" && botName.includes(a)));
  const star = groups.find((g) => g.agents.includes("*"));
  return (mine ?? star)?.rules ?? { allow: [], disallow: [], crawlDelaySec: null };
}

function ruleMatches(rule: string, path: string): boolean {
  const anchored = rule.endsWith("$");
  const pattern = (anchored ? rule.slice(0, -1) : rule)
    .split("*")
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

/** Longest-match wins; Allow wins ties (Google semantics). */
export function isAllowedByRobots(rules: RobotsRules, pathWithQuery: string): boolean {
  let best: { len: number; allow: boolean } | null = null;
  for (const r of rules.disallow) {
    if (ruleMatches(r, pathWithQuery) && (!best || r.length > best.len)) {
      best = { len: r.length, allow: false };
    }
  }
  for (const r of rules.allow) {
    if (ruleMatches(r, pathWithQuery) && (!best || r.length >= best.len)) {
      best = { len: r.length, allow: true };
    }
  }
  return best?.allow ?? true;
}

export interface FetchResult {
  url: string;
  status: number;
  ok: boolean;
  text: string;
  contentType: string | null;
  fromCache: boolean;
  /** Seconds from a Retry-After header (429/503), when present. */
  retryAfterSec?: number | null;
}

export interface HttpCacheStore {
  get(url: string): Promise<{ status: number; body: string | null; fetchedAt: Date } | null>;
  set(url: string, status: number, body: string | null): Promise<void>;
}

export class MemoryHttpCache implements HttpCacheStore {
  private map = new Map<string, { status: number; body: string | null; fetchedAt: Date }>();
  async get(url: string) {
    return this.map.get(url) ?? null;
  }
  async set(url: string, status: number, body: string | null) {
    this.map.set(url, { status, body, fetchedAt: new Date() });
  }
}

export class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super(`robots.txt disallows ${url}`);
    this.name = "RobotsDisallowedError";
  }
}

export interface GetOptions {
  /** Check robots.txt before fetching (HTML scraping). */
  robots?: boolean;
  /** Serve from cache when younger than this. */
  cacheTtlMs?: number;
  accept?: string;
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
  /** Cache under this key instead of the URL (e.g. URL + content hash). */
  cacheKey?: string;
  /** Per-call minimum spacing for this host (API/CDN hosts); robots Crawl-delay still wins. */
  minIntervalMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class PoliteFetcher {
  private nextSlot = new Map<string, number>();
  private chains = new Map<string, Promise<unknown>>();
  private robots = new Map<string, Promise<RobotsRules>>();
  readonly requests = new Map<string, number>();

  constructor(
    private opts: {
      userAgent?: string;
      minIntervalMs?: number;
      cache?: HttpCacheStore;
      fetchImpl?: typeof fetch;
    } = {},
  ) {}

  private get ua() {
    return this.opts.userAgent ?? USER_AGENT;
  }
  private get fetchImpl() {
    return this.opts.fetchImpl ?? fetch;
  }

  private async robotsFor(origin: string): Promise<RobotsRules> {
    let p = this.robots.get(origin);
    if (!p) {
      p = this.raw(`${origin}/robots.txt`, { timeoutMs: 10_000 })
        .then((r) =>
          r.ok ? parseRobots(r.text) : { allow: [], disallow: [], crawlDelaySec: null },
        )
        .catch(() => ({ allow: [], disallow: [], crawlDelaySec: null }));
      this.robots.set(origin, p);
    }
    return p;
  }

  /** Serialize per host and wait for the host's next free slot. */
  private schedule<T>(host: string, intervalMs: number, task: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(host) ?? Promise.resolve();
    const run = prev
      .catch(() => {})
      .then(async () => {
        // Timers can fire early (notably on Windows): loop until the slot is really reached.
        let wait = (this.nextSlot.get(host) ?? 0) - Date.now();
        while (wait > 0) {
          await sleep(wait);
          wait = (this.nextSlot.get(host) ?? 0) - Date.now();
        }
        this.nextSlot.set(host, Date.now() + intervalMs);
        this.requests.set(host, (this.requests.get(host) ?? 0) + 1);
        return task();
      });
    this.chains.set(host, run);
    return run;
  }

  private async raw(url: string, o: GetOptions): Promise<FetchResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), o.timeoutMs ?? 20_000);
    try {
      const res = await this.fetchImpl(url, {
        headers: {
          "User-Agent": this.ua,
          Accept: o.accept ?? "*/*",
          ...o.headers,
        },
        redirect: "follow",
        signal: controller.signal,
      });
      let text = await res.text();
      if (o.maxBytes && text.length > o.maxBytes) text = text.slice(0, o.maxBytes);
      return {
        url: res.url || url,
        status: res.status,
        ok: res.ok,
        text,
        contentType: res.headers.get("content-type"),
        fromCache: false,
        retryAfterSec: Number(res.headers.get("retry-after")) || null,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async get(url: string, o: GetOptions = {}): Promise<FetchResult> {
    const target = new URL(url);
    const cacheKey = o.cacheKey ?? url;
    if (o.cacheTtlMs && this.opts.cache) {
      const hit = await this.opts.cache.get(cacheKey);
      if (hit && Date.now() - hit.fetchedAt.getTime() < o.cacheTtlMs) {
        return {
          url,
          status: hit.status,
          ok: hit.status >= 200 && hit.status < 300,
          text: hit.body ?? "",
          contentType: null,
          fromCache: true,
        };
      }
    }
    const rules = o.robots ? await this.robotsFor(target.origin) : null;
    if (rules && !isAllowedByRobots(rules, target.pathname + target.search)) {
      throw new RobotsDisallowedError(url);
    }
    const interval = Math.max(
      o.minIntervalMs ?? this.opts.minIntervalMs ?? 1000,
      (rules?.crawlDelaySec ?? 0) * 1000,
    );

    let attempt = 0;
    for (;;) {
      try {
        const res = await this.schedule(target.host, interval, () => this.raw(url, o));
        // Rate limited: back off the whole host (Retry-After, else 10s) and retry up to 3 times.
        if (res.status === 429 && attempt < 3) {
          attempt++;
          const waitMs = Math.min((res.retryAfterSec ?? 10) * 1000, 60_000) * attempt;
          this.nextSlot.set(target.host, Date.now() + waitMs);
          continue;
        }
        if (res.status >= 500 && attempt === 0) {
          attempt++;
          continue;
        }
        if (o.cacheTtlMs && this.opts.cache && (res.ok || res.status === 404)) {
          await this.opts.cache.set(cacheKey, res.status, res.ok ? res.text : null);
        }
        return res;
      } catch (err) {
        if (attempt === 0 && !(err instanceof RobotsDisallowedError)) {
          attempt++;
          continue;
        }
        throw err;
      }
    }
  }

  async getJson<T>(url: string, o: GetOptions = {}): Promise<T> {
    const res = await this.get(url, { accept: "application/json", ...o });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return JSON.parse(res.text) as T;
  }

  async getText(url: string, o: GetOptions = {}): Promise<string> {
    const res = await this.get(url, o);
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return res.text;
  }

  /** True when a fresh cached copy exists (no network). */
  async isCached(cacheKey: string, ttlMs: number): Promise<boolean> {
    if (!this.opts.cache) return false;
    const hit = await this.opts.cache.get(cacheKey);
    return Boolean(hit && Date.now() - hit.fetchedAt.getTime() < ttlMs);
  }

  /** Effective delay for a host (after robots.txt was read), for planning budgets. */
  async intervalFor(origin: string): Promise<number> {
    const rules = await this.robotsFor(origin);
    return Math.max(this.opts.minIntervalMs ?? 1000, (rules.crawlDelaySec ?? 0) * 1000);
  }
}
