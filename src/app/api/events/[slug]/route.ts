import { getEventDetail, withDbFallback } from "@/lib/data/events";

/** GET /api/events/[slug] — full public record of one event (CFP text included). */
export async function GET(_request: Request, ctx: RouteContext<"/api/events/[slug]">) {
  const { slug } = await ctx.params;
  const res = await withDbFallback(null, () => getEventDetail(slug));
  if (res.error && res.error !== "not-configured") {
    return Response.json({ error: "database unavailable" }, { status: 503 });
  }
  if (!res.data) return Response.json({ error: "not found" }, { status: 404 });
  const { id, ...event } = res.data;
  void id; // internal key, not part of the public API
  return Response.json(event, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
