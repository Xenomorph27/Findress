/** Deadline heat scale (DESIGN.md): >30d calm, 7–30d warm, <7d hot, passed greyed. */

export type Heat = "calm" | "warm" | "hot" | "passed";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function heatFor(dueMs: number, nowMs: number): Heat {
  const diff = dueMs - nowMs;
  if (diff < 0) return "passed";
  if (diff < 7 * DAY) return "hot";
  if (diff <= 30 * DAY) return "warm";
  return "calm";
}

/** Below this, countdowns tick every second. */
export const LIVE_TICK_WINDOW_MS = 72 * HOUR;

export function isLive(dueMs: number, nowMs: number): boolean {
  const diff = dueMs - nowMs;
  return diff >= 0 && diff < LIVE_TICK_WINDOW_MS;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Compact countdown text.
 * - passed:      "passed"
 * - < 72 hours:  "2d 13:04:09" / "13:04:09" (ticks every second)
 * - otherwise:   "42d"
 */
export function formatCountdown(dueMs: number, nowMs: number): string {
  const diff = dueMs - nowMs;
  if (diff < 0) return "passed";
  if (diff < LIVE_TICK_WINDOW_MS) {
    const total = Math.floor(diff / 1000);
    const d = Math.floor(total / 86_400);
    const h = Math.floor((total % 86_400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${d ? `${d}d ` : ""}${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${Math.floor(diff / DAY)}d`;
}

/** Accessible long form, e.g. "12 days left" / "deadline passed". */
export function describeCountdown(dueMs: number, nowMs: number): string {
  const diff = dueMs - nowMs;
  if (diff < 0) return "deadline passed";
  const days = Math.floor(diff / DAY);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} left`;
  const hours = Math.floor(diff / HOUR);
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} left`;
  return `${Math.max(1, Math.floor(diff / 60_000))} minutes left`;
}

export const HEAT_COLOR_VAR: Record<Heat, string> = {
  calm: "var(--heat-calm)",
  warm: "var(--heat-warm)",
  hot: "var(--heat-hot)",
  passed: "var(--heat-passed)",
};
