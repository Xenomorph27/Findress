import type { JournalListRow, SpecialIssueListRow } from "@/lib/data/types";
import type { Filters } from "./filters";

/**
 * Journals and special issues in /explore. Journals have no deadline of their own (rolling
 * submissions); special issues behave like calls with a single submission deadline.
 */

const DAY = 86_400_000;

function tokens(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

export function journalHaystack(r: JournalListRow): string {
  return [r.abbreviation, r.name, r.publisher, r.openAccess, ...r.topics, ...r.subfields]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesJournalRank(r: JournalListRow, ranks: string[]): boolean {
  return ranks.some((k) =>
    k.startsWith("CCF-") ? r.rankCcf === k.slice(4) : r.rankCoreJournal === k,
  );
}

/** Fee to publish, when known: subscription journals charge none; OA ones their APC. */
export function publishFeeUsd(r: Pick<JournalListRow, "openAccess" | "apcUsd">): number | null {
  if (r.apcUsd != null) return r.apcUsd;
  return r.openAccess === "subscription" ? 0 : null;
}

export function applyJournalFilters(rows: JournalListRow[], f: Filters, now: number) {
  const ts = tokens(f.q);
  const max = f.apcMax === "" ? null : Number(f.apcMax);
  const out = rows.filter((r) => {
    if (f.subfields.length && !f.subfields.some((s) => r.subfields.includes(s))) return false;
    if (f.oa.length && !(r.openAccess && f.oa.includes(r.openAccess))) return false;
    if (max != null) {
      const fee = publishFeeUsd(r);
      if (fee == null || fee > max) return false;
    }
    if (f.jranks.length && !matchesJournalRank(r, f.jranks)) return false;
    if (f.publishers.length && !(r.publisher && f.publishers.includes(r.publisher))) return false;
    if (ts.length && !ts.every((t) => journalHaystack(r).includes(t))) return false;
    return true;
  });
  return sortJournals(out, f.jsort, now);
}

const nextCallAt = (r: JournalListRow, now: number) =>
  r.nextCall && r.nextCall.at >= now ? r.nextCall.at : null;

export function sortJournals(rows: JournalListRow[], sort: Filters["jsort"], now: number) {
  const byName = (a: JournalListRow, b: JournalListRow) =>
    a.abbreviation.localeCompare(b.abbreviation);
  const desc = (x: number | null, y: number | null) => (y ?? -1) - (x ?? -1);
  return [...rows].sort((a, b) => {
    switch (sort) {
      case "hindex":
        return desc(a.hIndex, b.hIndex) || byName(a, b);
      case "citedness":
        return desc(a.twoYrMeanCitedness, b.twoYrMeanCitedness) || byName(a, b);
      case "apc": {
        const fa = publishFeeUsd(a);
        const fb = publishFeeUsd(b);
        return (fa ?? Infinity) - (fb ?? Infinity) || byName(a, b);
      }
      case "name":
        return byName(a, b);
      default: {
        // Open special-issue calls first (soonest), then by h-index.
        const ca = nextCallAt(a, now);
        const cb = nextCallAt(b, now);
        if (ca != null || cb != null) return (ca ?? Infinity) - (cb ?? Infinity);
        return desc(a.hIndex, b.hIndex) || byName(a, b);
      }
    }
  });
}

export function specialHaystack(r: SpecialIssueListRow): string {
  return [
    r.title,
    r.journal?.abbreviation,
    r.journal?.name,
    r.journalName,
    ...r.topics,
    ...r.subfields,
    "special issue",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Open (deadline ahead), not stated, or closed — mirrors the event statuses. */
export function specialStatus(r: SpecialIssueListRow, now: number): "open" | "unknown" | "closed" {
  if (r.at == null) return "unknown";
  return r.at >= now ? "open" : "closed";
}

export function applySpecialFilters(rows: SpecialIssueListRow[], f: Filters, now: number) {
  const ts = tokens(f.q);
  const winEnd = f.window && f.window !== "custom" ? now + Number(f.window) * DAY : null;
  const from = f.window === "custom" && f.dlFrom ? Date.parse(`${f.dlFrom}T00:00:00Z`) : null;
  const to = f.window === "custom" && f.dlTo ? Date.parse(`${f.dlTo}T23:59:59Z`) : null;
  const out = rows.filter((r) => {
    const status = specialStatus(r, now);
    if (!f.showPassed && status === "closed") return false;
    if (winEnd != null && !(status === "open" && r.at! <= winEnd)) return false;
    if (
      (from != null || to != null) &&
      !(r.at != null && (from == null || r.at >= from) && (to == null || r.at <= to))
    )
      return false;
    if (f.subfields.length && !f.subfields.some((s) => r.subfields.includes(s))) return false;
    if (ts.length && !ts.every((t) => specialHaystack(r).includes(t))) return false;
    return true;
  });
  const order = { open: 0, unknown: 1, closed: 2 } as const;
  return out.sort((a, b) => {
    const sa = specialStatus(a, now);
    const sb = specialStatus(b, now);
    if (sa !== sb) return order[sa] - order[sb];
    if (sa === "open") return a.at! - b.at!;
    if (sa === "closed") return b.at! - a.at!;
    return a.title.localeCompare(b.title);
  });
}
