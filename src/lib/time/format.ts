import { formatInTimeZone } from "date-fns-tz";

/** Timezones offered in the converter. "Etc/GMT+12" is AoE (Etc signs are inverted). */
export const TIMEZONE_OPTIONS = [
  { value: "Asia/Kolkata", label: "IST · Kolkata" },
  { value: "Etc/GMT+12", label: "AoE · UTC−12" },
  { value: "UTC", label: "UTC" },
  { value: "America/Los_Angeles", label: "Pacific · Los Angeles" },
  { value: "America/New_York", label: "Eastern · New York" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Berlin", label: "Central Europe · Berlin" },
  { value: "Asia/Shanghai", label: "China · Shanghai" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Tokyo", label: "Japan · Tokyo" },
  { value: "Asia/Seoul", label: "Korea · Seoul" },
  { value: "Australia/Sydney", label: "Sydney" },
] as const;

export function zoneShortLabel(tz: string): string {
  if (tz === "Etc/GMT+12") return "AoE";
  if (tz === "Asia/Kolkata") return "IST";
  if (tz === "UTC") return "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
}

export function formatInZone(date: Date | string | number, tz: string, pattern: string): string {
  try {
    return formatInTimeZone(new Date(date), tz, pattern);
  } catch {
    return formatInTimeZone(new Date(date), "UTC", pattern);
  }
}

/** "Jan 28, 2026 · 23:59" in the given zone. */
export function formatDeadline(date: Date | string | number, tz: string): string {
  return formatInZone(date, tz, "MMM d, yyyy · HH:mm");
}

/** Event date range from YYYY-MM-DD strings, e.g. "Jul 6 – 11, 2026"; null when unknown. */
export function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const s = new Date(`${start}T00:00:00Z`);
  const e = end ? new Date(`${end}T00:00:00Z`) : null;
  const fmt = (d: Date, p: string) => formatInTimeZone(d, "UTC", p);
  if (!e || start === end) return fmt(s, "MMM d, yyyy");
  if (s.getUTCFullYear() !== e.getUTCFullYear()) {
    return `${fmt(s, "MMM d, yyyy")} – ${fmt(e, "MMM d, yyyy")}`;
  }
  if (s.getUTCMonth() !== e.getUTCMonth()) return `${fmt(s, "MMM d")} – ${fmt(e, "MMM d, yyyy")}`;
  return `${fmt(s, "MMM d")} – ${fmt(e, "d, yyyy")}`;
}

/** Regional-indicator flag for an ISO-3166 alpha-2 code (content, not a UI icon). */
export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}
