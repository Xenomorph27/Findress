"use client";

import { CornerDownRight } from "lucide-react";
import Link from "next/link";
import { ViewTransition } from "react";
import { BookmarkStar } from "@/components/event/bookmark-star";
import { ChipList, LocationLabel, MAX_CHIPS, Ranks, TypeBadge } from "@/components/event/chips";
import { CountdownChip } from "@/components/event/countdown-chip";
import type { ExplorerRow } from "@/lib/data/types";
import { editionStatus, nextDeadline, type EditionStatus } from "@/lib/explore/filters";
import { SUBFIELD_LABEL, type SubfieldId } from "@/lib/taxonomy";
import { formatDateRange } from "@/lib/time/format";
import { cn } from "@/lib/utils";

const STATUS_NOTE: Partial<Record<EditionStatus, string>> = {
  closed: "call closed",
  tba: "next edition TBA",
  past: "past edition",
};

/** Small caption under the countdown: which deadline, or why there is none ahead. */
export function deadlineCaption(row: ExplorerRow, now: number): string {
  const nd = nextDeadline(row, now);
  const note = STATUS_NOTE[editionStatus(row, now)];
  if (note) return note;
  return nd ? (nd.kind === "abstract" ? "abstract" : "paper") : "deadline";
}

function DeadlineCell({ row, now }: { row: ExplorerRow; now: number }) {
  const nd = nextDeadline(row, now);
  return (
    <div className="flex flex-col items-start gap-1">
      <CountdownChip dueAt={nd?.at ?? null} />
      <span className="text-muted-foreground text-xs">{deadlineCaption(row, now)}</span>
    </div>
  );
}

export function EventTitle({ row, size = "md" }: { row: ExplorerRow; size?: "md" | "lg" }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <ViewTransition name={`acronym-${row.slug}`}>
        <span
          className={cn(
            "font-heading text-foreground leading-none whitespace-nowrap",
            size === "lg" ? "text-xl" : "text-base",
          )}
        >
          {row.acronym} <span className="text-muted-foreground">{row.year}</span>
        </span>
      </ViewTransition>
    </span>
  );
}

function ParentLine({ row }: { row: ExplorerRow }) {
  if (!row.parent) return null;
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
      <CornerDownRight className="size-3" aria-hidden />
      {row.parent.acronym} {row.parent.year}
    </span>
  );
}

/** Dense list row (desktop grid, stacked on mobile). */
export function ResultRow({
  row,
  now,
  selected,
  onSelect,
  onOpen,
}: {
  row: ExplorerRow;
  now: number;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const dates = formatDateRange(row.startDate, row.endDate);
  return (
    <div
      role="listitem"
      aria-current={selected ? "true" : undefined}
      data-slug={row.slug}
      onClick={onOpen}
      onMouseEnter={onSelect}
      className={cn(
        "group relative grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-lg px-3 py-4 transition-colors md:grid-cols-[112px_minmax(0,1fr)_150px_170px_auto] md:px-4",
        selected ? "tint-selected" : "tint-row-hover",
        ["tba", "past"].includes(editionStatus(row, now)) && "dimmed",
      )}
    >
      {selected && (
        <span aria-hidden className="bg-screen absolute inset-y-2 left-0 w-0.5 rounded-full" />
      )}
      <div className="hidden md:block">
        <DeadlineCell row={row} now={now} />
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={`/c/${row.slug}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-sm"
            prefetch={false}
          >
            <EventTitle row={row} />
          </Link>
          {row.type !== "conference" && <TypeBadge type={row.type} />}
          {row.communityOnly && (
            <span className="text-muted-foreground text-xs">community-listed</span>
          )}
          <ParentLine row={row} />
        </div>
        <p className="text-muted-foreground mt-1 truncate text-sm">
          {row.name ?? "Full name not announced"}
        </p>
        <ChipList
          items={[...row.subfields.map((s) => SUBFIELD_LABEL[s as SubfieldId] ?? s), ...row.topics]}
          max={MAX_CHIPS - (row.type !== "conference" ? 1 : 0)}
          className="mt-2 hidden md:flex"
        />
      </div>

      <div className="-mr-1 flex items-center gap-0.5 self-start md:hidden">
        <span className="flex flex-col items-end gap-0.5">
          <CountdownChip dueAt={nextDeadline(row, now)?.at ?? null} />
          {editionStatus(row, now) !== "open" && nextDeadline(row, now) && (
            <span className="text-muted-foreground text-xs">{deadlineCaption(row, now)}</span>
          )}
        </span>
        <BookmarkStar eventId={row.id} label={`${row.acronym} ${row.year}`} />
      </div>

      <div className="text-muted-foreground col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs md:col-span-1 md:block md:text-sm">
        <span className="font-mono text-xs md:block">{dates ?? "Dates not announced"}</span>
        <LocationLabel
          city={row.city}
          country={row.country}
          countryCode={row.countryCode}
          className="max-w-full md:hidden"
        />
        <Ranks core={row.rankCore} ccf={row.rankCcf} className="md:hidden" />
      </div>

      <div className="hidden min-w-0 text-sm md:block">
        <LocationLabel
          city={row.city}
          country={row.country}
          countryCode={row.countryCode}
          className="max-w-full"
        />
        <Ranks core={row.rankCore} ccf={row.rankCcf} className="mt-1" />
      </div>

      <div className="hidden md:block">
        <BookmarkStar eventId={row.id} label={`${row.acronym} ${row.year}`} />
      </div>
    </div>
  );
}

export function ResultCard({
  row,
  now,
  onOpen,
}: {
  row: ExplorerRow;
  now: number;
  onOpen: () => void;
}) {
  const nd = nextDeadline(row, now);
  const dates = formatDateRange(row.startDate, row.endDate);
  return (
    <article
      onClick={onOpen}
      className={cn(
        "group glass-panel tint-col-hover relative flex cursor-pointer flex-col gap-4 rounded-xl p-5 transition-colors",
        ["tba", "past"].includes(editionStatus(row, now)) && "dimmed",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/c/${row.slug}`} onClick={(e) => e.stopPropagation()} prefetch={false}>
            <EventTitle row={row} size="lg" />
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {row.type !== "conference" && <TypeBadge type={row.type} />}
            <ParentLine row={row} />
          </div>
        </div>
        <BookmarkStar eventId={row.id} label={`${row.acronym} ${row.year}`} />
      </div>
      <p className="text-muted-foreground line-clamp-2 min-h-10 text-sm">
        {row.name ?? "Full name not announced"}
      </p>
      <div className="flex items-center justify-between gap-2">
        <CountdownChip
          dueAt={nd?.at ?? null}
          label={nd ? (nd.kind === "abstract" ? "abs" : "paper") : undefined}
        />
        <span className="text-muted-foreground text-right font-mono text-xs">
          {dates ?? "Dates TBA"}
          {nd?.passed && <span className="block">{deadlineCaption(row, now)}</span>}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <LocationLabel
          city={row.city}
          country={row.country}
          countryCode={row.countryCode}
          className="min-w-0"
        />
        <Ranks core={row.rankCore} ccf={row.rankCcf} className="shrink-0" />
      </div>
    </article>
  );
}
