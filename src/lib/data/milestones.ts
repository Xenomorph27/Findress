/**
 * Calendar identity of a deadline ("milestone"): who it belongs to, what kind it is and which
 * round, never its date or its position in a list. So an extended deadline updates the same
 * calendar entry, separate rounds stay separate entries, and a re-merge (which rebuilds the
 * deadline rows with new ids) changes nothing in a subscribed calendar.
 */

interface MilestoneInput {
  kind: string;
  label: string | null;
  dueAtUtc: string;
}

/** "Round 2 (Feb)" → "round-2-feb"; empty for no label. */
export function labelSlug(label: string | null | undefined): string {
  return (label ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // "é" → "e" (drop the separated accent)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * One UID per deadline: `<owner>-<kind>[-<round>][-<n>]@findress`. `owner` identifies the
 * target ("event-12", "special-7", or an event slug). `n` (2, 3 …) only separates deadlines
 * that share owner, kind and label, numbered in date order. Returned in the input order.
 */
export function milestoneUids<T extends MilestoneInput>(owner: string, deadlines: T[]): string[] {
  const base = (d: T) => [owner, d.kind, labelSlug(d.label)].filter(Boolean).join("-");
  const byTime = deadlines
    .map((d, i) => ({ d, i }))
    .sort((a, b) => a.d.dueAtUtc.localeCompare(b.d.dueAtUtc) || a.i - b.i);
  const seen = new Map<string, number>();
  const uids: string[] = new Array(deadlines.length);
  for (const { d, i } of byTime) {
    const key = base(d);
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    uids[i] = `${key}${n > 1 ? `-${n}` : ""}@findress`;
  }
  return uids;
}
