import { Laptop, MapPin, Users } from "lucide-react";
import { EVENT_TYPE_LABEL, MODE_LABEL, type EventType, type Mode } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

const chipBase =
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[11px] leading-none whitespace-nowrap";

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
      className={cn(
        chipBase,
        "font-mono",
        top
          ? "border-aurora-1/40 bg-aurora-1/10 text-aurora-ink"
          : "border-hairline-strong text-foreground/80",
        className,
      )}
      title={`${system} rank ${rank}`}
    >
      <span className="text-muted-foreground">{system}</span>
      {rank}
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
        "text-[10px] tracking-[0.06em] uppercase",
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
    <span className={cn(chipBase, "border-hairline text-muted-foreground", className)}>
      <Icon className="size-3" aria-hidden />
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
          className="border-hairline-strong text-muted-foreground rounded-[3px] border px-[3px] font-mono text-[9px] leading-[14px] tracking-wide"
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
