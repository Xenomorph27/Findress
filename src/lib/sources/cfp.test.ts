import { describe, expect, it } from "vitest";
import {
  detectPageLimit,
  detectReviewType,
  extractCfp,
  htmlToStructuredText,
  looksLikeCfpPage,
} from "./cfp";
import { fixture } from "./test-utils";

describe("extractCfp (real ICML 2026 Call for Papers page)", () => {
  const html = fixture("cfp-icml-2026.html");
  const out = extractCfp(html, "https://icml.cc/Conferences/2026/CallForPapers");

  it("extracts substantial main text with structure", () => {
    expect(out.title).toMatch(/ICML 2026/);
    expect(out.text.length).toBeGreaterThan(2000);
    expect(out.text).toMatch(/machine learning/i);
    expect(out.text).toMatch(/^- /m);
    // Navigation chrome should not dominate the text.
    expect(out.text.slice(0, 400)).not.toMatch(/Sign In|Log in/);
  });

  it("finds submission essentials only when stated", () => {
    expect(out.submissionSite ?? "").toMatch(/openreview\.net/);
    expect(out.reviewType).toBe("Double-blind");
    expect(out.pageLimit).toMatch(/^\d+ pages$/);
  });

  it("recognises CFP URLs", () => {
    expect(looksLikeCfpPage("https://icml.cc/Conferences/2026/CallForPapers", null)).toBe(true);
    expect(looksLikeCfpPage("https://icml.cc/", "ICML 2026")).toBe(false);
  });
});

describe("helpers", () => {
  it("converts headings and lists", () => {
    expect(
      htmlToStructuredText("<h2>Topics</h2><ul><li>Diffusion</li><li>LLMs</li></ul><p>End.</p>"),
    ).toBe("## Topics\n\n- Diffusion\n- LLMs\n\nEnd.");
  });

  it("detects page limits and review types conservatively", () => {
    expect(detectPageLimit("Papers are limited to eight pages excluding references.")).toBe(
      "8 pages",
    );
    expect(detectPageLimit("Submissions must not exceed 9 pages.")).toBe("9 pages");
    expect(detectPageLimit("The conference has 300 pages of proceedings.")).toBeNull();
    expect(detectReviewType("Reviewing is double-blind.")).toBe("Double-blind");
    expect(detectReviewType("Nothing here")).toBeNull();
  });
});
