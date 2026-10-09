import type { ExplorerRow } from "@/lib/data/types";

/**
 * Explorer filter state. Everything round-trips through the URL query (SPEC §3) so any view
 * is shareable; defaults are omitted from the URL.
 */
export type SortKey = "deadline" | "date" | "rank" | "name" | "recent";
export type JournalSortKey = "calls" | "hindex" | "citedness" | "apc" | "name";
export type ExploreTab = "all" | "conferences" | "workshops" | "journals" | "special";
export const EXPLORE_TABS: { value: ExploreTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "conferences", label: "Conferences" },
  { value: "workshops", label: "Workshops" },
  { value: "journals", label: "Journals" },
  { value: "special", label: "Special issues" },
];
export type ViewMode = "list" | "cards";
export type DeadlineWindow = "" | "7" | "30" | "90" | "custom";

export interface Filters {
  tab: ExploreTab;
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
  /** Journals: open-access model (full / hybrid / subscription). */
  oa: string[];
  /** Journals: maximum APC in USD ("" = any; "0" = free to publish). */
  apcMax: string;
  /** Journals: CORE journal rank (A*, A, B, C) or CCF-A/B/C. */
  jranks: string[];
  publishers: string[];
  jsort: JournalSortKey;
}

export const DEFAULT_FILTERS: Filters = {
  tab: "all",
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
  oa: [],
  apcMax: "",
  jranks: [],
  publishers: [],
  jsort: "calls",
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
  const tab = get("tab") as ExploreTab;
  const jsort = get("jsort") as JournalSortKey;
  const apcMax = get("apcmax");
  return {
    tab: EXPLORE_TABS.some((t) => t.value === tab) ? tab : "all",
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
    oa: list(get("oa")).filter((o) => ["full", "hybrid", "subscription"].includes(o)),
    apcMax: /^\d{1,5}$/.test(apcMax) ? String(Number(apcMax)) : "",
    jranks: list(get("jrank")),
    publishers: list(get("publisher")).slice(0, 10),
    jsort: ["calls", "hindex", "citedness", "apc", "name"].includes(jsort) ? jsort : "calls",
  };
}

export function serializeFilters(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  const setList = (k: string, v: string[]) => v.length && p.set(k, v.join(","));
  if (f.tab !== "all") p.set("tab", f.tab);
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
  setList("oa", f.oa);
  if (f.apcMax) p.set("apcmax", f.apcMax);
  setList("jrank", f.jranks);
  setList("publisher", f.publishers);
  if (f.jsort !== "calls") p.set("jsort", f.jsort);
  return p;
}

/** Number of non-default filters (for the "Filters (3)" badge); search, view and sort excluded. */
export function activeFilterCount(f: Filters): number {
  if (f.tab === "journals") {
    return (
      f.subfields.length + f.oa.length + (f.apcMax ? 1 : 0) + f.jranks.length + f.publishers.length
    );
  }
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

/**
 * Where an edition stands today:
 * - open:    a submission (abstract/paper) deadline is still ahead
 * - unknown: no submission deadline known and the event hasn't happened yet
 * - closed:  submissions closed but the event itself is still ahead (NeurIPS in October)
 * - tba:     the series' latest known edition is over and the next one isn't announced yet
 *            (kept visible for a year so flagships never vanish between cycles)
 * - past:    an older edition, only shown with "show past editions"
 */
export type EditionStatus = "open" | "unknown" | "closed" | "tba" | "past";

export function editionStatus(
  row: Pick<ExplorerRow, "deadlines" | "startDate" | "endDate" | "latestInSeries">,
  now: number,
): EditionStatus {
  const nd = nextDeadline(row, now);
  if (nd && !nd.passed) return "open";
  const today = new Date(now).toISOString().slice(0, 10);
  const lastDay = row.endDate ?? row.startDate;
  if (lastDay ? lastDay >= today : !nd) return nd ? "closed" : "unknown";
  const endedAt = lastDay ? Date.parse(`${lastDay}T23:59:59Z`) : (nd?.at ?? 0);
  return row.latestInSeries && now - endedAt < 365 * DAY ? "tba" : "past";
}

/** The default view (past editions hidden), shared by the server prefilter and the client. */
export function inDefaultScope(row: ExplorerRow, now: number): boolean {
  return !row.communityOnly && editionStatus(row, now) !== "past";
}

const STATUS_ORDER: Record<EditionStatus, number> = {
  open: 0,
  unknown: 1,
  closed: 2,
  tba: 3,
  past: 4,
};

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
  const winEnd = f.window && f.window !== "custom" ? now + Number(f.window) * DAY : null;
  const from = f.window === "custom" && f.dlFrom ? Date.parse(`${f.dlFrom}T00:00:00Z`) : null;
  const to = f.window === "custom" && f.dlTo ? Date.parse(`${f.dlTo}T23:59:59Z`) : null;

  const out = rows.filter((row) => {
    if (!f.community && row.communityOnly) return false;
    const nd = nextDeadline(row, now);
    if (!f.showPassed && editionStatus(row, now) === "past") return false;
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
  const keyed = rows.map((row) => ({
    row,
    nd: nextDeadline(row, now),
    status: STATUS_ORDER[editionStatus(row, now)],
  }));
  const byName = (a: ExplorerRow, b: ExplorerRow) =>
    a.acronym.localeCompare(b.acronym) || a.year - b.year;
  const deadlineOrder = (a: (typeof keyed)[number], b: (typeof keyed)[number]) => {
    // open (soonest deadline first) → deadline not announced → call closed (both by soonest
    // event) → next edition TBA → past editions (both by most recent deadline)
    if (a.status !== b.status) return a.status - b.status;
    if (a.status === 0) return a.nd!.at - b.nd!.at;
    if (a.status >= 3) return (b.nd?.at ?? 0) - (a.nd?.at ?? 0) || byName(a.row, b.row);
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
