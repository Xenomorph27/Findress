import { DEADLINE_KIND_LABEL, type DeadlineKind } from "@/lib/taxonomy";
import { absoluteUrl } from "@/lib/site";
import type { IcsItem } from "@/lib/ics";
import type { EventDetail } from "./types";

/** All dated milestones of one event as calendar items (deadlines + the event itself). */
export function eventToIcsItems(e: EventDetail): IcsItem[] {
  const title = `${e.acronym} ${e.year}`;
  const url = absoluteUrl(`/c/${e.slug}`);
  const items: IcsItem[] = e.deadlines.map((d, i) => {
    const kind = DEADLINE_KIND_LABEL[d.kind as DeadlineKind] ?? d.kind;
    const label =
      d.label && d.label.toLowerCase() !== kind.toLowerCase() ? `${kind} — ${d.label}` : kind;
    return {
      uid: `${e.slug}-${d.kind}-${i}@findress`,
      title: `${title}: ${label}`,
      description: [
        d.originalText
          ? `As published: ${d.originalText} ${d.originalTz ?? "(timezone not stated)"}`
          : null,
        d.comment,
        `Source: ${d.source}`,
        url,
      ]
        .filter(Boolean)
        .join("\n"),
      url,
      at: new Date(d.dueAtUtc),
      alarmMinutesBefore: ["abstract", "paper"].includes(d.kind) ? 3 * 24 * 60 : undefined,
    };
  });
  if (e.startDate) {
    items.push({
      uid: `${e.slug}-event@findress`,
      title: `${title}${e.city ? ` — ${e.city}` : ""}`,
      description: [e.name, e.website, url].filter(Boolean).join("\n"),
      url: e.website ?? url,
      allDay: { start: e.startDate, end: e.endDate },
    });
  }
  return items;
}
