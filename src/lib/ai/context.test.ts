import { describe, expect, it } from "vitest";
import { extractCfp } from "@/lib/sources/cfp";
import { fixture } from "@/lib/sources/test-utils";
import { chunkCfp, selectChunks } from "./context";
import { arxivQueryUrl, parseArxivFeed } from "./arxiv";
import { isAllowedUrl } from "./tools";

describe("CFP chunking for grounding", () => {
  const cfp = extractCfp(
    fixture("cfp-icml-2026.html"),
    "https://icml.cc/Conferences/2026/CallForPapers",
  );
  const chunks = chunkCfp(cfp.text);

  it("splits the real ICML 2026 CFP into numbered, bounded sections", () => {
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.map((c) => c.id)).toEqual(chunks.map((_, i) => i + 1));
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(2300);
    expect(chunks.map((c) => c.text).join("\n")).toMatch(/Topics of interest/);
  });

  it("keeps short CFPs whole and trims long ones to the most relevant sections", () => {
    expect(selectChunks(chunks, "anything", 1_000_000)).toHaveLength(chunks.length);
    const picked = selectChunks(
      chunks,
      "Elaborate the problem statement and topics of interest",
      3000,
    );
    expect(picked.reduce((n, c) => n + c.text.length, 0)).toBeLessThanOrEqual(3000);
    expect(picked.map((c) => c.text).join("\n")).toMatch(/topics of interest|machine learning/i);
    const ids = picked.map((c) => c.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });
});

describe("assistant tools helpers", () => {
  it("enforces the fetchPage allow-list", () => {
    expect(isAllowedUrl("https://openreview.net/group?id=ICML.cc/2026", [])).toBe(true);
    expect(isAllowedUrl("https://arxiv.org/abs/2610.05808", [])).toBe(true);
    expect(isAllowedUrl("https://icml.cc/Conferences/2026/AuthorInstructions", ["icml.cc"])).toBe(
      true,
    );
    expect(isAllowedUrl("https://media.icml.cc/x.pdf", ["icml.cc"])).toBe(true);
    expect(isAllowedUrl("https://evil.example.com/", ["icml.cc"])).toBe(false);
    expect(isAllowedUrl("https://openreview.net.evil.com/", [])).toBe(false);
    expect(isAllowedUrl("file:///etc/passwd", [])).toBe(false);
  });

  it("parses a real arXiv API response", () => {
    const papers = parseArxivFeed(fixture("arxiv-diffusion-protein.xml"), 3);
    expect(papers).toHaveLength(3);
    expect(papers[0].title).toMatch(/DiMOS/);
    expect(papers[0].url).toMatch(/^https:\/\/arxiv\.org\/abs\//);
    expect(papers[0].published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("builds arXiv query URLs", () => {
    expect(arxivQueryUrl('diffusion "protein"', 9)).toContain("max_results=5");
    expect(arxivQueryUrl("diffusion protein", 2)).toContain(
      "search_query=all%3Adiffusion+AND+all%3Aprotein",
    );
  });
});
