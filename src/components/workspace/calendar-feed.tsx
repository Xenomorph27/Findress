"use client";

import { CalendarPlus, Check, Copy, LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLogout } from "@/lib/hooks/use-logout";
import { resetOwner } from "@/lib/hooks/use-owner";

export function CalendarFeed({ feedUrl }: { feedUrl: string | null }) {
  const [copied, setCopied] = useState(false);
  const { logout, pending } = useLogout();
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
          disabled={pending}
          onClick={() => {
            resetOwner();
            void logout();
          }}
        >
          <LogOut /> Log out
        </Button>
      </div>
    </div>
  );
}
