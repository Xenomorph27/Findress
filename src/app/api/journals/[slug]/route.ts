import { withDbFallback } from "@/lib/data/events";
import { getJournalDetail } from "@/lib/data/journals";

/** GET /api/journals/[slug] — full public record of one journal, special issues included. */
export async function GET(_request: Request, ctx: RouteContext<"/api/journals/[slug]">) {
  const { slug } = await ctx.params;
  const res = await withDbFallback(null, () => getJournalDetail(slug));
  if (res.error && res.error !== "not-configured") {
    return Response.json({ error: "database unavailable" }, { status: 503 });
  }
  if (!res.data) return Response.json({ error: "not found" }, { status: 404 });
  const { id, ...journal } = res.data;
  void id; // internal key, not part of the public API
  return Response.json(journal, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
