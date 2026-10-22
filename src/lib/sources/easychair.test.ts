import { describe, expect, it } from "vitest";
import { EventInputSchema } from "@/lib/ingest/types";
import {
  easychairAdapter,
  isAiRelevant,
  normalizeEasyChair,
  parseEasyChairList,
} from "./easychair";
import { fixture } from "./test-utils";

const rows = () => parseEasyChairList(fixture("easychair", "cfp-sample.html"));
const norm = (acr: string) => normalizeEasyChair(rows().find((r) => r.acronym === acr)!);

describe("EasyChair Smart CFP", () => {
  it("parses the table: acronym, name, place, deadline, start date, topic tags", () => {
    const r = rows();
    expect(r).toHaveLength(10);
    expect(r[0]).toEqual({
      slug: "nl4ai-2026",
      acronym: "NL4AI2026",
      name: "9th Workshop on Natural Language for Artificial Intelligence @ AixiA 2026",
      place: "Bologna, Italy",
      deadline: "Oct 31, 2026",
      start: "Nov 26, 2026",
      tags: ["natural language processing", "artificial intelligence"],
    });
    expect(r[2].tags).toEqual([]);
  });

  it("turns an AI workshop into a valid event with its deadline, place and source link", () => {
    const { event } = norm("NL4AI2026");
    expect(event).not.toBeNull();
    expect(EventInputSchema.safeParse(event).success).toBe(true);
    expect(event).toMatchObject({
      source: "easychair",
      sourceId: "nl4ai-2026",
      year: 2026,
      type: "workshop",
      city: "Bologna",
      countryCode: "IT",
      startDate: "2026-11-26",
      website: "https://easychair.org/cfp/nl4ai-2026",
    });
    expect(event!.deadlines).toHaveLength(1);
    expect(event!.deadlines[0]).toMatchObject({ kind: "paper", originalTz: null });
    expect(event!.deadlines[0].dueAtUtc).toBe("2026-11-01T11:59:59.000Z"); // Oct 31, end of day AoE
    expect(event!.deadlines[0].comment).toMatch(/without a time zone/);
  });

  it("keeps calls that name AI/ML in the title, drops the ones that only tick a tag", () => {
    expect(norm("ICTAI 2026").event).not.toBeNull(); // title: artificial intelligence
    expect(norm("IWCN 2027").event).toBeNull(); // one "artificial intelligence" tag on nanotech
    expect(norm("TES2027").event).toBeNull(); // econometrics with a "machine learning" tag
    expect(norm("ICICT 2027").event).toBeNull(); // generic computing with two tags
    expect(norm("S2X").event).toBeNull(); // "SysML" is not ML
    expect(norm("AIMD2027").event).toBeNull(); // "AIMD" is just an acronym
  });

  it("accepts a call with three AI tags (one strong) even when the title is generic", () => {
    expect(norm("ABC 2027").event).not.toBeNull();
    expect(norm("ABC 2027").why).toMatch(/tags:/);
  });

  it("drops journal special issues and calls without a year", () => {
    expect(norm("SI-AI")).toMatchObject({ event: null, why: "not an event" });
    expect(norm("NOYEAR")).toMatchObject({ event: null, why: "no year" });
  });

  it("explains each verdict", () => {
    expect(isAiRelevant("Workshop on Large Language Models for Code", "LLM4Code", [])).toEqual({
      ok: true,
      why: "title: large language",
    });
    expect(
      isAiRelevant("International Conference on Control and Robotics Engineering", "ICCRE", [
        "pattern recognition",
      ]),
    ).toMatchObject({
      ok: false,
    });
    expect(isAiRelevant("AI and Law", "ICAIL", [])).toMatchObject({ ok: true }); // legal AI is AI
    expect(isAiRelevant("Entrepreneurship Ahead: AI, Innovation", "SET", [])).toMatchObject({
      ok: false,
    });
    expect(
      isAiRelevant(
        "OASIS-AI: Open Compute Architecture and Software Infrastructure",
        "OASIS-AI",
        [],
      ),
    ).toMatchObject({ ok: true });
  });

  it("adapter: fetches once politely and refuses a page that does not look like the list", async () => {
    const html = fixture("easychair", "cfp-sample.html");
    const calls: string[] = [];
    const ctx = (text: string) =>
      ({
        fetcher: {
          getText: async (url: string, o: { robots?: boolean }) => {
            calls.push(`${url} robots=${o.robots}`);
            return text;
          },
        },
        deadlineMs: Date.now() + 60_000,
        now: new Date("2026-10-22T00:00:00Z"),
        log: () => {},
        previous: new Map(),
        cursor: null,
        env: {},
      }) as unknown as Parameters<typeof easychairAdapter.run>[0];
    // the 10-row sample is below the sanity floor of the adapter (a real list has ~1,200 rows)
    await expect(easychairAdapter.run(ctx(html))).rejects.toThrow(/looks wrong/);
    expect(calls).toEqual(["https://easychair.org/cfp/ robots=true"]);
  });
});
