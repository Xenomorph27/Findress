import { ownerOnly, PRIVATE_NO_STORE } from "@/lib/auth/session";
import { getEventDetail, withDbFallback } from "@/lib/data/events";

/** GET /api/events/[slug] — full record of one event (CFP text included); owner only. */
export async function GET(request: Request, ctx: RouteContext<"/api/events/[slug]">) {
  const denied = await ownerOnly(request);
  if (denied) return denied;
  const { slug } = await ctx.params;
  const res = await withDbFallback(null, () => getEventDetail(slug));
  if (res.error && res.error !== "not-configured") {
    return Response.json({ error: "database unavailable" }, { status: 503 });
  }
  if (!res.data) return Response.json({ error: "not found" }, { status: 404 });
  const { id, ...event } = res.data;
  void id; // internal key, not part of the API
  return Response.json(event, { headers: PRIVATE_NO_STORE });
}
