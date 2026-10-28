import type { JournalCall, JournalListRow } from "@/lib/data/types";

/** A journal's special-issue calls still open at `now` (epoch ms), soonest first. */
export function openCallsAt(row: Pick<JournalListRow, "calls">, now: number): JournalCall[] {
  return row.calls.filter((c) => c.at >= now);
}

/** The soonest call still open at `now`, or null. */
export function nextCallAt(row: Pick<JournalListRow, "calls">, now: number): JournalCall | null {
  return openCallsAt(row, now)[0] ?? null;
}
