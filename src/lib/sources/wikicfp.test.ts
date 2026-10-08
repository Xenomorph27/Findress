import { describe, expect, it } from "vitest";
import { EventInputSchema } from "@/lib/ingest/types";
import { normalizeWikiCfp, parseEventPage, parseFeed } from "./wikicfp";
import { fixture } from "./test-utils";

describe("WikiCFP RSS", () => {
  it("parses real feed items: acronym, name, place and dates", async () => {
    const items = await parseFeed(fixture("wikicfp", "rss-machine-learning.xml"));
    expect(items.length).toBe(20);
    const w = items.find((i) => i.eventId === "203529")!;
    expect(w).toMatchObject({
      acronymRaw: "WLLFM 2026",
      name: "Fourth Workshop on Large Language and Foundation Models (WLLFM 2026)",
      place: "Phoenix, AZ",
      when: "Dec 14, 2026 - Dec 17, 2026",
      link: "http://www.wikicfp.com/cfp/servlet/event.showcfp?eventid=203529",
    });
  });
});

describe("WikiCFP event page", () => {
  it("reads When/Where, official link and RDFa deadlines", () => {
    const page = parseEventPage(fixture("wikicfp", "event-203529.html"));
    expect(page.when).toBe("Dec 14, 2026 - Dec 17, 2026");
    expect(page.website).toBe("https://appliedmachinelearning-lab.github.io/wllfm2026/");
    expect(page.deadlines).toEqual([
      { summary: "WLLFM 2026", date: "2026-12-14T00:00:00" },
      { summary: "Submission Deadline", date: "2026-10-26T00:00:00" },
      { summary: "Notification Due", date: "2026-11-09T00:00:00" },
      { summary: "Final Version Due", date: "2026-11-21T00:00:00" },
    ]);
    expect(page.categories).toContain("machine learning");
    expect(page.cfpText).toMatch(/LARGE LANGUAGE AND FOUNDATION/i);
  });

  it("normalizes a workshop with deadlines but no invented timezone", async () => {
    const items = await parseFeed(fixture("wikicfp", "rss-machine-learning.xml"));
    const item = items.find((i) => i.eventId === "203529")!;
    const e = normalizeWikiCfp(item, parseEventPage(fixture("wikicfp", "event-203529.html")))!;
    expect(EventInputSchema.safeParse(e).success).toBe(true);
    expect(e).toMatchObject({
      acronym: "WLLFM",
      year: 2026,
      type: "workshop",
      city: "Phoenix",
      countryCode: "US",
      startDate: "2026-12-14",
      endDate: "2026-12-17",
    });
    expect(e.deadlines.map((d) => d.kind)).toEqual(["paper", "notification", "camera_ready"]);
    expect(e.deadlines[0]).toMatchObject({
      originalTz: null,
      originalText: "2026-10-26",
      dueAtUtc: "2026-10-27T11:59:59.000Z",
    });
  });

  it("handles a country-only location (ACL 2027 in Japan)", () => {
    const page = parseEventPage(fixture("wikicfp", "event-201213.html"));
    const e = normalizeWikiCfp(
      {
        eventId: "201213",
        acronymRaw: "ACL 2027",
        name: "The 65th Annual Meeting of the Association for Computational Linguistics",
        place: null,
        when: null,
        link: "x",
      },
      page,
    )!;
    expect(e.countryCode).toBe("JP");
    expect(e.city).toBeNull();
    expect(e.website).toBe("https://2027.aclweb.org/");
  });

  it("detects co-located parents and skips non-events", () => {
    const special = normalizeWikiCfp(
      {
        eventId: "1",
        acronymRaw: "AI4EIoT 2026",
        name: "Special Session on Artificial Intelligence for Emerging IoT Systems at IoTBDS",
        place: "Rome, Italy",
        when: "May 2, 2026 - May 4, 2026",
        link: "x",
      },
      null,
    )!;
    expect(special.type).toBe("workshop");
    expect(special.parentKey).toBe("iotbds-2026");

    expect(
      normalizeWikiCfp(
        {
          eventId: "2",
          acronymRaw: "ACDL 2026",
          name: "9th Advanced Course on Data Science & Machine Learning",
          place: null,
          when: "Jul 1, 2026 - Jul 5, 2026",
          link: "x",
        },
        null,
      ),
    ).toBeNull();
    expect(
      normalizeWikiCfp(
        {
          eventId: "3",
          acronymRaw: "XYZ 2026",
          name: "Special Issue on Foundation Models",
          place: null,
          when: null,
          link: "x",
        },
        null,
      ),
    ).toBeNull();
  });
});
