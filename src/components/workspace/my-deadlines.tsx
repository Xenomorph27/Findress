"use client";

import Link from "next/link";
import { CountdownChip } from "@/components/event/countdown-chip";
import { useTimezone } from "@/components/timezone/timezone-provider";
import type { WorkspaceItem } from "@/lib/data/workspace";
import { useMounted } from "@/lib/hooks/use-mounted";
import { DEADLINE_KIND_LABEL, STATUS_LABEL, type DeadlineKind } from "@/lib/taxonomy";
import { formatInZone, zoneShortLabel } from "@/lib/time/format";

/** Every upcoming deadline across bookmarked venues, grouped by month. */
export function MyDeadlines({ items, now }: { items: WorkspaceItem[]; now: number }) {
  const { tz } = useTimezone();
  const mounted = useMounted();
  const zone = mounted ? tz : "UTC";
  const rows = items
    .filter((i) => i.status !== "rejected")
    .flatMap((i) => i.deadlines.map((d) => ({ item: i, d, at: Date.parse(d.dueAtUtc) })))
    .filter((r) => r.at >= now)
    .sort((a, b) => a.at - b.at)
    .slice(0, 60);

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No upcoming deadlines among your bookmarks.</p>
    );
  }
  const months = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = formatInZone(r.at, zone, "MMMM yyyy");
    months.set(key, [...(months.get(key) ?? []), r]);
  }
  return (
    <div className="space-y-6">
      {[...months.entries()].map(([month, list]) => (
        <section key={month} aria-label={month}>
          <h3 className="text-muted-foreground mb-2 font-mono text-[11px] tracking-[0.16em] uppercase">
            {month}
          </h3>
          <ol className="border-hairline-strong relative space-y-2 border-l pl-5">
            {list.map(({ item, d, at }, i) => (
              <li key={`${item.key}-${d.kind}-${i}`} className="relative">
                <span
                  aria-hidden
                  className="bg-aurora-2 absolute top-2 -left-[25px] size-2 rounded-full"
                />
                <Link
                  href={item.href}
                  className="hover:bg-surface-2/50 flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5"
                >
                  <span className="min-w-0">
                    <span className="font-medium">
                      {item.acronym}
                      {item.year != null && ` ${item.year}`}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {DEADLINE_KIND_LABEL[d.kind as DeadlineKind] ?? d.kind}
                      {d.label ? ` (${d.label})` : ""}
                    </span>
                    <span className="text-muted-foreground block font-mono text-xs">
                      {formatInZone(at, zone, "EEE MMM d · HH:mm")} {zoneShortLabel(zone)} ·{" "}
                      {STATUS_LABEL[item.status]}
                    </span>
                  </span>
                  <CountdownChip dueAt={at} />
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
