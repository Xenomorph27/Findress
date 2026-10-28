import { describe, expect, it, vi } from "vitest";
import type { LookupAddress } from "node:dns";
import { PoliteFetcher } from "./http";
import {
  assertFetchableUrl,
  BlockedDestinationError,
  isPublicAddress,
  publicOnlyLookup,
} from "./outbound";

// feedback F02: only public destinations, on every hop, with a streaming byte cap.

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:c0a8:101",
  ])("refuses %s", (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each(["8.8.8.8", "140.82.112.3", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "allows %s",
    (ip) => expect(isPublicAddress(ip)).toBe(true),
  );

  it("is false for anything that is not an IP", () => {
    expect(isPublicAddress("example.org")).toBe(false);
  });
});

describe("assertFetchableUrl", () => {
  it.each([
    "http://127.0.0.1:9876/private",
    "http://2130706433/",
    "http://0x7f.1/",
    "http://127.1/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://localhost:3000/",
    "http://api.localhost/",
    "http://169.254.169.254/latest/meta-data/",
    "https://user:pass@example.org/",
    "file:///etc/passwd",
    "ftp://example.org/",
  ])("refuses %s", (url) => {
    expect(() => assertFetchableUrl(url)).toThrow(BlockedDestinationError);
  });

  it("accepts public names and addresses", () => {
    expect(assertFetchableUrl("https://neurips.cc/Conferences/2027").hostname).toBe("neurips.cc");
    expect(assertFetchableUrl("http://8.8.8.8/").hostname).toBe("8.8.8.8");
  });

  it("applies the caller's host policy", () => {
    const only = (h: string) => h === "openreview.net";
    expect(() => assertFetchableUrl("https://evil.example/", only)).toThrow(/not allowed/);
    expect(() => assertFetchableUrl("https://openreview.net/forum", only)).not.toThrow();
  });
});

describe("publicOnlyLookup (connect-time check, no DNS rebinding)", () => {
  const resolver = (addrs: LookupAddress[]) =>
    ((_h: string, _o: unknown, cb: (e: null, a: LookupAddress[]) => void) =>
      cb(null, addrs)) as never;

  it("refuses a name that resolves to a private address", async () => {
    const err = await new Promise<Error | null>((done) =>
      publicOnlyLookup(
        "rebind.example",
        {},
        (e) => done(e),
        resolver([
          { address: "93.184.216.34", family: 4 },
          { address: "127.0.0.1", family: 4 },
        ]),
      ),
    );
    expect(err).toBeInstanceOf(BlockedDestinationError);
  });

  it("passes public addresses through in both callback shapes", async () => {
    const one = await new Promise<unknown[]>((done) =>
      publicOnlyLookup(
        "ok.example",
        {},
        (e, a, f) => done([e, a, f]),
        resolver([{ address: "93.184.216.34", family: 4 }]),
      ),
    );
    expect(one).toEqual([null, "93.184.216.34", 4]);
    const all = await new Promise<unknown>((done) =>
      publicOnlyLookup(
        "ok.example",
        { all: true },
        (_e, a) => done(a),
        resolver([{ address: "2606:4700::1", family: 6 }]),
      ),
    );
    expect(all).toEqual([{ address: "2606:4700::1", family: 6 }]);
  });
});

describe("PoliteFetcher redirects and size", () => {
  const fetcherWith = (routes: Record<string, () => Response>) => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      seen.push(String(url));
      const route = routes[String(url)];
      return route ? route() : new Response("missing", { status: 404 });
    }) as unknown as typeof fetch;
    return { fetcher: new PoliteFetcher({ fetchImpl, minIntervalMs: 0 }), seen };
  };
  const redirect = (to: string) => () =>
    new Response(null, { status: 302, headers: { location: to } });

  it("never contacts a private address given directly", async () => {
    const { fetcher, seen } = fetcherWith({});
    await expect(fetcher.get("http://127.0.0.1:9876/private")).rejects.toThrow(
      BlockedDestinationError,
    );
    expect(seen).toEqual([]);
  });

  it("refuses a public page that redirects to a private one", async () => {
    const { fetcher, seen } = fetcherWith({
      "https://public.example/cfp": redirect("http://192.168.1.1/admin"),
    });
    await expect(fetcher.get("https://public.example/cfp")).rejects.toThrow(
      BlockedDestinationError,
    );
    expect(seen).toEqual(["https://public.example/cfp"]);
  });

  it("refuses a redirect that leaves the caller's allow-list", async () => {
    const { fetcher } = fetcherWith({
      "https://openreview.net/x": redirect("https://elsewhere.example/y"),
    });
    await expect(
      fetcher.get("https://openreview.net/x", { allowHost: (h) => h === "openreview.net" }),
    ).rejects.toThrow(/not allowed/);
  });

  it("follows allowed relative redirects and reports the final URL", async () => {
    const { fetcher, seen } = fetcherWith({
      "https://a.example/old": redirect("/new"),
      "https://a.example/new": () => new Response("hello"),
    });
    const res = await fetcher.get("https://a.example/old");
    expect(res).toMatchObject({ ok: true, url: "https://a.example/new", text: "hello" });
    expect(seen).toEqual(["https://a.example/old", "https://a.example/new"]);
  });

  it("gives up after too many redirects", async () => {
    const { fetcher } = fetcherWith({
      "https://loop.example/a": redirect("https://loop.example/b"),
      "https://loop.example/b": redirect("https://loop.example/a"),
    });
    await expect(fetcher.get("https://loop.example/a")).rejects.toThrow(/too many redirects/);
  });

  it("stops reading a body at maxBytes instead of loading it all", async () => {
    let pulled = 0;
    const big = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new TextEncoder().encode("x".repeat(1000)));
        if (pulled > 1000) controller.close();
      },
    });
    const { fetcher } = fetcherWith({ "https://big.example/": () => new Response(big) });
    const res = await fetcher.get("https://big.example/", { maxBytes: 2500 });
    expect(res.text).toHaveLength(2500);
    expect(pulled).toBeLessThan(10);
  });
});
