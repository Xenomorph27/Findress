import { fromZonedTime } from "date-fns-tz";

/**
 * Deadline timezone handling. Sources write deadlines as local wall-clock strings plus a zone:
 * "AoE" (Anywhere on Earth = UTC-12), "UTC-12", "UTC+8", "GMT+5:30", "PST", or an IANA zone.
 * We store the UTC instant and keep the original zone string for display.
 */

export type ParsedZone = { kind: "offset"; minutes: number } | { kind: "iana"; zone: string };

/** Unambiguous abbreviations only (CST/IST/BST are ambiguous across regions and rejected). */
const ABBREVIATIONS: Record<string, number> = {
  AOE: -12 * 60,
  UTC: 0,
  GMT: 0,
  Z: 0,
  PST: -8 * 60,
  PDT: -7 * 60,
  MST: -7 * 60,
  MDT: -6 * 60,
  EST: -5 * 60,
  EDT: -4 * 60,
  CET: 60,
  CEST: 120,
  EET: 120,
  EEST: 180,
  JST: 9 * 60,
  KST: 9 * 60,
  SGT: 8 * 60,
  AEST: 10 * 60,
  AEDT: 11 * 60,
};

function isIanaZone(zone: string): boolean {
  if (!zone.includes("/")) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function parseZone(tz: string | null | undefined): ParsedZone | null {
  if (!tz) return null;
  const raw = tz.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase().replace(/\s+/g, "");
  if (upper === "ANYWHEREONEARTH" || upper === "AOE" || upper === "AOE(UTC-12)") {
    return { kind: "offset", minutes: -720 };
  }
  if (upper in ABBREVIATIONS) return { kind: "offset", minutes: ABBREVIATIONS[upper] };
  const m = /^(?:UTC|GMT)?([+\-−])(\d{1,2})(?::?(\d{2}))?$/.exec(upper);
  if (m) {
    const sign = m[1] === "+" ? 1 : -1;
    // `|| 0` normalizes "UTC-0" (-0) to 0.
    const minutes = sign * (Number(m[2]) * 60 + Number(m[3] ?? 0)) || 0;
    if (Math.abs(minutes) <= 14 * 60) return { kind: "offset", minutes };
  }
  if (isIanaZone(raw)) return { kind: "iana", zone: raw };
  return null;
}

const WALL_CLOCK = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

export interface ResolvedDeadline {
  /** The UTC instant. */
  utc: Date;
  /** True when the source gave no usable zone and we fell back to AoE (the latest possible reading). */
  zoneAssumed: boolean;
  /** True when only a date was given and we used 23:59:59 local time. */
  timeAssumed: boolean;
}

/**
 * Convert a source's local wall-clock deadline to UTC.
 * Date-only values mean "end of that day". Unknown zones fall back to AoE and are flagged,
 * so the UI can say "timezone not stated" instead of pretending to know.
 */
export function wallClockToUtc(
  text: string,
  tz: string | null | undefined,
): ResolvedDeadline | null {
  const m = WALL_CLOCK.exec(text.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const timeAssumed = h === undefined;
  const parts = {
    y: Number(y),
    mo: Number(mo),
    d: Number(d),
    h: timeAssumed ? 23 : Number(h),
    mi: timeAssumed ? 59 : Number(mi),
    s: timeAssumed ? 59 : Number(s ?? 0),
  };
  if (
    parts.mo < 1 ||
    parts.mo > 12 ||
    parts.d < 1 ||
    parts.d > 31 ||
    parts.h > 23 ||
    parts.mi > 59
  ) {
    return null;
  }
  const zone = parseZone(tz);
  const zoneAssumed = zone === null;
  const effective: ParsedZone = zone ?? { kind: "offset", minutes: -720 };

  let utc: Date;
  if (effective.kind === "offset") {
    const asUtc = Date.UTC(parts.y, parts.mo - 1, parts.d, parts.h, parts.mi, parts.s);
    utc = new Date(asUtc - effective.minutes * 60_000);
  } else {
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${parts.y}-${pad(parts.mo)}-${pad(parts.d)}T${pad(parts.h)}:${pad(parts.mi)}:${pad(parts.s)}`;
    utc = fromZonedTime(local, effective.zone);
  }
  if (Number.isNaN(utc.getTime())) return null;
  return { utc, zoneAssumed, timeAssumed };
}

/** Human label for a stored zone string, e.g. "AoE (UTC−12)". */
export function describeZone(tz: string | null | undefined): string {
  if (!tz) return "timezone not stated";
  const zone = parseZone(tz);
  if (!zone) return tz;
  if (zone.kind === "iana") return tz;
  if (zone.minutes === -720 && /aoe|anywhere/i.test(tz)) return "AoE (UTC−12)";
  const sign = zone.minutes >= 0 ? "+" : "−";
  const abs = Math.abs(zone.minutes);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  return `UTC${sign}${hh}${mm ? `:${String(mm).padStart(2, "0")}` : ""}`;
}
