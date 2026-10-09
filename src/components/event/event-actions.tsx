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
import type { TargetKind } from "@/lib/workspace/targets";

/** Bookmark + status, calendar export, share and official link — for events and journals. */
export function EventActions({
  eventId,
  kind = "event",
  slug,
  title,
  website,
  icsHref = `/api/events/${slug}/ics`,
  icsLabel = "Add all dates",
  websiteLabel = "Official site",
}: {
  eventId: number;
  kind?: TargetKind;
  slug: string;
  title: string;
  website: string | null;
  /** Null hides the calendar button (e.g. a journal with no dated calls). */
  icsHref?: string | null;
  icsLabel?: string;
  websiteLabel?: string;
}) {
  const { isOwner, statusOf, setStatus } = useBookmarks();
  const [shared, setShared] = useState(false);
  const status = statusOf(eventId, kind);

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
      <BookmarkStar
        eventId={eventId}
        kind={kind}
        label={title}
        size="md"
        className="border-hairline border"
      />
      {isOwner && (
        <Select
          value={status ?? "none"}
          onValueChange={(v) =>
            void setStatus(eventId, v === "none" ? null : (v as BookmarkStatus), kind)
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
      {icsHref && (
        <Button asChild variant="outline" className="h-9">
          <a href={icsHref}>
            <CalendarPlus /> {icsLabel}
          </a>
        </Button>
      )}
      <Button variant="outline" className="h-9" onClick={share} aria-live="polite">
        {shared ? <Check /> : <Share2 />} {shared ? "Link copied" : "Share"}
      </Button>
      {website && (
        <Button asChild className="h-9">
          <a href={website} target="_blank" rel="noreferrer">
            {websiteLabel} <ExternalLink />
          </a>
        </Button>
      )}
    </div>
  );
}
