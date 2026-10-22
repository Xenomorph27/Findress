import { cn } from "@/lib/utils";

/**
 * Marks a value that an LLM read off the event's own CFP page (not a structured source).
 * The tooltip carries the evidence; the Sources section lists every quote.
 */
export function AiBadge({
  title = "AI-extracted from the event's own CFP page. The quote it is based on is in Sources.",
  className,
}: {
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      aria-label="AI-extracted from the official CFP page"
      className={cn(
        "border-hairline text-muted-foreground inline-flex items-center rounded border px-1 py-px align-middle font-mono text-[10px] leading-none uppercase",
        className,
      )}
    >
      AI
    </span>
  );
}
