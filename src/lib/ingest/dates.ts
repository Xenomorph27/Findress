/**
 * Parse free-text event dates as written by ccfddl / WikiCFP into ISO date ranges.
 * Handles "July 13-19, 2025", "June 30 - July 3, 2026", "Nov 6-10, 2026",
 * "December 8-10 (Sydney), December 9-11 (Atlanta and Paris), 2026",
 * "August 7-13 and August 15-17, 2027", "Dec 30, 2026 - Jan 2, 2027". Returns null for "TBD".
 */

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** "Sep", "Sept.", "September" → 9; anything else → null. */
function monthIndex(word: string): number | null {
  const w = word.toLowerCase().replace(/\.$/, "");
  if (w.length < 3) return null;
  const i = MONTH_NAMES.findIndex((name) => name.startsWith(w));
  return i >= 0 ? i + 1 : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export interface DateRange {
  start: string;
  end: string;
}

export function parseDateRange(
  text: string | null | undefined,
  fallbackYear?: number,
): DateRange | null {
  if (!text) return null;
  const s = String(text)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s || /^(tbd|tba|n\/a|to be (announced|determined))/i.test(s)) return null;

  // Each date token may carry its own year ("Dec 30, 2026 - Jan 2, 2027").
  const years = [...s.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  const lastYear = years.at(-1) ?? fallbackYear;
  if (!lastYear) return null;

  const points: { m: number; d: number; y: number | null }[] = [];
  let month: number | null = null;
  const re =
    /([A-Za-z]{3,10}\.?)[\s,]*(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s*((?:19|20)\d{2}))?|\b(\d{1,2})(?:st|nd|rd|th)?\b(?!\d)(?:,?\s*((?:19|20)\d{2}))?/g;
  for (const m of s.matchAll(re)) {
    if (m[1]) {
      const idx = monthIndex(m[1]);
      if (idx == null) continue;
      month = idx;
      points.push({ m: month, d: Number(m[2]), y: m[3] ? Number(m[3]) : null });
    } else if (m[4] && month != null) {
      points.push({ m: month, d: Number(m[4]), y: m[5] ? Number(m[5]) : null });
    }
  }
  if (points.length === 0) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const endYear = last.y ?? lastYear;
  let startYear = first.y ?? endYear;
  // "Dec 30 - Jan 2, 2027": the start belongs to the previous year.
  if (first.y == null && (first.m > last.m || (first.m === last.m && first.d > last.d))) {
    startYear = endYear - 1;
  }
  const start = isoDate(startYear, first.m, first.d);
  const end = isoDate(endYear, last.m, last.d);
  if (!start || !end || end < start) return start ? { start, end: start } : null;
  return { start, end };
}

/** "Oct 26, 2026" / "2026-10-26T00:00:00" → "2026-10-26". */
export function parseSingleDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text.trim());
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const r = parseDateRange(text);
  return r?.start ?? null;
}
