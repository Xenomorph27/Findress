import { getExplorerRows, searchEventIds, withDbFallback } from "@/lib/data/events";
import { applyFilters, nextDeadline, parseFilters } from "@/lib/explore/filters";

/**
 * GET /api/events — public, filtered + paginated event list (documented in the README for
 * external agents). Accepts every /explore query parameter plus `limit` (≤200) and `offset`.
 * `q` uses Postgres full-text search.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const filters = parseFilters(url.searchParams);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);

  const loaded = await withDbFallback([], getExplorerRows);
  if (loaded.error && loaded.error !== "not-configured") {
    return Response.json({ error: "database unavailable" }, { status: 503 });
  }
  let rows = loaded.data;
  const q = filters.q.trim();
  if (q) {
    const ids = await withDbFallback([] as number[], () => searchEventIds(q));
    const rank = new Map(ids.data.map((id, i) => [id, i]));
    rows = rows.filter((r) => rank.has(r.id));
    filters.q = "";
    const now = Date.now();
    const filtered = applyFilters(rows, filters, now);
    // Keep relevance order for text queries unless a sort was requested.
    if (!url.searchParams.get("sort")) filtered.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    return respond(filtered, limit, offset, now);
  }
  const now = Date.now();
  return respond(applyFilters(rows, filters, now), limit, offset, now);
}

function respond(
  rows: ReturnType<typeof applyFilters>,
  limit: number,
  offset: number,
  now: number,
) {
  const items = rows.slice(offset, offset + limit).map((r) => {
    const nd = nextDeadline(r, now);
    return {
      slug: r.slug,
      acronym: r.acronym,
      year: r.year,
      name: r.name,
      type: r.type,
      parent: r.parent,
      subfields: r.subfields,
      topics: r.topics,
      rankCore: r.rankCore,
      rankCcf: r.rankCcf,
      mode: r.mode,
      city: r.city,
      country: r.country,
      countryCode: r.countryCode,
      startDate: r.startDate,
      endDate: r.endDate,
      nextDeadlineAt: nd ? new Date(nd.at).toISOString() : null,
      nextDeadlineKind: nd?.kind ?? null,
      nextDeadlinePassed: nd?.passed ?? null,
      url: `/c/${r.slug}`,
    };
  });
  return Response.json(
    { total: rows.length, limit, offset, items },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
