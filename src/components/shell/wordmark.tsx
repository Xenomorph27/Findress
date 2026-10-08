import Link from "next/link";
import { cn } from "@/lib/utils";

/** Orbit mark: a hairline ring with one luminous body — "deadlines are orbits closing in". */
export function OrbitMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-5", className)}>
      <ellipse
        cx="12"
        cy="12"
        rx="10"
        ry="4.6"
        transform="rotate(-24 12 12)"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="1.2"
      />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" fillOpacity="0.9" />
      <circle cx="20.6" cy="8.4" r="1.6" fill="var(--aurora-1)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("group text-foreground inline-flex items-center gap-2 rounded-md", className)}
      aria-label="FIndress home"
    >
      <OrbitMark className="transition-transform duration-300 group-hover:rotate-12" />
      <span className="font-display text-[1.45rem] leading-none tracking-tight">FIndress</span>
    </Link>
  );
}
