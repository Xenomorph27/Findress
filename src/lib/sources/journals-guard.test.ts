import { describe, expect, it } from "vitest";
import { extractScopeText, parseSpringerMetrics } from "./journals";

const BLOCK_PAGE = `<!doctype html><html><head><title>Springer</title></head><body>
<div class="error"><p>A required part of this site couldn’t load. This may be due to a browser extension, network issues, or browser settings. Please check your connection, disable any ad blockers, or try using a different browser.</p></div>
</body></html>`;

const REAL_PAGE = `<!doctype html><html><head><title>Aims and scope</title></head><body><main><article>
<h1>Aims and scope</h1>
<p>${"Machine Learning publishes high-quality research on all aspects of machine learning, including theory, algorithms and applications. ".repeat(4)}</p>
</article></main></body></html>`;

describe("journal page guards", () => {
  it("returns no scope text for a bot-block page served as HTTP 200", () => {
    expect(
      extractScopeText(BLOCK_PAGE, "https://link.springer.com/journal/10994/aims-and-scope"),
    ).toBeNull();
  });

  it("still extracts real aims & scope text", () => {
    const text = extractScopeText(REAL_PAGE, "https://example.org/aims");
    expect(text).toContain("Machine Learning publishes high-quality research");
  });

  it("yields no time-to-decision from a block page", () => {
    const m = parseSpringerMetrics(BLOCK_PAGE);
    expect(m.timeToFirstDecision).toBeNull();
  });
});
