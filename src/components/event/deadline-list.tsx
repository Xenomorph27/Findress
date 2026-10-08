"use client";

import { CountdownChip } from "@/components/event/countdown-chip";
import { useTimezone } from "@/components/timezone/timezone-provider";
import type { DetailDeadline } from "@/lib/data/types";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useNow } from "@/lib/hooks/use-now";
import { DEADLINE_KIND_LABEL, type DeadlineKind } from "@/lib/taxonomy";
import { formatInZone, zoneShortLabel } from "@/lib/time/format";
import { describeZone } from "@/lib/time/tz";
import { cn } from "@/lib/utils";

/** Deadlines as rows: kind, label, converted time, original time + zone, countdown. */
export function DeadlineList({
  deadlines,
  compact = false,
}: {
  deadlines: DetailDeadline[];
  compact?: boolean;
}) {
  const { tz } = useTimezone();
  const mounted = useMounted();
  const now = useNow(60_000);
  const zone = mounted ? tz : "UTC";
  if (deadlines.length === 0) {
    return <p className="text-muted-foreground text-sm">No deadlines announced yet.</p>;
  }
  return (
    <ul className="divide-hairline divide-y">
      {deadlines.map((d, i) => {
        const kind = DEADLINE_KIND_LABEL[d.kind as DeadlineKind] ?? d.kind;
        const passed = now != null && Date.parse(d.dueAtUtc) < now;
        return (
          <li
            key={`${d.kind}-${i}`}
            className={cn("flex items-center justify-between gap-3 py-2.5", passed && "opacity-55")}
          >
            <div className="min-w-0">
              <p className="text-sm">
                <span className="font-medium">{kind}</span>
                {d.label && d.label.toLowerCase() !== kind.toLowerCase() && (
                  <span className="text-muted-foreground"> · {d.label}</span>
                )}
              </p>
              <p className="text-muted-foreground tabular font-mono text-xs">
                {formatInZone(d.dueAtUtc, zone, "EEE, MMM d yyyy · HH:mm")} {zoneShortLabel(zone)}
                {!compact && d.originalText && (
                  <span className="hidden sm:inline">
                    {" "}
                    · published as {d.originalText} {describeZone(d.originalTz)}
                  </span>
                )}
              </p>
            </div>
            <CountdownChip dueAt={d.dueAtUtc} />
          </li>
        );
      })}
    </ul>
  );
}
