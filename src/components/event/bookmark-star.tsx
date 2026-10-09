"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useBookmarks } from "@/lib/hooks/use-bookmarks";
import { cn } from "@/lib/utils";
import type { TargetKind } from "@/lib/workspace/targets";

/** Star for an event (default), a journal or a special issue. */
export function BookmarkStar({
  eventId,
  kind = "event",
  label,
  className,
  size = "sm",
}: {
  /** Id of the target (an event id unless `kind` says otherwise). */
  eventId: number;
  kind?: TargetKind;
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const { isOwner, isBookmarked, toggle, loaded } = useBookmarks();
  const router = useRouter();
  const on = isBookmarked(eventId, kind);

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${label} from bookmarks` : `Bookmark ${label}`}
      title={isOwner || !loaded ? undefined : "Unlock your workspace to bookmark"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isOwner) {
          router.push(
            `/unlock?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
          );
          return;
        }
        void toggle(eventId, kind);
      }}
      className={cn(
        "text-muted-foreground hover:text-foreground grid shrink-0 place-items-center rounded-md transition-colors",
        size === "sm" ? "size-8" : "size-9",
        on && "text-heat-warm hover:text-heat-warm",
        className,
      )}
    >
      <Star
        className={cn(size === "sm" ? "size-4" : "size-[18px]", on && "fill-current")}
        aria-hidden
      />
    </button>
  );
}
