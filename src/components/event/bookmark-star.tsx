"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useBookmarks } from "@/lib/hooks/use-bookmarks";
import { cn } from "@/lib/utils";

export function BookmarkStar({
  eventId,
  label,
  className,
  size = "sm",
}: {
  eventId: number;
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const { isOwner, isBookmarked, toggle, loaded } = useBookmarks();
  const router = useRouter();
  const on = isBookmarked(eventId);

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
        void toggle(eventId);
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
