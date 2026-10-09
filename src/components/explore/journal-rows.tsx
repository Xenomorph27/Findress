"use client";

import { BookOpen, ExternalLink } from "lucide-react";
import Link from "next/link";
import { BookmarkStar } from "@/components/event/bookmark-star";
import { RankChip, TopicChip, TypeBadge } from "@/components/event/chips";
import { CountdownChip } from "@/components/event/countdown-chip";
import { useTimezone } from "@/components/timezone/timezone-provider";
import type { JournalListRow, SpecialIssueListRow } from "@/lib/data/types";
import { specialStatus } from "@/lib/explore/journal-filters";
import { useMounted } from "@/lib/hooks/use-mounted";
import { SUBFIELD_LABEL, type SubfieldId } from "@/lib/taxonomy";
import { formatApc } from "@/lib/journals/format";
import { formatInZone, zoneShortLabel } from "@/lib/time/format";
import { cn } from "@/lib/utils";

const ROW_GRID =
  "group border-hairline relative grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b px-3 py-3 transition-colors md:grid-cols-[112px_minmax(0,1fr)_150px_170px_auto] md:px-4";

const OA_LABEL = {
  full: "Open access",
  hybrid: "Hybrid OA",
  subscription: "Subscription",
} as const;

/** Open-access model badge; full OA wears the accent, the rest stay neutral. */
export function OaBadge({
  value,
  className,
}: {
  value: JournalListRow["openAccess"];
  className?: string;
}) {
  if (!value) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded border px-1.5 text-[10px] tracking-[0.04em] uppercase",
        value === "full"
          ? "border-aurora-1/40 bg-aurora-1/10 text-aurora-ink"
          : "border-hairline-strong text-muted-foreground",
        className,
      )}
    >
      {OA_LABEL[value]}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string | number | null }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <span className="tabular font-mono text-[12px]">{value ?? "—"}</span>
    </span>
  );
}

function RollingCell({ row, now }: { row: JournalListRow; now: number }) {
  const open = row.nextCall && row.nextCall.at >= now ? row.nextCall : null;
  return (
    <div className="flex flex-col items-start gap-1">
      {open ? (
        <CountdownChip dueAt={open.at} />
      ) : (
        <span className="border-hairline text-muted-foreground inline-flex h-6 items-center rounded-full border px-2 font-mono text-[11px]">
          Rolling
        </span>
      )}
      <span className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
        {open ? "special issue" : "submissions"}
      </span>
    </div>
  );
}

