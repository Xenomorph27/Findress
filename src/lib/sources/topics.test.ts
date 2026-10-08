import { describe, expect, it } from "vitest";
import { extractCfpTopics, tagEvent } from "./topics";
import { parseEventPage } from "./wikicfp";
import { fixture } from "./test-utils";

describe("tagEvent", () => {
  it("uses the curated series map", () => {
    expect(
      tagEvent({ seriesKey: "icml", name: "International Conference on Machine Learning" })
        .subfields[0],
    ).toBe("ml");
    expect(
      tagEvent({
        seriesKey: "cvpr",
        name: "IEEE/CVF Conference on Computer Vision and Pattern Recognition",
      }).subfields,
    ).toContain("cv");
    expect(tagEvent({ seriesKey: "interspeech", name: "Interspeech" }).subfields).toEqual([
      "speech",
    ]);
  });

  it("maps source tags", () => {
    const t = tagEvent({
      seriesKey: "unknown",
      name: "Some Venue",
      tags: ["natural-language-processing", "large-language-models"],
    });
    expect(t.subfields).toEqual(expect.arrayContaining(["nlp", "genai"]));
  });

  it("tags from the name of a real WikiCFP workshop", () => {
    const t = tagEvent({
      seriesKey: "wllfm",
      name: "Fourth Workshop on Large Language and Foundation Models (WLLFM 2026)",
    });
    expect(t.subfields).toContain("genai");
  });

  it("does not tag from a single passing mention in long text", () => {
    const t = tagEvent({
      seriesKey: "x",
      name: "International Conference on Networks",
      description: "Topics include networking, and one mention of speech.",
    });
    expect(t.subfields).not.toContain("speech");
  });

  it("produces topic chips", () => {
    const t = tagEvent({
      seriesKey: "x",
      name: "Workshop on LLM Agents",
      description:
        "LLM agents, agentic systems, benchmarks and evaluation of large language models.",
    });
    expect(t.topics).toEqual(expect.arrayContaining(["LLMs", "Agents"]));
  });
});

describe("extractCfpTopics", () => {
  it("pulls bullet lists after a topics heading", () => {
    const text = `Call for Papers\nWe invite submissions on topics including, but not limited to:\n- Diffusion models\n- Large language models\n- Evaluation and benchmarks\n- Safety\n\nImportant dates`;
    expect(extractCfpTopics(text)).toEqual([
      "Diffusion models",
      "Large language models",
      "Evaluation and benchmarks",
      "Safety",
    ]);
  });

  it("returns [] when no list exists", () => {
    expect(extractCfpTopics("Just a paragraph about the conference.")).toEqual([]);
    expect(extractCfpTopics(null)).toEqual([]);
  });

  it("finds topics in a real WikiCFP CFP", () => {
    const page = parseEventPage(fixture("wikicfp", "event-203529.html"));
    const topics = extractCfpTopics(page.cfpText);
    expect(topics.length).toBeGreaterThanOrEqual(3);
  });
});
