import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { MemoryHttpCache, PoliteFetcher, type HttpCacheStore } from "./http";
import { DbHttpCache } from "./persist";
import { createTestDb } from "./test-db";

let pg: PGlite;
let db: Db;
beforeAll(async () => {
  ({ pg, db } = await createTestDb());
}, 60_000);
afterAll(async () => pg.close());

const urls = (n: number, base = "http://example.org/p?id=") =>
  Array.from({ length: n }, (_, i) => `${base}${i}`);

describe("cache ages without loading bodies", () => {
  it("DbHttpCache.ages returns only what is cached, in a batch, for hundreds of URLs", async () => {
    const cache = new DbHttpCache(db);
    await cache.set("http://example.org/p?id=3", 200, "x".repeat(50_000));
    await cache.set("http://example.org/p?id=499", 200, "y");
    const ages = await cache.ages(urls(500));
    expect([...ages.keys()].sort()).toEqual([
      "http://example.org/p?id=3",
      "http://example.org/p?id=499",
    ]);
    expect(Date.now() - ages.get("http://example.org/p?id=3")!).toBeLessThan(60_000);
  });

  it("PoliteFetcher.cachedAtMany uses ONE store lookup, never one get() per URL", async () => {
    const inner = new MemoryHttpCache();
    await inner.set("http://example.org/p?id=7", 200, "body");
    let gets = 0;
    let agesCalls = 0;
    const spy: HttpCacheStore = {
      get: async (u) => (gets++, inner.get(u)),
      set: (u, s, b) => inner.set(u, s, b),
      ages: async (us) => (agesCalls++, inner.ages(us)),
    };
    const f = new PoliteFetcher({ cache: spy });
    const out = await f.cachedAtMany(urls(500));
    expect(agesCalls).toBe(1);
    expect(gets).toBe(0);
    expect([...out.keys()]).toEqual(["http://example.org/p?id=7"]);
  });

  it("falls back to per-URL lookups for a store without ages(), and with no cache returns nothing", async () => {
    const inner = new MemoryHttpCache();
    await inner.set("http://example.org/p?id=1", 200, "b");
    const legacy: HttpCacheStore = {
      get: (u) => inner.get(u),
      set: (u, s, b) => inner.set(u, s, b),
    };
    const out = await new PoliteFetcher({ cache: legacy }).cachedAtMany(urls(3));
    expect([...out.keys()]).toEqual(["http://example.org/p?id=1"]);
    expect((await new PoliteFetcher({}).cachedAtMany(urls(3))).size).toBe(0);
  });
});
