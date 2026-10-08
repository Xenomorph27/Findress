import type { ExplorerRow } from "@/lib/data/types";

/**
 * Explorer filter state. Everything round-trips through the URL query (SPEC §3) so any view
 * is shareable; defaults are omitted from the URL.
 */
export type SortKey = "deadline" | "date" | "rank" | "name" | "recent";
export type ViewMode = "list" | "cards";
export type DeadlineWindow = "" | "7" | "30" | "90" | "custom";

export interface Filters {
  q: string;
  view: ViewMode;
  sort: SortKey;
  types: string[];
  subfields: string[];
  ranks: string[];
  window: DeadlineWindow;
  dlFrom: string;
  dlTo: string;
  showPassed: boolean;
  evFrom: string;
  evTo: string;
  continents: string[];
  countries: string[];
  modes: string[];
  hasAbstract: boolean;
  hasRebuttal: boolean;
  doubleBlind: boolean;
  community: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  q: "",
  view: "list",
  sort: "deadline",
  types: [],
  subfields: [],
  ranks: [],
  window: "",
  dlFrom: "",
  dlTo: "",
  showPassed: false,
  evFrom: "",
  evTo: "",
  continents: [],
  countries: [],
  modes: [],
  hasAbstract: false,
  hasRebuttal: false,
  doubleBlind: false,
  community: false,
};

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function getter(src: ParamSource) {
  return (key: string): string => {
    if (src instanceof URLSearchParams) return src.get(key) ?? "";
    const v = src[key];
    return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
  };
}

const list = (v: string) =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const isoDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const flag = (v: string) => v === "1" || v === "true";

export function parseFilters(src: ParamSource): Filters {
  const get = getter(src);
  const sort = get("sort") as SortKey;
  const win = get("window") as DeadlineWindow;
  return {
    q: get("q").slice(0, 200),
    view: get("view") === "cards" ? "cards" : "list",
    sort: ["deadline", "date", "rank", "name", "recent"].includes(sort) ? sort : "deadline",
    types: list(get("type")),
    subfields: list(get("subfield")),
    ranks: list(get("rank")),
    window: ["7", "30", "90", "custom"].includes(win) ? win : "",
    dlFrom: isoDate(get("from")),
    dlTo: isoDate(get("to")),
    showPassed: flag(get("passed")),
    evFrom: isoDate(get("evfrom")),
    evTo: isoDate(get("evto")),
    continents: list(get("continent")),
    countries: list(get("country")).map((c) => c.toUpperCase()),
    modes: list(get("mode")),
    hasAbstract: flag(get("abstract")),
    hasRebuttal: flag(get("rebuttal")),
    doubleBlind: flag(get("blind")),
    community: flag(get("community")),
  };
}

export function serializeFilters(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  const setList = (k: string, v: string[]) => v.length && p.set(k, v.join(","));
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.view !== "list") p.set("view", f.view);
  if (f.sort !== "deadline") p.set("sort", f.sort);
  setList("type", f.types);
  setList("subfield", f.subfields);
  setList("rank", f.ranks);
  if (f.window) p.set("window", f.window);
  if (f.window === "custom" && f.dlFrom) p.set("from", f.dlFrom);
  if (f.window === "custom" && f.dlTo) p.set("to", f.dlTo);
  if (f.showPassed) p.set("passed", "1");
  if (f.evFrom) p.set("evfrom", f.evFrom);
  if (f.evTo) p.set("evto", f.evTo);
  setList("continent", f.continents);
  setList("country", f.countries);
  setList("mode", f.modes);
  if (f.hasAbstract) p.set("abstract", "1");
  if (f.hasRebuttal) p.set("rebuttal", "1");
  if (f.doubleBlind) p.set("blind", "1");
  if (f.community) p.set("community", "1");
  return p;
}

/** Number of non-default filters (for the "Filters (3)" badge); search, view and sort excluded. */
export function activeFilterCount(f: Filters): number {
  return (
    f.types.length +
    f.subfields.length +
    f.ranks.length +
    (f.window ? 1 : 0) +
    (f.showPassed ? 1 : 0) +
    (f.evFrom || f.evTo ? 1 : 0) +
    f.continents.length +
    f.countries.length +
    f.modes.length +
    (f.hasAbstract ? 1 : 0) +
    (f.hasRebuttal ? 1 : 0) +
    (f.doubleBlind ? 1 : 0) +
    (f.community ? 1 : 0)
  );
}

export interface NextDeadline {
  at: number;
  kind: "abstract" | "paper";
  label: string | null;
  passed: boolean;
}

/** Earliest upcoming abstract/paper deadline; else the latest passed one; null if none known. */
export function nextDeadline(
  row: Pick<ExplorerRow, "deadlines">,
  now: number,
): NextDeadline | null {
  let upcoming: NextDeadline | null = null;
  let past: NextDeadline | null = null;
  for (const d of row.deadlines) {
    if (d.at >= now) {
      if (!upcoming || d.at < upcoming.at) upcoming = { ...d, passed: false };
    } else if (!past || d.at > past.at) {
      past = { ...d, passed: true };
    }
  }
  return upcoming ?? past;
}

