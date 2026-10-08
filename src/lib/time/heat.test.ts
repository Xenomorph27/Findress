import { describe, expect, it } from "vitest";
import { describeCountdown, formatCountdown, heatFor, isLive } from "./heat";

const NOW = Date.UTC(2026, 9, 9, 12, 0, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("heatFor", () => {
  it("maps distance to the heat scale", () => {
    expect(heatFor(NOW + 45 * DAY, NOW)).toBe("calm");
    expect(heatFor(NOW + 30 * DAY, NOW)).toBe("warm");
    expect(heatFor(NOW + 7 * DAY, NOW)).toBe("warm");
    expect(heatFor(NOW + 7 * DAY - 1, NOW)).toBe("hot");
    expect(heatFor(NOW + 1000, NOW)).toBe("hot");
    expect(heatFor(NOW - 1, NOW)).toBe("passed");
  });
});

describe("formatCountdown", () => {
  it("shows whole days beyond 72h", () => {
    expect(formatCountdown(NOW + 42 * DAY + 5 * HOUR, NOW)).toBe("42d");
    expect(formatCountdown(NOW + 72 * HOUR, NOW)).toBe("3d");
  });

  it("ticks with clock digits inside 72h", () => {
    expect(formatCountdown(NOW + 2 * DAY + 13 * HOUR + 4 * 60_000 + 9_000, NOW)).toBe(
      "2d 13:04:09",
    );
    expect(formatCountdown(NOW + 5 * 60_000, NOW)).toBe("00:05:00");
  });

  it("says passed for past deadlines", () => {
    expect(formatCountdown(NOW - DAY, NOW)).toBe("passed");
  });
});

describe("isLive / describeCountdown", () => {
  it("is live only inside the 72h window", () => {
    expect(isLive(NOW + 71 * HOUR, NOW)).toBe(true);
    expect(isLive(NOW + 73 * HOUR, NOW)).toBe(false);
    expect(isLive(NOW - 1, NOW)).toBe(false);
  });

  it("produces accessible text", () => {
    expect(describeCountdown(NOW + 12 * DAY, NOW)).toBe("12 days left");
    expect(describeCountdown(NOW + 1 * DAY, NOW)).toBe("1 day left");
    expect(describeCountdown(NOW + 5 * HOUR, NOW)).toBe("5 hours left");
    expect(describeCountdown(NOW - 1, NOW)).toBe("deadline passed");
  });
});
