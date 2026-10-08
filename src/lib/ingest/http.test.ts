import { describe, expect, it } from "vitest";
import { isAllowedByRobots, parseRobots, PoliteFetcher } from "./http";

// Real robots.txt from www.wikicfp.com (fetched 2026-10).
const WIKICFP_ROBOTS = `User-agent: Gigabot
Disallow: /
User-agent: Scrubby
Disallow: /
User-agent: Nutch
Disallow: /
User-agent: *
Disallow:
Crawl-delay: 5
Sitemap:http://www.wikicfp.com/cfp/sitemap.xml.gz`;

describe("robots.txt", () => {
  it("uses the * group and its Crawl-delay for our bot", () => {
    const rules = parseRobots(WIKICFP_ROBOTS);
    expect(rules.crawlDelaySec).toBe(5);
    expect(isAllowedByRobots(rules, "/cfp/servlet/event.showcfp?eventid=1")).toBe(true);
  });

  it("applies disallow with longest-match and allow overrides", () => {
    const rules = parseRobots(
      `User-agent: *\nDisallow: /private\nAllow: /private/cfp\nDisallow: /*.pdf$`,
    );
    expect(isAllowedByRobots(rules, "/private/x")).toBe(false);
    expect(isAllowedByRobots(rules, "/private/cfp/2026")).toBe(true);
    expect(isAllowedByRobots(rules, "/files/a.pdf")).toBe(false);
    expect(isAllowedByRobots(rules, "/files/a.pdf?x=1")).toBe(true);
  });

  it("prefers a group naming our bot", () => {
    const rules = parseRobots(`User-agent: *\nAllow: /\n\nUser-agent: FIndressBot\nDisallow: /`);
    expect(isAllowedByRobots(rules, "/anything")).toBe(false);
  });
});

describe("PoliteFetcher", () => {
  it("spaces requests to the same host and sends the User-Agent", async () => {
    const calls: { url: string; at: number; ua: string | null }[] = [];
    const fake: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({ url: String(input), at: Date.now(), ua: headers.get("user-agent") });
      return new Response("ok", { status: 200 });
    };
    const f = new PoliteFetcher({ minIntervalMs: 300, fetchImpl: fake });
    await Promise.all([
      f.get("https://a.test/1"),
      f.get("https://a.test/2"),
      f.get("https://b.test/1"),
    ]);
    const a = calls.filter((c) => c.url.startsWith("https://a.test"));
    expect(a).toHaveLength(2);
    expect(a[1].at - a[0].at).toBeGreaterThanOrEqual(260); // Windows Date.now() ticks are ~15.6ms;
    expect(calls[0].ua).toMatch(
      /^FIndressBot\/1\.0 \(\+https:\/\/github\.com\/Xenomorph27\/Findress\)$/,
    );
  });

  it("backs off and retries on HTTP 429", async () => {
    let n = 0;
    const fake: typeof fetch = async () =>
      ++n === 1
        ? new Response("slow down", { status: 429, headers: { "Retry-After": "0.05" } })
        : new Response("ok", { status: 200 });
    const f = new PoliteFetcher({ minIntervalMs: 1, fetchImpl: fake });
    const res = await f.get("https://d.test/x");
    expect(res.status).toBe(200);
    expect(n).toBe(2);
  });

  it("refuses URLs disallowed by robots.txt", async () => {
    const fake: typeof fetch = async (input) =>
      String(input).endsWith("/robots.txt")
        ? new Response("User-agent: *\nDisallow: /secret", { status: 200 })
        : new Response("page", { status: 200 });
    const f = new PoliteFetcher({ minIntervalMs: 1, fetchImpl: fake });
    await expect(f.get("https://c.test/secret/x", { robots: true })).rejects.toThrow(/robots/);
    await expect(f.get("https://c.test/open", { robots: true })).resolves.toMatchObject({
      ok: true,
    });
  });
});
