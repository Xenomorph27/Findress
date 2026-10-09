import type { JournalListRow } from "@/lib/data/types";

/** Human label for what it costs to publish (server- and client-safe). */
export function formatApc(r: Pick<JournalListRow, "openAccess" | "apcUsd">): string {
  if (r.apcUsd === 0) return "No APC";
  if (r.apcUsd != null) return `APC $${r.apcUsd.toLocaleString("en-US")}`;
  return r.openAccess === "subscription" ? "No APC (subscription)" : "APC not announced";
}
