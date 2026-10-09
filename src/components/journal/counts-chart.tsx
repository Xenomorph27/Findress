"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { year: number; works: number; citations: number };

const tick = { fill: "var(--muted-text)", fontSize: 12, fontFamily: "var(--font-geist-mono)" };
const compact = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k` : String(v);

function TooltipBody({
  active,
  payload,
  label,
  noun,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: number;
  noun: string;
}) {
  if (!active || !payload?.[0]) return null;
  return (
    <div className="border-hairline bg-popover rounded-lg border px-3 py-2 text-xs shadow-lg">
      <p className="font-mono">{label}</p>
      <p className="mt-1">
        <span className="font-mono">{payload[0].value.toLocaleString()}</span>{" "}
        <span className="text-muted-foreground">{noun}</span>
      </p>
    </div>
  );
}

/** One measure per chart (works and citations differ by orders of magnitude: no dual axis). */
function Mini({
  data,
  field,
  title,
  noun,
}: {
  data: Point[];
  field: "works" | "citations";
  title: string;
  noun: string;
}) {
  return (
    <figure className="min-w-0">
      <figcaption className="text-muted-foreground mb-2 text-sm">{title}</figcaption>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
            barCategoryGap={2}
          >
            <CartesianGrid vertical={false} stroke="var(--hairline)" />
            <XAxis
              dataKey="year"
              tickLine={false}
              axisLine={{ stroke: "var(--hairline-strong)" }}
              tick={tick}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={compact}
              tickLine={false}
              axisLine={false}
              tick={tick}
              width={44}
            />
            <Tooltip
              content={<TooltipBody noun={noun} />}
              cursor={{ fill: "color-mix(in oklab, var(--aurora-2) 8%, transparent)" }}
            />
            <Bar
              dataKey={field}
              fill="var(--series-1)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** OpenAlex counts_by_year as two small multiples plus a table view. */
export function JournalCountsChart({ data }: { data: Point[] }) {
  if (data.length === 0) return null;
  return (
    <div>
      <div className="grid gap-6 sm:grid-cols-2">
        <Mini data={data} field="works" title="Works published per year" noun="works" />
        <Mini data={data} field="citations" title="Citations received per year" noun="citations" />
      </div>
      <details className="text-muted-foreground mt-2 text-xs">
        <summary className="hover:text-foreground cursor-pointer">Table view</summary>
        <table className="mt-2 w-full font-mono">
          <thead>
            <tr className="text-left">
              <th className="py-1 font-normal">Year</th>
              <th className="py-1 text-right font-normal">Works</th>
              <th className="py-1 text-right font-normal">Citations</th>
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.year} className="border-hairline border-t">
                <td className="py-1">{d.year}</td>
                <td className="tabular py-1 text-right">{d.works.toLocaleString()}</td>
                <td className="tabular py-1 text-right">{d.citations.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2">
          Source: OpenAlex counts_by_year (recent years fill in as OpenAlex indexes new works).
        </p>
      </details>
    </div>
  );
}
