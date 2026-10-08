"use client";

import { geoNaturalEarth1, geoPath } from "d3-geo";
import type { FeatureCollection } from "geojson";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";
import type { InsightsSlice } from "@/lib/insights/compute";
import { ChartCard, SimpleTable } from "./chart-card";

const W = 960;
const H = 470;

/** World map of upcoming venues, dots sized by count (√ scale). Click a dot → /explore?country=. */
export function VenueMap({
  places,
  subfield,
}: {
  places: InsightsSlice["places"];
  subfield: string | null;
}) {
  const router = useRouter();
  const [hover, setHover] = useState<InsightsSlice["places"][number] | null>(null);

  const { landPath, project } = useMemo(() => {
    const topo = land110 as unknown as Topology<{ land: GeometryCollection }>;
    const land = feature(topo, topo.objects.land) as unknown as FeatureCollection;
    const projection = geoNaturalEarth1().fitExtent(
      [
        [4, 4],
        [W - 4, H - 4],
      ],
      { type: "Sphere" },
    );
    const path = geoPath(projection);
    return {
      landPath: path(land) ?? "",
      project: (lng: number, lat: number) => projection([lng, lat]),
    };
  }, []);

  const max = Math.max(1, ...places.map((p) => p.count));
  const radius = (c: number) => 3 + Math.sqrt(c / max) * 13;
  const sorted = [...places].sort((a, b) => b.count - a.count);

  const go = (p: InsightsSlice["places"][number]) => {
    if (!p.countryCode) return;
    const q = new URLSearchParams({ country: p.countryCode });
    if (subfield) q.set("subfield", subfield);
    router.push(`/explore?${q}`);
  };

  return (
    <ChartCard
      title="Where the venues are"
      description="Upcoming and ongoing events by city; larger dots host more venues. Click a dot to explore that country."
      table={
        <SimpleTable
          head={["Place", "Venues"]}
          rows={sorted.slice(0, 40).map((p) => [p.label, p.count])}
        />
      }
    >
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label="World map of venue locations; details in the table view"
        >
          <path
            d={landPath}
            fill="var(--surface-2)"
            stroke="var(--hairline-strong)"
            strokeWidth={0.5}
          />
          {[...places]
            .sort((a, b) => b.count - a.count)
            .map((p) => {
              const xy = project(p.lng, p.lat);
              if (!xy) return null;
              const active = hover?.key === p.key;
              return (
                <circle
                  key={p.key}
                  cx={xy[0]}
                  cy={xy[1]}
                  r={radius(p.count) + (active ? 2 : 0)}
                  fill="var(--aurora-2)"
                  fillOpacity={active ? 0.95 : 0.7}
                  stroke="var(--surface)"
                  strokeWidth={2}
                  className="cursor-pointer transition-[r]"
                  onMouseEnter={() => setHover(p)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => go(p)}
                />
              );
            })}
        </svg>
        {hover && (
          <div className="border-hairline bg-popover pointer-events-none absolute top-3 left-3 rounded-lg border px-3 py-2 text-xs shadow-lg">
            <p className="text-foreground">{hover.label}</p>
            <p className="text-muted-foreground font-mono">
              {hover.count} venue{hover.count === 1 ? "" : "s"}
            </p>
          </div>
        )}
      </div>
    </ChartCard>
  );
}
