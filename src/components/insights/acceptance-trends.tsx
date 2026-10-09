"use client";

import Link from "next/link";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { InsightsSlice } from "@/lib/insights/compute";
import { ChartCard, SERIES_VARS, SimpleTable } from "./chart-card";

interface TipProps {
  active?: boolean;
  label?: number;
  payload?: { dataKey: string; value: number; color: string; name: string }[];
}
function Tip({ active, label, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-hairline bg-popover lift rounded-lg border px-3 py-2 text-xs">
      <p className="text-foreground mb-1 font-mono">{label}</p>
      {[...payload]
        .sort((a, b) => b.value - a.value)
        .map((p) => (
          <p key={p.dataKey} className="text-muted-foreground flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded" style={{ background: p.color }} />
            {p.name}
            <span className="text-foreground ml-auto pl-3 font-mono">
              {(p.value * 100).toFixed(1)}%
            </span>
          </p>
        ))}
    </div>
  );
}

/** Acceptance rates of flagship venues (one axis, ≤6 series, legend links to each venue). */
export function AcceptanceTrends({ series }: { series: InsightsSlice["acceptance"] }) {
  if (series.length === 0) {
    return (
      <ChartCard title="Acceptance rates" description="No acceptance data for this subfield yet.">
        <p className="text-muted-foreground text-sm">Try “All subfields”.</p>
      </ChartCard>
    );
  }
  const years = [...new Set(series.flatMap((s) => s.points.map((p) => p.year)))].sort();
  const rows = years.map((y) => {
    const r: Record<string, number | null> = { year: y };
    for (const s of series) r[s.seriesKey] = s.points.find((p) => p.year === y)?.rate ?? null;
    return r;
  });
  return (
    <ChartCard
      title="Acceptance rates"
      description="Flagship venues by year (accepted ÷ submitted, from ccfddl). Click a name to open it."
      table={
        <SimpleTable
          head={["Year", ...series.map((s) => s.label)]}
          rows={rows.map((r) => [
            String(r.year),
            ...series.map((s) =>
              r[s.seriesKey] != null ? `${((r[s.seriesKey] as number) * 100).toFixed(1)}%` : "—",
            ),
          ])}
        />
      }
    >
      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
        {series.map((s, i) => (
          <Link
            key={s.seriesKey}
            href={s.slug ? `/c/${s.slug}` : "/explore"}
            className="text-muted-foreground hover:text-foreground inline-flex min-h-6 items-center gap-1.5 text-xs"
          >
            <span
              aria-hidden
              className="h-0.5 w-3.5 rounded"
              style={{ background: SERIES_VARS[i] }}
            />
            {s.label}
          </Link>
        ))}
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 6, right: 12, bottom: 0, left: -10 }}>
            <CartesianGrid vertical={false} stroke="var(--hairline)" />
            <XAxis
              dataKey="year"
              tickLine={false}
              axisLine={{ stroke: "var(--hairline-strong)" }}
              tick={{
                fill: "var(--muted-text)",
                fontSize: 12,
                fontFamily: "var(--font-geist-mono)",
              }}
            />
            <YAxis
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              domain={[0, "auto"]}
              tickLine={false}
              axisLine={false}
              tick={{
                fill: "var(--muted-text)",
                fontSize: 12,
                fontFamily: "var(--font-geist-mono)",
              }}
            />
            <Tooltip content={<Tip />} cursor={{ stroke: "var(--hairline-strong)" }} />
            {series.map((s, i) => (
              <Line
                key={s.seriesKey}
                dataKey={s.seriesKey}
                name={s.label}
                stroke={SERIES_VARS[i]}
                strokeWidth={2}
                dot={{ r: 3, fill: SERIES_VARS[i], stroke: "var(--surface)", strokeWidth: 2 }}
                activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
