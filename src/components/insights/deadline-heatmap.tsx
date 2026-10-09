"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { InsightsSlice } from "@/lib/insights/compute";
import { formatInZone } from "@/lib/time/format";
import { ChartCard, SimpleTable } from "./chart-card";

const CELL = 12;
const GAP = 3;
const LEFT = 28;
const TOP = 18;
const DAY = 86_400_000;

function level(count: number, max: number): number {
  if (count === 0 || max === 0) return 0;
  if (max <= 5) return Math.min(5, count);
  return Math.min(5, Math.ceil((count / max) * 5));
}

/**
 * GitHub-style calendar of submission deadlines (events and journal special issues) for the
 * next 12 months. Click a day → /explore.
 */
export function DeadlineHeatmap({
  data,
  subfield,
}: {
  data: InsightsSlice["heatmap"];
  subfield: string | null;
}) {
  const router = useRouter();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  // The SVG scales with its card; size labels in user units so they render at the 12px step.
  const svgRef = useRef<SVGSVGElement>(null);
  const [labelSize, setLabelSize] = useState(9);
  const start = Date.parse(`${data.start}T00:00:00Z`);
  const weeks = Math.ceil(data.counts.length / 7);
  const width = LEFT + weeks * (CELL + GAP);
  const height = TOP + 7 * (CELL + GAP);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const rendered = entry.contentRect.width;
      if (rendered > 0) setLabelSize((12 * width) / rendered);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  const dayIso = (i: number) => new Date(start + i * DAY).toISOString().slice(0, 10);

  const go = (i: number) => {
    const d = dayIso(i);
    const p = new URLSearchParams({ window: "custom", from: d, to: d });
    if (subfield) p.set("subfield", subfield);
    router.push(`/explore?${p}`);
  };

  const monthLabels: { x: number; label: string }[] = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const m = new Date(start + w * 7 * DAY).getUTCMonth();
    if (m !== lastMonth) {
      monthLabels.push({
        x: LEFT + w * (CELL + GAP),
        label: formatInZone(start + w * 7 * DAY, "UTC", "MMM"),
      });
      lastMonth = m;
    }
  }

  const busiest = data.counts
    .map((c, i) => ({ c, i }))
    .filter((x) => x.c > 0)
    .sort((a, b) => b.c - a.c)
    .slice(0, 15);

  return (
    <ChartCard
      title="Deadline calendar"
      description="Abstract, paper and special-issue deadlines per day, next 12 months. Click a day to see them."
      table={
        <SimpleTable head={["Day", "Deadlines"]} rows={busiest.map((b) => [dayIso(b.i), b.c])} />
      }
    >
      <div className="relative overflow-x-auto pb-1">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[640px]"
          role="img"
          aria-label="Calendar heatmap of submission deadlines; details in the table view"
          onMouseLeave={() => setHover(null)}
        >
          {monthLabels.map((m) => (
            <text
              key={`${m.x}`}
              x={m.x}
              y={10}
              className="fill-muted-foreground"
              fontSize={labelSize}
            >
              {m.label}
            </text>
          ))}
          {["Mon", "Wed", "Fri"].map((d, i) => (
            <text
              key={d}
              x={0}
              y={TOP + i * 2 * (CELL + GAP) + CELL - 2}
              className="fill-muted-foreground"
              fontSize={labelSize}
            >
              {d}
            </text>
          ))}
          {data.counts.map((c, i) => {
            const w = Math.floor(i / 7);
            const d = i % 7;
            const x = LEFT + w * (CELL + GAP);
            const y = TOP + d * (CELL + GAP);
            const lv = level(c, data.max);
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                rx={3}
                fill={lv === 0 ? "var(--surface-2)" : `var(--seq-${lv})`}
                className={c > 0 ? "cursor-pointer" : undefined}
                onMouseEnter={() => setHover({ i, x: x + CELL / 2, y })}
                onClick={c > 0 ? () => go(i) : undefined}
              />
            );
          })}
        </svg>
        {hover && (
          <div
            className="border-hairline bg-popover pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-lg"
            style={{ left: `${(hover.x / width) * 100}%`, top: `${(hover.y / height) * 100}%` }}
          >
            <span className="font-mono">
              {formatInZone(start + hover.i * DAY, "UTC", "EEE, MMM d")}
            </span>{" "}
            · {data.counts[hover.i]} deadline{data.counts[hover.i] === 1 ? "" : "s"}
          </div>
        )}
      </div>
      <div
        className="text-muted-foreground mt-3 flex items-center justify-end gap-1.5 text-xs"
        aria-hidden
      >
        Fewer
        {[0, 1, 2, 3, 4, 5].map((l) => (
          <span
            key={l}
            className="size-2.5 rounded-[3px]"
            style={{ background: l === 0 ? "var(--surface-2)" : `var(--seq-${l})` }}
          />
        ))}
        More
      </div>
    </ChartCard>
  );
}
