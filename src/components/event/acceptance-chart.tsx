"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AcceptancePoint } from "@/lib/data/types";

const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

function TooltipBody({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: AcceptancePoint }[];
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="border-hairline bg-popover lift rounded-lg border px-3 py-2 text-xs">
      <p className="text-foreground font-mono">{p.year}</p>
      <p className="mt-1">
        <span className="text-muted-foreground">Acceptance </span>
        <span className="font-mono">{p.rate != null ? pct(p.rate) : "—"}</span>
      </p>
      {p.submitted != null && (
        <p className="text-muted-foreground">
          <span className="text-foreground font-mono">{p.accepted?.toLocaleString() ?? "—"}</span>{" "}
          of <span className="text-foreground font-mono">{p.submitted.toLocaleString()}</span>{" "}
          submissions
        </p>
      )}
    </div>
  );
}

/** One series (acceptance rate) — submitted/accepted counts live in the tooltip and the table. */
export function AcceptanceChart({ data }: { data: AcceptancePoint[] }) {
  const points = data.filter((d) => d.rate != null);
  if (points.length === 0) return null;
  return (
    <figure>
      <figcaption className="text-muted-foreground mb-2 text-sm">
        Acceptance rate by year
      </figcaption>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 12, right: 16, bottom: 0, left: -8 }}>
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
              domain={[0, (max: number) => Math.min(1, Math.ceil((max + 0.05) * 10) / 10)]}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              tickLine={false}
              axisLine={false}
              tick={{
                fill: "var(--muted-text)",
                fontSize: 12,
                fontFamily: "var(--font-geist-mono)",
              }}
              width={44}
            />
            <Tooltip content={<TooltipBody />} cursor={{ stroke: "var(--hairline-strong)" }} />
            <Line
              type="monotone"
              dataKey="rate"
              stroke="var(--aurora-2)"
              strokeWidth={2}
              dot={{ r: 4, fill: "var(--aurora-2)", stroke: "var(--surface)", strokeWidth: 2 }}
              activeDot={{
                r: 6,
                fill: "var(--aurora-2)",
                stroke: "var(--surface)",
                strokeWidth: 2,
              }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
