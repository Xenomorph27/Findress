"use client";

import { CountdownChip } from "@/components/event/countdown-chip";
import { useTimezone } from "@/components/timezone/timezone-provider";
import { TimezoneSelect } from "@/components/timezone/timezone-select";
import type { DetailDeadline } from "@/lib/data/types";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useNow } from "@/lib/hooks/use-now";
import { DEADLINE_KIND_LABEL, type DeadlineKind } from "@/lib/taxonomy";
import { formatInZone, zoneShortLabel } from "@/lib/time/format";
import { describeZone } from "@/lib/time/tz";
import { cn } from "@/lib/utils";

interface Milestone {
  key: string;
  title: string;
  detail: string | null;
  at: number;
  allDay: boolean;
  isEvent: boolean;
  original: string | null;
}

const RIBBON_MAX = 6;

function toMilestones(
  deadlines: DetailDeadline[],
  startDate: string | null,
  endDate: string | null,
): Milestone[] {
  const out: Milestone[] = deadlines.map((d, i) => {
    const kind = DEADLINE_KIND_LABEL[d.kind as DeadlineKind] ?? d.kind;
    return {
      key: `${d.kind}-${i}`,
      title: kind,
      detail: d.label && d.label.toLowerCase() !== kind.toLowerCase() ? d.label : null,
      at: Date.parse(d.dueAtUtc),
      allDay: false,
      isEvent: false,
      original: d.originalText ? `${d.originalText} ${describeZone(d.originalTz)}` : null,
    };
  });
  if (startDate) {
    out.push({
      key: "event",
      title: "Conference",
      detail: endDate && endDate !== startDate ? `until ${endDate}` : null,
      at: Date.parse(`${startDate}T00:00:00Z`),
      allDay: true,
      isEvent: true,
      original: null,
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Horizontal milestone ribbon (DESIGN signature #3): milestones on a thin luminous line,
 * a "today" marker, passed milestones dimmed. Becomes a vertical list on narrow screens.
 */
export function TimelineRibbon({
  deadlines,
  startDate,
  endDate,
}: {
  deadlines: DetailDeadline[];
  startDate: string | null;
  endDate: string | null;
}) {
  const { tz } = useTimezone();
  const mounted = useMounted();
  const now = useNow(60_000);
  const zone = mounted ? tz : "UTC";
  const items = toMilestones(deadlines, startDate, endDate);
  const nextIdx = now == null ? -1 : items.findIndex((m) => m.at >= now);

  // "Today" sits between the last passed and the next milestone.
  let todayPct: number | null = null;
  if (now != null && items.length > 1) {
    const n = items.length;
    const slot = (i: number) => ((i + 0.5) / n) * 100;
    if (nextIdx === -1) todayPct = 100;
    else if (nextIdx === 0) todayPct = 0;
    else {
      const a = items[nextIdx - 1];
      const b = items[nextIdx];
      const f = Math.min(1, Math.max(0, (now - a.at) / Math.max(1, b.at - a.at)));
      todayPct = slot(nextIdx - 1) + f * (slot(nextIdx) - slot(nextIdx - 1));
    }
  }

  // The horizontal ribbon only reads well with a handful of milestones; longer schedules
  // (NeurIPS has eight) use the calm vertical list at every width.
  const ribbon = items.length <= RIBBON_MAX;
  const day = (m: Milestone) => formatInZone(m.at, m.isEvent ? "UTC" : zone, "MMM d, yyyy");
  const time = (m: Milestone) => (m.isEvent ? null : formatInZone(m.at, zone, "HH:mm"));
  const when = (m: Milestone) =>
    m.allDay
      ? formatInZone(m.at, "UTC", "MMM d, yyyy")
      : formatInZone(m.at, zone, "MMM d, yyyy · HH:mm");

  return (
    <section
      aria-labelledby="timeline-title"
      className="border-hairline bg-surface/50 rounded-2xl border p-5 md:p-6"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="timeline-title" className="font-heading text-xl">
            Timeline
          </h2>
          <p className="text-muted-foreground text-xs">
            Times shown in <span className="font-mono">{zoneShortLabel(zone)}</span> · converted
            from each source’s published zone
          </p>
        </div>
        <TimezoneSelect />
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No milestones announced yet.</p>
      ) : (
        <>
          {/* Desktop: horizontal ribbon */}
          {ribbon && (
            <div className="relative hidden pt-8 pb-2 md:block">
              <div
                aria-hidden
                className="bg-hairline-strong absolute top-[47px] right-0 left-0 h-px"
              />
              <div
                aria-hidden
                className="bg-aurora absolute top-[46px] left-0 h-[3px] rounded-full opacity-70 shadow-[0_0_12px_var(--aurora-2)]"
                style={{ width: `${todayPct ?? 0}%` }}
              />
              {todayPct != null && (
                <div
                  className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                  style={{ left: `${todayPct}%` }}
                >
                  <span className="bg-foreground text-background rounded-full px-1.5 text-xs font-medium tracking-wide uppercase">
                    today
                  </span>
                  <span aria-hidden className="bg-foreground/60 mt-1 h-[22px] w-px" />
                </div>
              )}
              <ol
                className="relative grid"
                style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
              >
                {items.map((m, i) => {
                  const passed = now != null && m.at < now;
                  const isNext = i === nextIdx;
                  return (
                    <li
                      key={m.key}
                      className={cn(
                        "flex flex-col items-center px-1 text-center",
                        passed && "opacity-45",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "border-background mt-[11px] size-3 rounded-full border-2",
                          m.isEvent
                            ? "bg-aurora-3"
                            : isNext
                              ? "bg-aurora-1 shadow-[0_0_12px_var(--aurora-1)]"
                              : "bg-muted-foreground",
                        )}
                      />
                      <span className="mt-3 text-sm font-medium">{m.title}</span>
                      {m.detail && (
                        <span className="text-muted-foreground line-clamp-2 text-xs">
                          {m.detail}
                        </span>
                      )}
                      <span className="text-muted-foreground mt-1 font-mono text-xs">{day(m)}</span>
                      {time(m) && (
                        <span className="text-muted-foreground font-mono text-xs">{time(m)}</span>
                      )}
                      {isNext && !m.isEvent && <CountdownChip dueAt={m.at} className="mt-2" />}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {/* Vertical list: mobile, and desktop when there are too many milestones for a ribbon */}
          <ol
            className={cn(
              "border-hairline-strong relative space-y-5 border-l pl-5",
              ribbon && "md:hidden",
            )}
          >
            {items.map((m, i) => {
              const passed = now != null && m.at < now;
              const isNext = i === nextIdx;
              return (
                <li key={m.key} className={cn("relative", passed && "opacity-45")}>
                  <span
                    aria-hidden
                    className={cn(
                      "border-background absolute top-1.5 -left-[26px] size-2.5 rounded-full border-2",
                      m.isEvent ? "bg-aurora-3" : isNext ? "bg-aurora-1" : "bg-muted-foreground",
                    )}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {m.title}
                        {m.detail && (
                          <span className="text-muted-foreground font-normal"> · {m.detail}</span>
                        )}
                      </p>
                      <p className="text-muted-foreground tabular font-mono text-xs">{when(m)}</p>
                    </div>
                    {!m.isEvent && !passed && <CountdownChip dueAt={m.at} />}
                  </div>
                </li>
              );
            })}
          </ol>

          <details className="text-muted-foreground mt-5 text-xs">
            <summary className="hover:text-foreground cursor-pointer select-none">
              As published by the sources
            </summary>
            <ul className="mt-2 space-y-1 font-mono">
              {items
                .filter((m) => m.original)
                .map((m) => (
                  <li key={m.key}>
                    {m.title}
                    {m.detail ? ` (${m.detail})` : ""}: {m.original}
                  </li>
                ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