const DAY = 86_400_000;
const RANK_SCORE: Record<string, number> = { "A*": 4, A: 3, B: 2, C: 1 };

export function rankScore(row: Pick<ExplorerRow, "rankCore" | "rankCcf">): number {
  const core = RANK_SCORE[row.rankCore ?? ""] ?? 0;
  const ccf = (RANK_SCORE[row.rankCcf ?? ""] ?? 0) - (row.rankCcf ? 0.5 : 0);
  return Math.max(core, ccf);
}

function matchesRank(row: ExplorerRow, ranks: string[]): boolean {
  return ranks.some((r) => {
    if (r === "unranked") return !row.rankCore && !row.rankCcf;
    if (r.startsWith("CCF-")) return row.rankCcf === r.slice(4);
    return row.rankCore === r;
  });
}

export function haystack(row: ExplorerRow): string {
  return [
    row.acronym,
    `${row.acronym} ${row.year}`,
    row.name,
    row.topics.join(" "),
    row.subfields.join(" "),
    row.city,
    row.country,
    row.parent ? `${row.parent.acronym} ${row.parent.year}` : "",
    row.type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function applyFilters(rows: ExplorerRow[], f: Filters, now: number): ExplorerRow[] {
  const tokens = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const today = new Date(now).toISOString().slice(0, 10);
  const winEnd = f.window && f.window !== "custom" ? now + Number(f.window) * DAY : null;
  const from = f.window === "custom" && f.dlFrom ? Date.parse(`${f.dlFrom}T00:00:00Z`) : null;
  const to = f.window === "custom" && f.dlTo ? Date.parse(`${f.dlTo}T23:59:59Z`) : null;

  const out = rows.filter((row) => {
    if (!f.community && row.communityOnly) return false;
    const nd = nextDeadline(row, now);
    if (!f.showPassed) {
      const upcoming = nd && !nd.passed;
      const unknownButFuture = !nd && (row.startDate == null || row.startDate >= today);
      if (!upcoming && !unknownButFuture) return false;
    }
    if (winEnd != null && !(nd && !nd.passed && nd.at <= winEnd)) return false;
    if (
      (from != null || to != null) &&
      !(nd && (from == null || nd.at >= from) && (to == null || nd.at <= to))
    ) {
      return false;
    }
    if (f.types.length && !f.types.includes(row.type)) return false;
    if (f.subfields.length && !f.subfields.some((s) => row.subfields.includes(s))) return false;
    if (f.ranks.length && !matchesRank(row, f.ranks)) return false;
    if (f.evFrom && !(row.startDate && row.startDate >= f.evFrom)) return false;
    if (f.evTo && !(row.startDate && row.startDate <= f.evTo)) return false;
    if (f.continents.length && !(row.continent && f.continents.includes(row.continent)))
      return false;
    if (f.countries.length && !(row.countryCode && f.countries.includes(row.countryCode)))
      return false;
    if (f.modes.length && !(row.mode && f.modes.includes(row.mode))) return false;
    if (f.hasAbstract && !row.deadlines.some((d) => d.kind === "abstract")) return false;
    if (f.hasRebuttal && row.hasRebuttal !== true) return false;
    if (f.doubleBlind && !/double/i.test(row.reviewType ?? "")) return false;
    if (tokens.length) {
      const hay = haystack(row);
      if (!tokens.every((t) => hay.includes(t))) return false;
    }
    return true;
  });

  return sortRows(out, f.sort, now);
}

export function sortRows(rows: ExplorerRow[], sort: SortKey, now: number): ExplorerRow[] {
  const keyed = rows.map((row) => ({ row, nd: nextDeadline(row, now) }));
  const byName = (a: ExplorerRow, b: ExplorerRow) =>
    a.acronym.localeCompare(b.acronym) || a.year - b.year;
  const deadlineOrder = (a: (typeof keyed)[number], b: (typeof keyed)[number]) => {
    // upcoming (soonest first) → unknown → passed (most recent first)
    const bucket = (x: (typeof keyed)[number]) => (x.nd ? (x.nd.passed ? 2 : 0) : 1);
    const ba = bucket(a);
    const bb = bucket(b);
    if (ba !== bb) return ba - bb;
    if (ba === 0) return a.nd!.at - b.nd!.at;
    if (ba === 2) return b.nd!.at - a.nd!.at;
    return (
      (a.row.startDate ?? "9999").localeCompare(b.row.startDate ?? "9999") || byName(a.row, b.row)
    );
  };
  keyed.sort((a, b) => {
    switch (sort) {
      case "date":
        return (
          (a.row.startDate ?? "9999").localeCompare(b.row.startDate ?? "9999") ||
          byName(a.row, b.row)
        );
      case "rank":
        return rankScore(b.row) - rankScore(a.row) || deadlineOrder(a, b);
      case "name":
        return byName(a.row, b.row);
      case "recent":
        return b.row.createdAt - a.row.createdAt || byName(a.row, b.row);
      default:
        return deadlineOrder(a, b);
    }
  });
  return keyed.map((k) => k.row);
}
