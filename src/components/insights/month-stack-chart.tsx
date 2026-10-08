"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { InsightsSlice } from "@/lib/insights/compute";
import { ChartCard, LegendItem, OTHER_VAR, SERIES_VARS, SimpleTable } from "./chart-card";

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" });

function lastDay(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
}

interface TipProps {
  active?: boolean;
  label?: string;
  payload?: { dataKey: string; value: number; color: string; name: string }[];
}
function Tip({ active, label, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((a, p) => a + (p.value ?? 0), 0);
  return (
    <div className="border-hairline bg-popover rounded-lg border px-3 py-2 text-xs shadow-lg">
      <p className="text-foreground mb-1 font-mono">
        {label} · {total} events
      </p>
      {[...payload].reverse().map((p) =>
        p.value ? (
          <p key={p.dataKey} className="text-muted-foreground flex items-center gap-1.5">
            <span className="size-2 rounded-[2px]" style={{ background: p.color }} />
            {p.name} <span className="text-foreground ml-auto pl-3 font-mono">{p.value}</span>
          </p>
        ) : null,
      )}
    </div>
  );
}

/** Events per month (by start date), stacked by subfield. Click a segment → /explore. */
export function MonthStackChart({
  data,
  subfield,
}: {
  data: InsightsSlice["perMonth"];
  subfield: string | null;
}) {
  const router = useRouter();
  const rows = data.months.map((m, i) => {
    const r: Record<string, string | number> = { month: monthLabel(m), key: m };
    for (const s of data.series) r[s.key] = s.counts[i];
    return r;
  });
  const color = (key: string, i: number) =>
    key === "other" ? OTHER_VAR : SERIES_VARS[i % SERIES_VARS.length];

  const go = (seriesKey: string, monthKey: string) => {
    const p = new URLSearchParams({
      evfrom: `${monthKey}-01`,
      evto: lastDay(monthKey),
      passed: "1",
    });
    const sf = subfield ?? (seriesKey !== "other" ? seriesKey : null);
    if (sf) p.set("subfield", sf);
    router.push(`/explore?${p}`);
  };

  return (
    <ChartCard
      title="Events per month"
      description="By start date, next 12 months, stacked by subfield."
      table={
        <SimpleTable
          head={["Month", ...data.series.map((s) => s.label)]}
          rows={data.months.map((m, i) => [m, ...data.series.map((s) => s.counts[i])])}
        />
      }
    >
      {data.series.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
          {data.series.map((s, i) => (
            <LegendItem key={s.key} color={color(s.key, i)} label={s.label} />
          ))}
        </div>
      )}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{ top: 4, right: 4, bottom: 0, left: -18 }}
            barCategoryGap="28%"
          >
            <CartesianGrid vertical={false} stroke="var(--hairline)" />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={{ stroke: "var(--hairline-strong)" }}
              tick={{
                fill: "var(--muted-text)",
                fontSize: 11,
                fontFamily: "var(--font-geist-mono)",
              }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{
                fill: "var(--muted-text)",
                fontSize: 11,
                fontFamily: "var(--font-geist-mono)",
              }}
            />
            <Tooltip content={<Tip />} cursor={{ fill: "var(--surface-2)", opacity: 0.6 }} />
            {data.series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="m"
                fill={color(s.key, i)}
                stroke="var(--surface)"
                strokeWidth={2}
                maxBarSize={24}
                radius={i === data.series.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
                className="cursor-pointer"
                onClick={(entry: { payload?: { key?: string } }) =>
                  entry.payload?.key && go(s.key, entry.payload.key)
                }
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
