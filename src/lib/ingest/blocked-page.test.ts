import { describe, expect, it } from "vitest";
import { isUsableScrape, looksBlocked } from "./blocked-page";

describe("blocked-page detection", () => {
  it("recognises the error page Springer served to datacenter IPs", () => {
    const junk =
      "A required part of this site couldn’t load. This may be due to a browser extension, network issues, or browser settings. Please check your connection, disable any ad blockers, or try using a different browser.";
    expect(looksBlocked(junk)).toBe(true);
    expect(isUsableScrape(junk)).toBe(false);
  });

  it("recognises common challenge pages", () => {
    for (const s of [
      "<title>Just a moment...</title><h1>Checking your browser before accessing</h1>",
      "Attention Required! | Cloudflare",
      "Please enable JavaScript and cookies to continue",
      "Our systems have detected unusual traffic from your computer network.",
      "Access Denied. You don't have permission to access this resource.",
      "Please complete the CAPTCHA to continue",
    ]) {
      expect(looksBlocked(s), s).toBe(true);
    }
  });

  it("does not flag real aims & scope text", () => {
    const real =
      "The Journal of Machine Learning Research publishes high-quality scholarly articles in all areas of machine learning. ".repeat(
        4,
      );
    expect(looksBlocked(real)).toBe(false);
    expect(isUsableScrape(real)).toBe(true);
  });

  it("rejects empty, whitespace and too-short values", () => {
    expect(isUsableScrape(null)).toBe(false);
    expect(isUsableScrape(undefined)).toBe(false);
    expect(isUsableScrape("   \n ")).toBe(false);
    expect(isUsableScrape("Too short to be a scope.")).toBe(false);
  });

  it("only inspects the start of long documents", () => {
    const long = "x ".repeat(5000) + " captcha ";
    expect(looksBlocked(long)).toBe(false);
  });
});
