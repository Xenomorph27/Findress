import { icsFeedToken } from "@/lib/auth/owner";
import { isOwnerRequest } from "@/lib/auth/session";
import { safeEqual } from "@/lib/auth/cron";
import { milestoneUids } from "@/lib/data/milestones";
import { listWorkspace } from "@/lib/data/workspace";
import { getDb } from "@/lib/db";
import { buildCalendar, type IcsItem } from "@/lib/ics";
import { absoluteUrl } from "@/lib/site";
import { DEADLINE_KIND_LABEL, type DeadlineKind } from "@/lib/taxonomy";

/**
 * GET /api/workspace/ics — every deadline of every bookmarked event as one subscribable
 * calendar. Owner cookie, or ?token= (shown in the workspace) for calendar apps.
 *
 * Each entry's UID is its milestone identity (target + kind + round, see milestones.ts), which
 * is also the dedupe key: two events with a deadline at the same moment are two entries, while a
 * special issue bookmarked both directly and through its journal is one.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const expected = await icsFeedToken();
  const tokenOk = !!token && !!expected && safeEqual(token, expected);
  if (!tokenOk && !(await isOwnerRequest(request)))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) return Response.json({ error: "db-not-configured" }, { status: 503 });

  const items: IcsItem[] = [];
  const seen = new Set<string>();
  for (const it of await listWorkspace(db)) {
    if (it.status === "rejected") continue;
    const url = it.href.startsWith("/") ? absoluteUrl(it.href) : it.href;
    const label = it.year != null ? `${it.acronym} ${it.year}` : it.acronym;
    const owned = it.deadlines.filter((d) => d.specialIssueId == null);
    const uids = new Map(
      milestoneUids(`${it.kind}-${it.targetId}`, owned).map((uid, i) => [owned[i], uid]),
    );
    for (const d of it.deadlines) {
      const uid =
        d.specialIssueId != null
          ? milestoneUids(`special-${d.specialIssueId}`, [d])[0]
          : uids.get(d)!;
      if (seen.has(uid)) continue;
      seen.add(uid);
      const kind = DEADLINE_KIND_LABEL[d.kind as DeadlineKind] ?? d.kind;
      items.push({
        uid,
        title:
          it.kind === "event"
            ? `${label}: ${kind}${d.label && d.label.toLowerCase() !== kind.toLowerCase() ? ` — ${d.label}` : ""}`
            : `${label}: ${d.label ?? kind}`,
        description: `Status: ${it.status}\n${url}`,
        url,
        at: new Date(d.dueAtUtc),
        alarmMinutesBefore: ["abstract", "paper"].includes(d.kind) ? 3 * 24 * 60 : undefined,
      });
    }
  }
  return new Response(buildCalendar("FIndress — my deadlines", items), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="findress-deadlines.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
