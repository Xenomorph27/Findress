import type { LucideIcon } from "lucide-react";
import { Telescope } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Calm, centred empty state — used for "no results", "no data yet", "database not connected". */
export function EmptyState({
  icon: Icon = Telescope,
  title,
  children,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-hairline-strong flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center",
        className,
      )}
    >
      <div className="border-hairline bg-surface grid size-11 place-items-center rounded-full border">
        <Icon className="text-muted-foreground size-5" aria-hidden />
      </div>
      <h2 className="font-display text-2xl">{title}</h2>
      {children && <div className="text-muted-foreground max-w-md text-sm">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
  actions,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 pt-10 pb-6 md:flex-row md:items-end md:justify-between md:pt-14",
        className,
      )}
    >
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="text-muted-foreground mb-2 font-mono text-[11px] tracking-[0.18em] uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-4xl leading-[1.05] md:text-5xl">{title}</h1>
        {children && <div className="text-muted-foreground mt-3">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-[1280px] px-4 md:px-8", className)}>{children}</div>
  );
}
