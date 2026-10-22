import { formatIssn, normalizeIssn, SJR_CREDIT, SJR_URL } from "@/lib/sources/scimago";

/** "Q1 · SJR 2.314 (2024)" — the value as SCImago publishes it. */
export function formatSjr(
  quartile: string | null,
  score: number | null,
  year: number | null,
): string | null {
  if (!quartile && score == null) return null;
  const parts = [quartile, score != null ? `SJR ${score.toFixed(3)}` : null].filter(Boolean);
  return `${parts.join(" · ")}${year ? ` (${year})` : ""}`;
}

/**
 * The attribution that must accompany every SJR figure, linking to the journal's SCImago page
 * (searched by ISSN) or to SCImago itself.
 */
export function SjrCredit({ issn, className }: { issn?: string | null; className?: string }) {
  const n = normalizeIssn(issn);
  const href = n ? `${SJR_URL}journalsearch.php?q=${formatIssn(n)}&tip=iss` : SJR_URL;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ??
        "text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
      }
    >
      {SJR_CREDIT}
    </a>
  );
}
