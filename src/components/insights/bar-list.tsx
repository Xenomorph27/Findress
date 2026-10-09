"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Horizontal bar list — one series, value at the bar tip, every row a link (keyboard
 * accessible by construction). Bars are capped thin with a rounded data end.
 */
export function BarList({
  items,
  className,
}: {
  items: { key: string; label: string; value: number; href: string; mono?: boolean }[];
  className?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className={cn("space-y-1.5", className)}>
      {items.map((i) => (
        <li key={i.key}>
          <Link
            href={i.href}
            className="group hover:bg-surface-2/60 grid grid-cols-[minmax(84px,30%)_1fr] items-center gap-3 rounded-md px-1 py-1"
          >
            <span
              className={cn(
                "text-muted-foreground group-hover:text-foreground truncate text-sm",
                i.mono && "text-foreground/90 font-medium",
              )}
            >
              {i.label}
            </span>
            <span className="flex items-center gap-2">
              <span
                className="bg-aurora-2 h-3 rounded-r-[4px] transition-opacity group-hover:opacity-90"
                style={{
                  width: `${Math.max(i.value > 0 ? 2 : 0, (i.value / max) * 100)}%`,
                  opacity: 0.8,
                }}
                aria-hidden
              />
              <span className="text-foreground tabular font-mono text-xs">{i.value}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
