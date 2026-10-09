"use client";

import { CountdownChip } from "@/components/event/countdown-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "@/lib/hooks/use-now";

const HOUR = 3_600_000;
const SAMPLES = [
  { label: "calm", offset: 64 * 24 * HOUR },
  { label: "warm", offset: 19 * 24 * HOUR },
  { label: "hot", offset: 5 * 24 * HOUR },
  { label: "< 72h (ticking)", offset: 41 * HOUR + 17 * 60_000 },
  { label: "passed", offset: -3 * 24 * HOUR },
];

/** Sample deadlines relative to the viewer's clock (anchored to the current hour). */
export function DemoCountdowns() {
  const anchor = useNow(HOUR);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {SAMPLES.map((s) => (
        <div key={s.label} className="flex flex-col items-start gap-1.5">
          {anchor == null ? (
            <Skeleton className="h-6 w-20 rounded-full" />
          ) : (
            <CountdownChip dueAt={anchor + s.offset} size="md" />
          )}
          <span className="text-muted-foreground font-mono text-xs">{s.label}</span>
        </div>
      ))}
      <div className="flex flex-col items-start gap-1.5">
        <CountdownChip dueAt={null} size="md" />
        <span className="text-muted-foreground font-mono text-xs">unknown</span>
      </div>
    </div>
  );
}
