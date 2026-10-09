"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CountdownChip } from "@/components/event/countdown-chip";
import { useTimezone } from "@/components/timezone/timezone-provider";
import type { JournalInsights } from "@/lib/insights/journals";
import { useMounted } from "@/lib/hooks/use-mounted";
import { formatInZone, zoneShortLabel } from "@/lib/time/format";
import { BarList } from "./bar-list";
import { ChartCard, LegendItem, SERIES_VARS, SimpleTable } from "./chart-card";

const tick = { fill: "var(--muted-text)", fontSize: 11, fontFamily: "var(--font-geist-mono)" };
type Dot = JournalInsights["scatter"][number];
// Categorical slots in fixed order: full OA = series 1, hybrid = series 2.
const OA_SERIES = [
  { key: "full" as const, label: "Full open access", color: SERIES_VARS[0] },
  { key: "hybrid" as const, label: "Hybrid (optional paid OA)", color: SERIES_VARS[1] },
];

function DotTooltip({ active, payload }: { active?: boolean; payload?: { payload: Dot }[] }) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <div className="border-hairline bg-popover rounded-lg border px-3 py-2 text-xs shadow-lg">
      <p className="font-medium">{d.abbreviation}</p>
      <p className="text-muted-foreground mt-1">
        APC <span className="text-foreground font-mono">${d.apc.toLocaleString()}</span> · h-index{" "}
        <span className="text-foreground font-mono">{d.hIndex}</span>
      </p>
      <p className="text-muted-foreground">
        {d.oa === "full" ? "Full open access" : "Hybrid"} · click to open
      </p>
    </div>
  );
}

function ApcScatter({ data }: { data: Dot[] }) {
  const router = useRouter();
  if (data.length === 0)
    return <p className="text-muted-foreground text-sm">No journals with a known fee here.</p>;
  return (
    <>
      <div className="mb-2 flex flex-wrap gap-4">
        {OA_SERIES.map((s) => (
          <LegendItem key={s.key} color={s.color} label={s.label} />
        ))}
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: -4 }}>
            <CartesianGrid stroke="var(--hairline)" />
            <XAxis
              type="number"
              dataKey="apc"
              name="APC"
              tick={tick}
              tickLine={false}
              axisLine={{ stroke: "var(--hairline-strong)" }}
              tickFormatter={(v: number) => (v === 0 ? "$0" : `$${(v / 1000).toFixed(1)}k`)}
            />
            <YAxis
              type="number"
              dataKey="hIndex"
              name="h-index"
              tick={tick}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip content={<DotTooltip />} cursor={{ stroke: "var(--hairline-strong)" }} />
            {OA_SERIES.map((s) => (
              <Scatter
                key={s.key}
                name={s.label}
                data={data.filter((d) => d.oa === s.key)}
                fill={s.color}
                stroke="var(--surface)"
                strokeWidth={2}
                isAnimationActive={false}
                className="cursor-pointer"
                onClick={(p: { payload?: Dot }) => p.payload && router.push(`/j/${p.payload.slug}`)}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        x: article processing charge (USD, OpenAlex or the journal site) · y: h-index (OpenAlex).
        Subscription-only journals charge no APC and are left out.
      </p>
    </>
  );
}

export function JournalInsightsPanel({
  data,
  subfield,
}: {
  data: JournalInsights;
  subfield: string | null;
}) {
  const { tz } = useTimezone();
  const mounted = useMounted();
  const zone = mounted ? tz : "UTC";
  const sf = subfield ? `&subfield=${subfield}` : "";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 pt-4">
        <h2 className="font-display text-3xl">Journals</h2>
        <p className="text-muted-foreground text-sm">
          <span className="text-foreground font-mono">{data.totals.journals}</span> journals ·{" "}
          <span className="text-foreground font-mono">{data.totals.fullOa}</span> fully open ·{" "}
          median APC{" "}
          <span className="text-foreground font-mono">
            {data.totals.medianApc != null ? `$${data.totals.medianApc.toLocaleString()}` : "—"}
          </span>{" "}
          ·{" "}
          <Link href={`/explore?tab=journals${sf}`} className="text-aurora-ink hover:underline">
            explore journals
          </Link>
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-12">
        <ChartCard
          className="lg:col-span-7"
          title="Open access vs publication fee"
          description="Where the fee buys reach: each dot is a journal; click to open it."
          table={
            <SimpleTable
              head={["Journal", "Model", "APC (USD)", "h-index"]}
              rows={[...data.scatter]
                .sort((a, b) => a.apc - b.apc)
                .map((d) => [
                  d.abbreviation,
                  d.oa === "full" ? "Full OA" : "Hybrid",
                  d.apc,
                  d.hIndex,
                ])}
            />
          }
        >
          <ApcScatter data={data.scatter} />
        </ChartCard>
        <ChartCard
          className="lg:col-span-5"
          title="Top journals by h-index"
          description="OpenAlex h-index. Click to open the journal."
        >
          {data.topByH.length ? (
            <BarList
              items={data.topByH.map((j) => ({
                key: j.slug,
                label: j.abbreviation,
                value: j.hIndex,
                mono: true,
                href: `/j/${j.slug}`,
              }))}
            />
          ) : (
            <p className="text-muted-foreground text-sm">No journals in this subfield.</p>
          )}
        </ChartCard>
      </div>
      <ChartCard
        title="Upcoming special-issue deadlines"
        description="Open calls from journal pages and WikiCFP, soonest first."
        actions={
          <Link
            href={`/explore?tab=special${sf}`}
            className="text-aurora-ink text-xs hover:underline"
          >
            All special issues →
          </Link>
        }
      >
        {data.upcomingCalls.length ? (
          <ul className="divide-hairline divide-y">
            {data.upcomingCalls.map((c) => (
              <li key={c.id}>
                <a
                  href={c.href}
                  {...(c.external ? { target: "_blank", rel: "noreferrer" } : {})}
                  className="hover:bg-surface-2/50 flex flex-wrap items-center justify-between gap-3 rounded-md px-1 py-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-display text-lg">{c.journal}</span>
                    <span className="text-muted-foreground ml-2 text-sm">{c.title}</span>
                    <span className="text-muted-foreground block font-mono text-xs">
                      {formatInZone(c.at, zone, "EEE MMM d, yyyy")} {zoneShortLabel(zone)}
                    </span>
                  </span>
                  <CountdownChip dueAt={c.at} />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            No open special-issue calls{subfield ? " in this subfield" : ""} right now.
          </p>
        )}
      </ChartCard>
    </div>
  );
}