export function JournalResultRow({
  row,
  now,
  selected,
  onSelect,
  onOpen,
}: {
  row: JournalListRow;
  now: number;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      role="listitem"
      aria-current={selected ? "true" : undefined}
      data-slug={row.slug}
      onClick={onOpen}
      onMouseEnter={onSelect}
      className={cn(ROW_GRID, selected ? "bg-surface-2/70" : "hover:bg-surface-2/40")}
    >
      {selected && (
        <span aria-hidden className="bg-aurora absolute inset-y-2 left-0 w-0.5 rounded-full" />
      )}
      <div className="hidden md:block">
        <RollingCell row={row} now={now} />
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={`/j/${row.slug}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-sm"
            prefetch={false}
          >
            <span className="font-display text-foreground text-[1.35rem] leading-none whitespace-nowrap">
              {row.abbreviation}
            </span>
          </Link>
          <TypeBadge type="journal" />
          {row.openCalls > 0 && (
            <span className="text-muted-foreground font-mono text-[11px]">
              {row.openCalls} open {row.openCalls === 1 ? "call" : "calls"}
            </span>
          )}
        </div>
        <p className="text-muted-foreground mt-1 truncate text-sm">
          {row.name}
          {row.publisher && <span className="opacity-80"> · {row.publisher}</span>}
        </p>
        <div className="mt-1.5 hidden flex-wrap gap-1 md:flex">
          {row.subfields.slice(0, 2).map((s) => (
            <TopicChip key={s}>{SUBFIELD_LABEL[s as SubfieldId] ?? s}</TopicChip>
          ))}
          {row.topics.slice(0, 2).map((t) => (
            <TopicChip key={t}>{t}</TopicChip>
          ))}
        </div>
      </div>

      <div className="-mr-1 flex items-center gap-0.5 self-start md:hidden">
        <RollingCell row={row} now={now} />
        <BookmarkStar eventId={row.id} kind="journal" label={row.abbreviation} />
      </div>

      <div className="col-span-2 flex flex-wrap gap-x-5 gap-y-0.5 md:col-span-1 md:block md:space-y-0.5">
        <Metric label="h-index" value={row.hIndex} />
        <Metric label="2-yr cited" value={row.twoYrMeanCitedness?.toFixed(2) ?? null} />
      </div>

      <div className="col-span-2 flex flex-wrap items-center gap-1 text-xs md:col-span-1 md:block md:space-y-1">
        <div className="flex flex-wrap items-center gap-1">
          <OaBadge value={row.openAccess} />
          <span className="text-muted-foreground font-mono text-[11px]">{formatApc(row)}</span>
        </div>
        <div className="flex gap-1">
          <RankChip system="CORE" rank={row.rankCoreJournal} />
          <RankChip system="CCF" rank={row.rankCcf} />
        </div>
      </div>

      <div className="hidden md:block">
        <BookmarkStar eventId={row.id} kind="journal" label={row.abbreviation} />
      </div>
    </div>
  );
}

export function journalHref(row: SpecialIssueListRow): { href: string; external: boolean } {
  if (row.journal) return { href: `/j/${row.journal.slug}#si-${row.id}`, external: false };
  return { href: row.url ?? "/explore?tab=special", external: Boolean(row.url) };
}

function DeadlineText({ at }: { at: number | null }) {
  const { tz } = useTimezone();
  const mounted = useMounted();
  if (at == null) return <span>Deadline not stated</span>;
  const zone = mounted ? tz : "UTC";
  return (
    <span title="The call gives a date only; shown as end of day AoE in your time zone">
      {formatInZone(at, zone, "MMM d, yyyy")}{" "}
      <span className="opacity-70">{zoneShortLabel(zone)}</span>
    </span>
  );
}

export function SpecialIssueResultRow({
  row,
  now,
  selected,
  onSelect,
  onOpen,
}: {
  row: SpecialIssueListRow;
  now: number;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const status = specialStatus(row, now);
  const { href, external } = journalHref(row);
  const journalLabel = row.journal?.abbreviation ?? row.journalName ?? "Journal not stated";
  return (
    <div
      role="listitem"
      aria-current={selected ? "true" : undefined}
      onClick={onOpen}
      onMouseEnter={onSelect}
      className={cn(
        ROW_GRID,
        selected ? "bg-surface-2/70" : "hover:bg-surface-2/40",
        status === "closed" && "opacity-70",
      )}
    >
      {selected && (
        <span aria-hidden className="bg-aurora absolute inset-y-2 left-0 w-0.5 rounded-full" />
      )}
      <div className="hidden md:block">
        <div className="flex flex-col items-start gap-1">
          <CountdownChip dueAt={row.at} />
          <span className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
            {status === "closed" ? "call closed" : "special issue"}
          </span>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <TypeBadge type="special-issue" />
          {row.journal ? (
            <Link
              href={`/j/${row.journal.slug}`}
              onClick={(e) => e.stopPropagation()}
              className="font-display text-foreground text-lg leading-none"
              prefetch={false}
            >
              {row.journal.abbreviation}
            </Link>
          ) : (
            <span className="text-muted-foreground text-sm">{journalLabel}</span>
          )}
        </div>
        <p className="text-foreground mt-1 line-clamp-2 text-sm">{row.title}</p>
        <div className="mt-1.5 hidden flex-wrap gap-1 md:flex">
          {row.subfields.slice(0, 2).map((s) => (
            <TopicChip key={s}>{SUBFIELD_LABEL[s as SubfieldId] ?? s}</TopicChip>
          ))}
        </div>
      </div>

      <div className="-mr-1 flex items-center gap-0.5 self-start md:hidden">
        <CountdownChip dueAt={row.at} />
        <BookmarkStar eventId={row.id} kind="special" label={row.title} />
      </div>

      <div className="text-muted-foreground col-span-2 font-mono text-[12px] md:col-span-1">
        <DeadlineText at={row.at} />
      </div>

      <div className="text-muted-foreground col-span-2 min-w-0 text-xs md:col-span-1">
        {row.guestEditors.length > 0 && (
          <p className="truncate" title={row.guestEditors.join("; ")}>
            {row.guestEditors.length} guest {row.guestEditors.length === 1 ? "editor" : "editors"}
          </p>
        )}
        <a
          href={external ? href : (row.url ?? href)}
          onClick={(e) => e.stopPropagation()}
          target="_blank"
          rel="noreferrer"
          className="hover:text-foreground inline-flex items-center gap-1"
        >
          {row.source === "springer" ? "Springer call" : "Call (WikiCFP)"}{" "}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>

      <div className="hidden md:block">
        <BookmarkStar eventId={row.id} kind="special" label={row.title} />
      </div>
    </div>
  );
}

export function JournalCard({
  row,
  now,
  onOpen,
}: {
  row: JournalListRow;
  now: number;
  onOpen: () => void;
}) {
  return (
    <article
      onClick={onOpen}
      className="group border-hairline bg-surface/70 hover:border-hairline-strong relative flex cursor-pointer flex-col gap-3 rounded-xl border p-4 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/j/${row.slug}`} onClick={(e) => e.stopPropagation()} prefetch={false}>
            <span className="font-display text-[1.7rem] leading-none">{row.abbreviation}</span>
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <TypeBadge type="journal" />
            <OaBadge value={row.openAccess} />
          </div>
        </div>
        <BookmarkStar eventId={row.id} kind="journal" label={row.abbreviation} />
      </div>
      <p className="text-muted-foreground line-clamp-2 min-h-10 text-sm">{row.name}</p>
      <div className="flex items-center justify-between gap-2">
        <RollingCell row={row} now={now} />
        <span className="text-muted-foreground text-right font-mono text-[11px]">
          h {row.hIndex ?? "—"} · {formatApc(row)}
        </span>
      </div>
      <div className="border-hairline flex items-center justify-between gap-2 border-t pt-3 text-sm">
        <span className="text-muted-foreground inline-flex min-w-0 items-center gap-1.5 truncate text-xs">
          <BookOpen className="size-3.5 shrink-0" aria-hidden />{" "}
          {row.publisher ?? "Publisher not announced"}
        </span>
        <span className="flex shrink-0 gap-1">
          <RankChip system="CORE" rank={row.rankCoreJournal} />
          <RankChip system="CCF" rank={row.rankCcf} />
        </span>
      </div>
    </article>
  );
}

export function SpecialIssueCard({
  row,
  now,
  onOpen,
}: {
  row: SpecialIssueListRow;
  now: number;
  onOpen: () => void;
}) {
  const status = specialStatus(row, now);
  return (
    <article
      onClick={onOpen}
      className={cn(
        "group border-hairline bg-surface/70 hover:border-hairline-strong relative flex cursor-pointer flex-col gap-3 rounded-xl border p-4 transition-colors",
        status === "closed" && "opacity-75",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <TypeBadge type="special-issue" />
          <p className="font-display mt-2 text-xl leading-tight">
            {row.journal?.abbreviation ?? row.journalName ?? "Journal not stated"}
          </p>
        </div>
        <BookmarkStar eventId={row.id} kind="special" label={row.title} />
      </div>
      <p className="line-clamp-3 min-h-10 text-sm">{row.title}</p>
      <div className="flex items-center justify-between gap-2">
        <CountdownChip dueAt={row.at} />
        <span className="text-muted-foreground font-mono text-[11px]">
          <DeadlineText at={row.at} />
        </span>
      </div>
    </article>
  );
}
