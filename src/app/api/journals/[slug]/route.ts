import { ownerOnly, PRIVATE_NO_STORE } from "@/lib/auth/session";
import { withDbFallback } from "@/lib/data/events";
import { getJournalDetail } from "@/lib/data/journals";

/** GET /api/journals/[slug] — full record of one journal, special issues included; owner only. */
export async function GET(request: Request, ctx: RouteContext<"/api/journals/[slug]">) {
  const denied = await ownerOnly(request);
  if (denied) return denied;
  const { slug } = await ctx.params;
  const res = await withDbFallback(null, () => getJournalDetail(slug));
  if (res.error && res.error !== "not-configured") {
    return Response.json({ error: "database unavailable" }, { status: 503 });
  }
  if (!res.data) return Response.json({ error: "not found" }, { status: 404 });
  const { id, ...journal } = res.data;
  void id; // internal key, not part of the API
  return Response.json(journal, { headers: PRIVATE_NO_STORE });
}
