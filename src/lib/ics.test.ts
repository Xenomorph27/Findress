import { describe, expect, it } from "vitest";
import { buildCalendar, escapeText, foldLine } from "./ics";

describe("ics", () => {
  it("escapes TEXT values", () => {
    expect(escapeText("a,b;c\\d\nnext")).toBe("a\\,b\\;c\\\\d\\nnext");
  });

  it("folds long lines at 75 octets", () => {
    const folded = foldLine(`SUMMARY:${"x".repeat(200)}`);
    for (const line of folded.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(
      folded
        .split("\r\n")
        .slice(1)
        .every((l) => l.startsWith(" ")),
    ).toBe(true);
  });

  it("writes deadlines in UTC and events as all-day spans", () => {
    const ics = buildCalendar(
      "ICML 2026",
      [
        {
          uid: "icml-2026-paper@findress",
          title: "ICML 2026 — Paper deadline",
          at: new Date("2026-01-29T11:59:59Z"),
          alarmMinutesBefore: 1440,
        },
        {
          uid: "icml-2026-event@findress",
          title: "ICML 2026",
          allDay: { start: "2026-07-06", end: "2026-07-11" },
        },
      ],
      new Date("2026-10-09T00:00:00Z"),
    );
    expect(ics).toContain("DTSTART:20260129T115959Z");
    expect(ics).toContain("TRIGGER:-PT1440M");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260706");
    expect(ics).toContain("DTEND;VALUE=DATE:20260712");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
