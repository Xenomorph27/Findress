"use client";

import { CalendarPlus, Check, ExternalLink, Share2 } from "lucide-react";
import { useState } from "react";
import { BookmarkStar } from "@/components/event/bookmark-star";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bookmarkStatuses, STATUS_LABEL, type BookmarkStatus } from "@/lib/taxonomy";
import { useBookmarks } from "@/lib/hooks/use-bookmarks";

export function EventActions({
  eventId,
  slug,
  title,
  website,
}: {
  eventId: number;
  slug: string;
  title: string;
  website: string | null;
}) {
  const { isOwner, statusOf, setStatus } = useBookmarks();
  const [shared, setShared] = useState(false);
  const status = statusOf(eventId);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 1800);
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <BookmarkStar eventId={eventId} label={title} size="md" className="border-hairline border" />
      {isOwner && (
        <Select
          value={status ?? "none"}
          onValueChange={(v) =>
            void setStatus(eventId, v === "none" ? null : (v as BookmarkStatus))
          }
        >
          <SelectTrigger className="h-9 w-[150px]" aria-label="Tracking status">
            <SelectValue placeholder="Track…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not tracking</SelectItem>
            {bookmarkStatuses.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button asChild variant="outline" className="h-9">
        <a href={`/api/events/${slug}/ics`}>
          <CalendarPlus /> Add all dates
        </a>
      </Button>
      <Button variant="outline" className="h-9" onClick={share} aria-live="polite">
        {shared ? <Check /> : <Share2 />} {shared ? "Link copied" : "Share"}
      </Button>
      {website && (
        <Button asChild className="h-9">
          <a href={website} target="_blank" rel="noreferrer">
            Official site <ExternalLink />
          </a>
        </Button>
      )}
    </div>
  );
}
