import type { Mode } from "@/lib/taxonomy";
import { countryByName, foldText, isUsState, type CountryInfo } from "./countries";
import { cleanText } from "./keys";

export interface ParsedPlace {
  venue: string | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  mode: Mode | null;
  /** True when the source lists several venues ("Sydney, Australia; Atlanta, USA"). */
  multiVenue: boolean;
}

const VENUE_WORDS =
  /\b(center|centre|convention|university|universit[àa]|hotel|institute|hall|expo|campus|school|building|hilton|marriott|hyatt|sheraton|resort|congress|exhibition|cordis|room|auditorium|palace|museum|arena|springs|conference|venue|college|park|tower|plaza|forum|messe)\b/i;

const CITY_STATES = new Set(["SG", "HK", "MO", "LU", "MC", "VA"]);

const EMPTY: ParsedPlace = {
  venue: null,
  city: null,
  country: null,
  countryCode: null,
  mode: null,
  multiVenue: false,
};

function detectMode(text: string): Mode | null {
  if (/\bhybrid\b|and online|\+ ?online|& ?online/i.test(text)) return "hybrid";
  if (/^\s*(online|virtual)\b|virtual (conference|event)|^\s*(web|zoom)\s*$/i.test(text)) {
    return "virtual";
  }
  return null;
}

function findCountry(segments: string[]): { info: CountryInfo; index: number } | null {
  // Prefer the most specific region (HK / Macau / Taiwan) when several segments match.
  let best: { info: CountryInfo; index: number } | null = null;
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    const info = countryByName(seg) ?? countryByName(seg.replace(/^.*\b(?:in|at)\s+/i, ""));
    if (info) {
      if (!best || ["HK", "MO", "TW"].includes(info.code)) best = { info, index: i };
      if (["HK", "MO", "TW"].includes(info.code)) break;
    }
  }
  if (best) return best;
  // Country embedded in a single segment, e.g. "Singapore EXPO", "Boca Raton FL, USA".
  for (let i = segments.length - 1; i >= 0; i--) {
    const words = segments[i].split(/\s+/);
    for (let n = Math.min(3, words.length); n >= 1; n--) {
      const tail = countryByName(words.slice(-n).join(" "));
      if (tail) return { info: tail, index: i };
      const head = countryByName(words.slice(0, n).join(" "));
      if (head) return { info: head, index: i };
    }
  }
  return null;
}

/**
 * Split a free-text place ("Vancouver Convention Center, Vancouver, Canada (Hybrid)") into
 * venue / city / country. Unknown parts stay null — never guessed.
 */
export function parsePlace(raw: string | null | undefined): ParsedPlace {
  const text = cleanText(raw);
  if (!text || /^(tbd|tba|n\/a|none|-+)$/i.test(text)) return { ...EMPTY };
  const mode = detectMode(text);
  if (mode === "virtual" && !/,/.test(text)) return { ...EMPTY, mode };

  const parts = text.split(/\s*;\s*|\s+and\s+(?=[A-Z][a-z]+,)/);
  const multiVenue = parts.length > 1;
  const first = parts[0]
    .replace(/\((?:hybrid|online|virtual)[^)]*\)/gi, " ")
    .replace(/\s+-\s+(?:hybrid|online|virtual)\b.*$/i, "")
    .replace(/\s+(?:and|&|\+)\s+online\b.*$/i, "")
    .replace(/\(.*?\)/g, " ");

  let segments = first
    .split(",")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const found = findCountry(segments);
  let countryInfo = found?.info ?? null;
  if (found) {
    const seg = segments[found.index];
    const folded = foldText(seg);
    const isWholeSegment =
      countryByName(seg)?.code === found.info.code ||
      [found.info.name, ...found.info.aliases].some((n) => foldText(n) === folded);
    if (isWholeSegment) segments = segments.filter((_, i) => i !== found.index);
  }
  // Drop US states / two-letter region codes; infer USA from a state when no country was given.
  const kept: string[] = [];
  for (const seg of segments) {
    // A leftover country segment ("…, Hong Kong SAR, China") is never the city.
    if (countryByName(seg) && !CITY_STATES.has(countryByName(seg)!.code)) continue;
    if (isUsState(seg)) {
      countryInfo ??= countryByName("United States");
      continue;
    }
    const trailingState = /^(.*\S)\s+([A-Z]{2})$/.exec(seg);
    if (trailingState && isUsState(trailingState[2])) {
      countryInfo ??= countryByName("United States");
      kept.push(trailingState[1]);
      continue;
    }
    kept.push(seg);
  }

  const venueSegs = kept.filter((s) => VENUE_WORDS.test(s));
  const citySegs = kept.filter((s) => !VENUE_WORDS.test(s) && !/\d{3,}/.test(s));
  let city: string | null = citySegs[0] ?? null;
  if (city && countryInfo && foldText(city) === foldText(countryInfo.name)) city = null;
  if (!city && countryInfo && CITY_STATES.has(countryInfo.code)) city = countryInfo.name;
  if (city) city = city.replace(/\s+(SAR)$/i, "").trim();

  return {
    venue: venueSegs[0] ?? null,
    city,
    country: countryInfo?.name ?? null,
    countryCode: countryInfo?.code ?? null,
    // Only what the source states: a physical address alone doesn't prove "in person only".
    mode,
    multiVenue,
  };
}
