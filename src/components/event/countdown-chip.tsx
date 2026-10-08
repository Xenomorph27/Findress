"use client";

import { useNow } from "@/lib/hooks/use-now";
import {
  describeCountdown,
  formatCountdown,
  HEAT_COLOR_VAR,
  heatFor,
  isLive,
  type Heat,
} from "@/lib/time/heat";
import { cn } from "@/lib/utils";

interface CountdownChipProps {
  /** ISO string or epoch ms of the deadline (UTC). Null renders "Not announced". */
  dueAt: string | number | Date | null | undefined;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

function chipStyle(heat: Heat | null): React.CSSProperties {
  const color = heat ? HEAT_COLOR_VAR[heat] : "var(--muted-text)";
  return {
    color,
    backgroundColor: `color-mix(in oklab, ${color} 11%, transparent)`,
    borderColor: `color-mix(in oklab, ${color} 32%, transparent)`,
  };
}

/**
 * Live countdown chip. Colour follows the heat scale; digits tick every second inside 72h.
 * Renders a neutral placeholder on the server so hydration never mismatches.
 */
export function CountdownChip({ dueAt, label, size = "sm", className }: CountdownChipProps) {
  const dueMs = dueAt == null ? null : new Date(dueAt).getTime();
  const coarse = useNow(60_000);
  const live = dueMs != null && coarse != null && isLive(dueMs, coarse);
  const fine = useNow(live ? 1000 : 60_000);
  const now = live ? fine : coarse;

  const base = cn(
    "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-mono tabular whitespace-nowrap",
    size === "sm" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-xs",
    className,
  );

  if (dueMs == null || Number.isNaN(dueMs)) {
    return <span className={cn(base, "border-hairline text-muted-foreground")}>Not announced</span>;
  }

  if (now == null) {
    return (
      <span className={cn(base, "border-hairline text-muted-foreground")} aria-hidden>
        <span className="size-1.5 rounded-full bg-current opacity-50" />
        <span className="opacity-0">00d</span>
      </span>
    );
  }

  const heat = heatFor(dueMs, now);
  const text = formatCountdown(dueMs, now);
  return (
    <span
      className={base}
      style={chipStyle(heat)}
      data-heat={heat}
      title={describeCountdown(dueMs, now)}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full bg-current",
          heat === "hot" && "shadow-[0_0_8px_currentColor]",
        )}
      />
      {label && <span className="font-sans text-[0.95em] opacity-80">{label}</span>}
      <span>{text}</span>
      <span className="sr-only">{describeCountdown(dueMs, now)}</span>
    </span>
  );
}
