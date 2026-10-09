"use client";

import { ExternalLink } from "lucide-react";
import { BookmarkStar } from "@/components/event/bookmark-star";
import { CfpText } from "@/components/event/cfp-text";
import { CollapsibleText } from "@/components/event/collapsible-text";
import { CountdownChip } from "@/components/event/countdown-chip";
import { useTimezone } from "@/components/timezone/timezone-provider";
import type { JournalSpecialIssue } from "@/lib/data/types";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useNow } from "@/lib/hooks/use-now";
import { formatInZone, zoneShortLabel } from "@/lib/time/format";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<string, string> = {
  springer: "Springer journal page",
  wikicfp: "WikiCFP",
};

/** Special-issue calls of one journal: open first, each anchored at #si-<id>. */
export function SpecialIssueList({
  calls,
  journalAbbr,
}: {
  calls: JournalSpecialIssue[];
  journalAbbr: string;
}) {
  const { tz } = useTimezone();
  const mounted = useMounted();
  const now = useNow(60_000);
  const zone = mounted ? tz : "UTC";
  const at = (c: JournalSpecialIssue) =>
    c.submissionDeadlineUtc ? Date.parse(c.submissionDeadlineUtc) : null;
  const isOpen = (c: JournalSpecialIssue) => {
    const t = at(c);
    return t == null || now == null || t >= now;
  };
  const sorted = [...calls].sort((a, b) => {
    const oa = isOpen(a) ? 0 : 1;
    const ob = isOpen(b) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    return oa === 0 ? (at(a) ?? Infinity) - (at(b) ?? Infinity) : (at(b) ?? 0) - (at(a) ?? 0);
  });

  return (
    <ol className="space-y-3">
      {sorted.map((c) => {
        const t = at(c);
        const open = isOpen(c);
        return (
          <li
            key={c.id}
            id={`si-${c.id}`}
            className={cn(
              "border-hairline target:border-aurora-2/60 scroll-mt-24 rounded-xl border p-4",
              !open && "opacity-75",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-balance">{c.title}</p>
                <p className="text-muted-foreground mt-1 font-mono text-xs">
                  {t != null ? (
                    <>
                      Due {formatInZone(t, zone, "EEE MMM d, yyyy · HH:mm")} {zoneShortLabel(zone)}
                      <span className="opacity-80">
                        {" "}
                        · stated as “{c.deadlineText}”, no time zone → end of day AoE
                      </span>
                    </>
                  ) : (
                    "Submission deadline not stated in the call"
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <CountdownChip dueAt={t} />
                <BookmarkStar
                  eventId={c.id}
                  kind="special"
                  label={`${journalAbbr} special issue: ${c.title}`}
                />
              </div>
            </div>
            {c.guestEditors.length > 0 && (
              <p className="text-muted-foreground mt-3 text-sm">
                <span className="text-foreground/80">Guest editors:</span>{" "}
                {c.guestEditors.join("; ")}
              </p>
            )}
            {c.descriptionText && c.source === "wikicfp" && (
              <div className="mt-3">
                <CollapsibleText collapsedHeight={140}>
                  <CfpText text={c.descriptionText} />
                </CollapsibleText>
              </div>
            )}
            <p className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span>Source: {SOURCE_LABEL[c.source] ?? c.source}</span>
              <span>Last seen {c.lastSeenAt.slice(0, 10)}</span>
              {c.url && (
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-aurora-ink inline-flex items-center gap-1 hover:underline"
                >
                  Read the call <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
