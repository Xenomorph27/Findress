"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { InsightsPayload } from "@/lib/data/insights";
import { SUBFIELDS } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
import { AcceptanceTrends } from "./acceptance-trends";
import { BarList } from "./bar-list";
import { ChartCard } from "./chart-card";
import { DeadlineHeatmap } from "./deadline-heatmap";
import { JournalInsightsPanel } from "./journal-insights";
import { MonthStackChart } from "./month-stack-chart";

// The map ships the world outline; load it after the first paint.
const VenueMap = dynamic(() => import("./venue-map").then((m) => m.VenueMap), {
  ssr: false,
  loading: () => (
    <div className="border-hairline bg-surface/50 h-[420px] animate-pulse rounded-2xl border" />
  ),
});

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-hairline bg-surface/50 rounded-xl border px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-mono text-xl">{value.toLocaleString()}</p>
    </div>
  );
}

export function InsightsDashboard({
  payload,
  initialSubfield,
}: {
  payload: InsightsPayload;
  initialSubfield: string | null;
}) {
  const [subfield, setSubfield] = useState<string | null>(
    initialSubfield && payload.slices[initialSubfield] ? initialSubfield : null,
  );
  const slice = payload.slices[subfield ?? "all"];

  useEffect(() => {
    const url = new URL(window.location.href);
    if (subfield) url.searchParams.set("subfield", subfield);
    else url.searchParams.delete("subfield");
    window.history.replaceState(window.history.state, "", url);
  }, [subfield]);

  const sf = subfield ? `&subfield=${subfield}` : "";

  return (
    <div className="space-y-6">
      <div
        role="group"
        aria-label="Filter every chart by subfield"
        className="flex flex-wrap gap-1.5"
      >
        {[
          { id: null, label: "All subfields" },
          ...SUBFIELDS.map((s) => ({ id: s.id as string | null, label: s.label })),
        ].map((s) => (
          <button
            key={s.id ?? "all"}
            type="button"
            aria-pressed={subfield === s.id}
            onClick={() => setSubfield(s.id)}
            className={cn(
              "h-8 rounded-full border px-3 text-xs transition-colors",
              subfield === s.id
                ? "border-screen/60 tint-selected text-foreground"
                : "border-hairline text-muted-foreground hover:border-hairline-strong hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Venues tracked" value={slice.totals.events} />
        <Stat label="With open deadlines" value={slice.totals.upcoming} />
        <Stat label="Deadlines next 30 days" value={slice.totals.next30} />
        <Stat label="Workshops" value={slice.totals.workshops} />
        <Stat label="Open special issues" value={slice.totals.specialOpen} />
        <Stat label="Countries" value={slice.totals.countries} />
      </div>

      <DeadlineHeatmap data={slice.heatmap} subfield={subfield} />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <MonthStackChart data={slice.perMonth} subfield={subfield} />
        </div>
        <ChartCard
          className="lg:col-span-4"
          title="Rank mix"
          description="CORE and CCF ranks. Click to filter."
        >
          <BarList
            items={slice.ranks.map((r) => ({
              key: r.key,
              label: r.label,
              value: r.count,
              mono: true,
              href: `/explore?rank=${encodeURIComponent(r.key)}&passed=1${sf}`,
            }))}
          />
        </ChartCard>
      </div>

      <VenueMap places={slice.places} subfield={subfield} />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <AcceptanceTrends series={slice.acceptance} />
        </div>
        <ChartCard
          className="lg:col-span-5"
          title="Topics in open calls"
          description="Most frequent topics among upcoming venues."
        >
          {slice.topics.length ? (
            <BarList
              items={slice.topics.map((t) => ({
                key: t.topic,
                label: t.topic,
                value: t.count,
                href: `/explore?q=${encodeURIComponent(t.topic)}${sf}`,
              }))}
            />
          ) : (
            <p className="text-muted-foreground text-sm">No topic tags yet.</p>
          )}
        </ChartCard>
      </div>
      {payload.journals[subfield ?? "all"] && (
        <JournalInsightsPanel data={payload.journals[subfield ?? "all"]} subfield={subfield} />
      )}

      <p className="text-muted-foreground text-xs">
        Computed {new Date(payload.generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC
        from the current archive. Community-listed WikiCFP calls are excluded.
      </p>
    </div>
  );
}
