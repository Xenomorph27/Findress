import type { JournalListRow, SpecialIssueListRow } from "@/lib/data/types";

/** Journal views on /insights (pure; computed per subfield slice like the event charts). */
export interface JournalInsights {
  totals: { journals: number; fullOa: number; openCalls: number; medianApc: number | null };
  /** One dot per journal with a known fee: x = APC (USD), y = h-index, colored by OA model. */
  scatter: {
    slug: string;
    abbreviation: string;
    apc: number;
    hIndex: number;
    oa: "full" | "hybrid";
  }[];
  topByH: { slug: string; abbreviation: string; name: string; hIndex: number }[];
  upcomingCalls: {
    id: number;
    title: string;
    journal: string;
    href: string;
    external: boolean;
    at: number;
  }[];
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function computeJournalInsights(
  journals: JournalListRow[],
  specials: SpecialIssueListRow[],
  subfield: string | null,
  now: number,
): JournalInsights {
  const js = subfield ? journals.filter((j) => j.subfields.includes(subfield)) : journals;
  const ss = (subfield ? specials.filter((s) => s.subfields.includes(subfield)) : specials).filter(
    (s) => s.at != null && s.at >= now,
  );
  const scatter = js
    .filter(
      (
        j,
      ): j is JournalListRow & { apcUsd: number; hIndex: number; openAccess: "full" | "hybrid" } =>
        j.apcUsd != null &&
        j.hIndex != null &&
        (j.openAccess === "full" || j.openAccess === "hybrid"),
    )
    .map((j) => ({
      slug: j.slug,
      abbreviation: j.abbreviation,
      apc: j.apcUsd,
      hIndex: j.hIndex,
      oa: j.openAccess,
    }));
  return {
    totals: {
      journals: js.length,
      fullOa: js.filter((j) => j.openAccess === "full").length,
      openCalls: ss.length,
      medianApc: median(js.filter((j) => j.apcUsd != null && j.apcUsd > 0).map((j) => j.apcUsd!)),
    },
    scatter,
    topByH: js
      .filter((j) => j.hIndex != null)
      .sort((a, b) => b.hIndex! - a.hIndex!)
      .slice(0, 10)
      .map((j) => ({
        slug: j.slug,
        abbreviation: j.abbreviation,
        name: j.name,
        hIndex: j.hIndex!,
      })),
    upcomingCalls: ss
      .sort((a, b) => a.at! - b.at!)
      .slice(0, 8)
      .map((s) => ({
        id: s.id,
        title: s.title,
        journal: s.journal?.abbreviation ?? s.journalName ?? "Journal not stated",
        href: s.journal ? `/j/${s.journal.slug}#si-${s.id}` : (s.url ?? "/explore?tab=special"),
        external: !s.journal && !!s.url,
        at: s.at!,
      })),
  };
}
