import { getEventDetail, withDbFallback } from "@/lib/data/events";
import { eventToIcsItems } from "@/lib/data/event-ics";
import { buildCalendar, icsResponse } from "@/lib/ics";

/** GET /api/events/[slug]/ics — every milestone of one event as an .ics file. */
export async function GET(_request: Request, ctx: RouteContext<"/api/events/[slug]/ics">) {
  const { slug } = await ctx.params;
  const res = await withDbFallback(null, () => getEventDetail(slug));
  if (!res.data) return Response.json({ error: "not found" }, { status: 404 });
  const e = res.data;
  return icsResponse(buildCalendar(`${e.acronym} ${e.year}`, eventToIcsItems(e)), `${e.slug}.ics`);
}
