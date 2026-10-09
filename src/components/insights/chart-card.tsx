import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Frame for one chart: title, one-line description, the chart, and a table view (a11y relief). */
export function ChartCard({
  title,
  description,
  children,
  table,
  className,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  table?: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "border-hairline bg-surface/50 min-w-0 rounded-2xl border p-5 md:p-6",
        className,
      )}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-medium">{title}</h2>
          {description && <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
      {table && (
        <details className="text-muted-foreground mt-3 text-xs">
          <summary className="hover:text-foreground cursor-pointer select-none">Table view</summary>
          <div className="mt-2 max-h-64 overflow-auto">{table}</div>
        </details>
      )}
    </section>
  );
}

export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
      <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
}

export function SimpleTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="tint-header hairline-screen text-left">
          {head.map((h, i) => (
            <th key={h} className={cn("px-1 py-1 font-normal", i > 0 && "text-right")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-hairline border-t">
            {r.map((c, j) => (
              <td
                key={j}
                className={cn(
                  "px-1 py-1",
                  j > 0 && "text-right",
                  // Mono for numbers and dates only; labels stay in Sans.
                  (typeof c === "number" || /^d/.test(String(c))) && "font-mono",
                )}
              >
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const SERIES_VARS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];
export const OTHER_VAR = "var(--series-other)";
