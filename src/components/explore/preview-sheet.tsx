"use client";

import { ArrowUpRight, CalendarPlus, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BookmarkStar } from "@/components/event/bookmark-star";
import {
  ChipList,
  LocationLabel,
  ModeChip,
  Ranks,
  TopicLine,
  TypeBadge,
} from "@/components/event/chips";
import { DeadlineList } from "@/components/event/deadline-list";
import { TimezoneSelect } from "@/components/timezone/timezone-select";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { EventDetail, ExplorerRow } from "@/lib/data/types";
import { SUBFIELD_LABEL, type SubfieldId } from "@/lib/taxonomy";
import { formatDateRange } from "@/lib/time/format";

function useEventDetail(slug: string | null) {
  const [state, setState] = useState<{
    slug: string | null;
    data: EventDetail | null;
    error: boolean;
  }>({
    slug: null,
    data: null,
    error: false,
  });
  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    fetch(`/api/events/${slug}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: EventDetail) => setState({ slug, data, error: false }))
      .catch((err: Error) => {
        if (err.name !== "AbortError") setState({ slug, data: null, error: true });
      });
    return () => controller.abort();
  }, [slug]);
  return state.slug === slug ? state : { slug, data: null, error: false };
}

export function PreviewSheet({ row, onClose }: { row: ExplorerRow | null; onClose: () => void }) {
  const { data, error } = useEventDetail(row?.slug ?? null);
  const dates = row ? formatDateRange(row.startDate, row.endDate) : null;

  return (
    <Sheet open={row != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="glass border-hairline w-full gap-0 overflow-y-auto p-0 sm:max-w-[460px]"
      >
        {row && (
          <>
            <SheetHeader className="border-hairline gap-3 border-b p-6 pb-5">
              <div className="flex items-start justify-between gap-3 pr-8">
                <div>
                  <SheetTitle className="font-heading text-3xl leading-tight">
                    {row.acronym} <span className="text-muted-foreground">{row.year}</span>
                  </SheetTitle>
                  <SheetDescription className="text-muted-foreground mt-2 text-sm">
                    {row.name ?? "Full name not announced"}
                  </SheetDescription>
                </div>
                <BookmarkStar eventId={row.id} label={`${row.acronym} ${row.year}`} size="md" />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <TypeBadge type={row.type} />
                <Ranks core={row.rankCore} ccf={row.rankCcf} />
                <ModeChip mode={row.mode} />
              </div>
              <div className="grid gap-1 text-sm">
                <span className="text-muted-foreground font-mono text-xs">
                  {dates ?? "Dates not announced"}
                </span>
                <LocationLabel
                  city={row.city}
                  country={row.country}
                  countryCode={row.countryCode}
                />
                {row.parent && (
                  <Link
                    href={`/c/${row.parent.slug}`}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    Part of {row.parent.acronym} {row.parent.year} →
                  </Link>
                )}
              </div>
            </SheetHeader>

            <div className="space-y-6 p-6">
              <section aria-labelledby="pv-deadlines">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 id="pv-deadlines" className="text-sm font-medium">
                    Deadlines
                  </h3>
                  <TimezoneSelect />
                </div>
                {data ? (
                  <DeadlineList deadlines={data.deadlines} compact />
                ) : error ? (
                  <p className="text-muted-foreground text-sm">Couldn’t load details.</p>
                ) : (
                  <div className="space-y-2" aria-hidden>
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                )}
              </section>

              {(row.subfields.length > 0 || row.topics.length > 0) && (
                <section aria-label="Topics" className="space-y-3">
                  <ChipList
                    items={row.subfields.map((s) => SUBFIELD_LABEL[s as SubfieldId] ?? s)}
                    active
                  />
                  <TopicLine items={row.topics} />
                </section>
              )}

              {data?.cfpText && (
                <section aria-labelledby="pv-cfp">
                  <h3 id="pv-cfp" className="mb-2 text-sm font-medium">
                    Call for papers
                  </h3>
                  <p className="text-muted-foreground line-clamp-6 text-sm leading-relaxed whitespace-pre-line">
                    {data.cfpText.replace(/^## /gm, "").slice(0, 900)}
                  </p>
                </section>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button asChild>
                  <Link href={`/c/${row.slug}`}>
                    Open full page <ArrowUpRight />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <a href={`/api/events/${row.slug}/ics`}>
                    <CalendarPlus /> Add to calendar
                  </a>
                </Button>
                {data?.website && (
                  <Button asChild variant="ghost">
                    <a href={data.website} target="_blank" rel="noreferrer">
                      Official site <ExternalLink />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
