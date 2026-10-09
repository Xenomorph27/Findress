"use client";

import { CalendarPlus, Check, Copy, Lock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetOwner } from "@/lib/hooks/use-owner";

export function CalendarFeed({ feedUrl }: { feedUrl: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        Every deadline of your bookmarked venues, as one calendar. Subscribe in Google Calendar,
        Apple Calendar or Outlook — it stays in sync. Alarms fire three days before each submission
        deadline.
      </p>
      {feedUrl && (
        <div className="flex gap-2">
          <Input
            readOnly
            value={feedUrl}
            aria-label="Private calendar feed URL"
            className="text-xs"
            onFocus={(e) => e.target.select()}
          />
          <Button
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(feedUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
          >
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        Keep this link private — anyone with it can read your deadline list.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button asChild variant="outline">
          <a href="/api/workspace/ics">
            <CalendarPlus /> Download .ics
          </a>
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            await fetch("/api/auth/session", { method: "DELETE" });
            resetOwner();
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so the client router drops cached auth redirects
            window.location.assign("/");
          }}
        >
          <Lock /> Lock workspace
        </Button>
      </div>
    </div>
  );
}
