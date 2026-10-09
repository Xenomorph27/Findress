import { Laptop, MapPin, Users } from "lucide-react";
import { EVENT_TYPE_LABEL, MODE_LABEL, type EventType, type Mode } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

const chipBase =
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-md border px-1.5 text-xs leading-none whitespace-nowrap";

/**
 * A ranking as quiet text, not a chip: "CORE A*". The top tier (CORE A*, CCF A) wears the
 * accent ink; everything else stays muted.
 */
export function RankChip({
  system,
  rank,
  className,
}: {
  system: "CORE" | "CCF";
  rank: string | null | undefined;
  className?: string;
}) {
  if (!rank) return null;
  const top = rank === "A*" || (system === "CCF" && rank === "A");
  return (
    <span
      className={cn("text-muted-foreground text-xs whitespace-nowrap", className)}
      title={`${system} rank ${rank}`}
    >
      {system}{" "}
      <span className={cn("font-medium", top ? "text-aurora-ink" : "text-foreground/80")}>
        {rank}
      </span>
    </span>
  );
}

/** Both rankings on one line ("CORE A* · CCF A"); renders nothing when neither is known. */
export function Ranks({
  core,
  ccf,
  className,
}: {
  core: string | null | undefined;
  ccf: string | null | undefined;
  className?: string;
}) {
  if (!core && !ccf) return null;
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <RankChip system="CORE" rank={core} />
      {core && ccf && (
        <span className="text-muted-foreground text-xs" aria-hidden>
          ·
        </span>
      )}
      <RankChip system="CCF" rank={ccf} />
    </span>
  );
}

const EXTRA_TYPE_LABEL: Record<string, string> = {
  journal: "Journal",
  "special-issue": "Special issue",
};

export function TypeBadge({ type, className }: { type: string; className?: string }) {
  const label = EXTRA_TYPE_LABEL[type] ?? EVENT_TYPE_LABEL[type as EventType] ?? type;
  const isWorkshop = type === "workshop" || type === "special-issue";
  return (
    <span
      className={cn(
        chipBase,
        "text-xs",
        isWorkshop
          ? "border-aurora-3/35 text-aurora-3"
          : "border-hairline-strong text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function TopicChip({
  children,
  active,
  className,
}: {
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        chipBase,
        "rounded-full px-2",
        active
          ? "border-aurora-2/50 bg-aurora-2/10 text-foreground"
          : "border-hairline bg-surface-2/60 text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Chip budget for any row or card (docs/DESIGN.md → Clutter). */
export const MAX_CHIPS = 3;

/**
 * At most `max` topic chips, then a quiet "+N" carrying the rest in its tooltip. Pass a smaller
 * `max` when the row already shows other chips (type badge), so the row stays within budget.
 */
export function ChipList({
  items,
  max = MAX_CHIPS,
  active,
  className,
}: {
  items: string[];
  max?: number;
  active?: boolean;
  className?: string;
}) {
  if (items.length === 0 || max <= 0) return null;
  const shown = items.slice(0, max);
  const rest = items.slice(max);
  return (
    <span className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}>
      {shown.map((t) => (
        <TopicChip key={t} active={active} className="max-w-full truncate">
          {t}
        </TopicChip>
      ))}
      {rest.length > 0 && (
        <span className="text-muted-foreground text-xs" title={rest.join(", ")}>
          +{rest.length}
        </span>
      )}
    </span>
  );
}

/** Long topic lists as calm text ("a · b · c +12 more") instead of a wall of chips. */
export function TopicLine({
  items,
  max = 12,
  className,
}: {
  items: string[];
  max?: number;
  className?: string;
}) {
  if (items.length === 0) return null;
  const rest = items.length - max;
  return (
    <p className={cn("text-muted-foreground text-sm", className)}>
      {items.slice(0, max).join(" · ")}
      {rest > 0 && <span title={items.slice(max).join(", ")}> +{rest} more</span>}
    </p>
  );
}

export function ModeChip({
  mode,
  className,
}: {
  mode: string | null | undefined;
  className?: string;
}) {
  if (!mode) return null;
  const Icon = mode === "virtual" ? Laptop : Users;
  return (
    <span className={cn("text-muted-foreground inline-flex items-center gap-1 text-xs", className)}>
      <Icon className="size-3.5" aria-hidden />
      {MODE_LABEL[mode as Mode] ?? mode}
    </span>
  );
}

export function LocationLabel({
  city,
  country,
  countryCode,
  className,
}: {
  city: string | null | undefined;
  country: string | null | undefined;
  countryCode: string | null | undefined;
  className?: string;
}) {
  // City-states ("Singapore, Singapore", "Macau, Macau") read once.
  const place = [city, country && country !== city ? country : null].filter(Boolean).join(", ");
  if (!place) {
    return (
      <span className={cn("text-muted-foreground inline-flex items-center gap-1", className)}>
        <MapPin className="size-3.5" aria-hidden />
        Not announced
      </span>
    );
  }
  // A mono ISO code tag instead of flag emoji: Windows has no flag glyphs, so this reads
  // identically on every platform.
  const code = countryCode && /^[A-Za-z]{2}$/.test(countryCode) ? countryCode.toUpperCase() : null;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {code ? (
        <span
          aria-hidden
          className="border-hairline-strong text-muted-foreground rounded-[3px] border px-[3px] text-xs leading-[14px] font-medium"
        >
          {code}
        </span>
      ) : (
        <MapPin className="text-muted-foreground size-3.5" aria-hidden />
      )}
      <span className="truncate">{place}</span>
    </span>
  );
}
