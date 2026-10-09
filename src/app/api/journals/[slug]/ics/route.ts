import { getJournalDetail } from "@/lib/data/journals";
import { withDbFallback } from "@/lib/data/events";
import { buildCalendar, icsResponse, type IcsItem } from "@/lib/ics";
import { absoluteUrl } from "@/lib/site";

/** GET /api/journals/[slug]/ics — every dated special-issue deadline of one journal. */
export async function GET(_request: Request, ctx: RouteContext<"/api/journals/[slug]/ics">) {
  const { slug } = await ctx.params;
  const res = await withDbFallback(null, () => getJournalDetail(slug));
  if (!res.data) return Response.json({ error: "not found" }, { status: 404 });
  const j = res.data;
  const items: IcsItem[] = j.specialIssues
    .filter((c) => c.submissionDeadlineUtc)
    .map((c) => ({
      uid: `${j.slug}-si-${c.id}@findress`,
      title: `${j.abbreviation} special issue: ${c.title}`,
      description: `Submission deadline as stated: ${c.deadlineText ?? "?"} (no time zone given; end of day AoE).\n${c.url ?? absoluteUrl(`/j/${j.slug}`)}`,
      url: c.url ?? absoluteUrl(`/j/${j.slug}#si-${c.id}`),
      at: new Date(c.submissionDeadlineUtc!),
      alarmMinutesBefore: 3 * 24 * 60,
    }));
  return icsResponse(buildCalendar(`${j.abbreviation} special issues`, items), `${j.slug}.ics`);
}
