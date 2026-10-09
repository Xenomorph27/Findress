import { withDbFallback } from "@/lib/data/events";
import { getJournalRows, getSpecialIssueRows } from "@/lib/data/journals";
import { DEFAULT_FILTERS, parseFilters } from "@/lib/explore/filters";
import { applyJournalFilters, applySpecialFilters } from "@/lib/explore/journal-filters";

/**
 * GET /api/journals — journals (and with ?include=special, open special issues), filtered with
 * the /explore journal params: q, subfield, oa, apcmax, jrank, publisher, jsort, limit, offset.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const f = { ...DEFAULT_FILTERS, ...parseFilters(url.searchParams) };
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
  const [journals, specials] = await Promise.all([
    withDbFallback([], getJournalRows),
    withDbFallback([], getSpecialIssueRows),
  ]);
  if (journals.error && journals.error !== "not-configured") {
    return Response.json({ error: "database unavailable" }, { status: 503 });
  }
  const now = Date.now();
  const rows = applyJournalFilters(journals.data, f, now);
  const body: Record<string, unknown> = {
    total: rows.length,
    limit,
    offset,
    items: rows.slice(offset, offset + limit).map(({ id, ...r }) => {
      void id;
      return { ...r, url: `/j/${r.slug}` };
    }),
  };
  if (url.searchParams.get("include") === "special") {
    body.specialIssues = applySpecialFilters(specials.data, f, now).map((s) => ({
      ...s,
      deadline: s.at ? new Date(s.at).toISOString() : null,
    }));
  }
  return Response.json(body, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
