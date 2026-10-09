"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { motion, useReducedMotion } from "framer-motion";
import { LayoutGrid, List, Search, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { EmptyState } from "@/components/shell/states";
import { TimezoneSelect } from "@/components/timezone/timezone-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ExplorerRow, JournalListRow, SpecialIssueListRow } from "@/lib/data/types";
import {
  activeFilterCount,
  applyFilters,
  DEFAULT_FILTERS,
  EXPLORE_TABS,
  nextDeadline,
  parseFilters,
  serializeFilters,
  type ExploreTab,
  type Filters,
  type JournalSortKey,
  type SortKey,
} from "@/lib/explore/filters";
import { applyJournalFilters, applySpecialFilters } from "@/lib/explore/journal-filters";
import { useBookmarks } from "@/lib/hooks/use-bookmarks";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useNow } from "@/lib/hooks/use-now";
import { cn } from "@/lib/utils";
import { ResultCard, ResultRow } from "./event-rows";
import { FilterRail, type RailMode } from "./filter-rail";
import {
  JournalCard,
  journalHref,
  JournalResultRow,
  SpecialIssueCard,
  SpecialIssueResultRow,
} from "./journal-rows";
import { PreviewSheet } from "./preview-sheet";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "deadline", label: "Nearest deadline" },
  { value: "date", label: "Event date" },
  { value: "rank", label: "Rank" },
  { value: "name", label: "Name" },
  { value: "recent", label: "Recently added" },
];
const JOURNAL_SORTS: { value: JournalSortKey; label: string }[] = [
  { value: "calls", label: "Open calls first" },
  { value: "hindex", label: "h-index" },
  { value: "citedness", label: "2-yr citedness" },
  { value: "apc", label: "Lowest APC" },
  { value: "name", label: "Name" },
];

type Item =
  | { kind: "event"; key: string; row: ExplorerRow }
  | { kind: "journal"; key: string; row: JournalListRow }
  | { kind: "special"; key: string; row: SpecialIssueListRow };

function isTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  return (
    !!t &&
    (t.tagName === "INPUT" ||
      t.tagName === "TEXTAREA" ||
      t.tagName === "SELECT" ||
      t.isContentEditable)
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Merge events and special issues by deadline (default sort), then rolling journals. */
function combineAll(
  events: ExplorerRow[],
  specials: SpecialIssueListRow[],
  journals: JournalListRow[],
  sort: SortKey,
  now: number,
): Item[] {
  const ev: Item[] = events.map((row) => ({ kind: "event", key: `event:${row.id}`, row }));
  const si: Item[] = specials.map((row) => ({ kind: "special", key: `special:${row.id}`, row }));
  const jo: Item[] = journals.map((row) => ({ kind: "journal", key: `journal:${row.id}`, row }));
  if (sort !== "deadline") return [...ev, ...si, ...jo];
  const openAt = (it: Item): number | null => {
    if (it.kind === "event") {
      const nd = nextDeadline(it.row, now);
      return nd && !nd.passed ? nd.at : null;
    }
    if (it.kind === "special") return it.row.at != null && it.row.at >= now ? it.row.at : null;
    return null;
  };
  const open = [...ev, ...si]
    .filter((it) => openAt(it) != null)
    .sort((a, b) => openAt(a)! - openAt(b)!);
  const rest = [...ev.filter((it) => openAt(it) == null), ...si.filter((it) => openAt(it) == null)];
  return [...open, ...rest, ...jo];
}

export function Explorer({
  rows,
  journals = [],
  specials = [],
  initialFilters,
  initialNow,
  dataState,
  assistant,
  scope = "full",
}: {
  scope?: "full" | "upcoming";
  rows: ExplorerRow[];
  journals?: JournalListRow[];
  specials?: SpecialIssueListRow[];
  initialFilters: Filters;
  initialNow: number;
  dataState: "ok" | "not-configured" | "error";
  assistant?: ReactNode;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
  // The desktop rail is CSS-hidden on phones; rendering it only on desktop (after hydration)
  // spares mobile from hydrating hundreds of filter chips nobody sees.
  const showRail = useMediaQuery("(min-width: 1024px)", false);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [query, setQuery] = useState(initialFilters.q);
  const deferredQuery = useDeferredValue(query);
  const [selected, setSelected] = useState(0);
  const [preview, setPreview] = useState<ExplorerRow | null>(null);
  const [mobileFilters, setMobileFilters] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  // False on the server and the hydration render: rows animate in on first load only.
  const mounted = useMounted();
  const now = useNow(60_000) ?? initialNow;
  const { toggle: toggleBookmark, isOwner } = useBookmarks();

  const effective = useMemo(() => ({ ...filters, q: deferredQuery }), [filters, deferredQuery]);
  const tab = effective.tab;

  const eventRows = useMemo(() => {
    if (tab === "journals" || tab === "special") return [];
    const scoped =
      tab === "workshops"
        ? rows.filter((r) => r.type === "workshop")
        : tab === "conferences"
          ? rows.filter((r) => r.type !== "workshop")
          : rows;
    return applyFilters(scoped, effective, now);
  }, [rows, effective, now, tab]);
  const journalRows = useMemo(
    () =>
      tab === "journals" || tab === "all" ? applyJournalFilters(journals, effective, now) : [],
    [journals, effective, now, tab],
  );
  const specialRows = useMemo(
    () => (tab === "special" || tab === "all" ? applySpecialFilters(specials, effective, now) : []),
    [specials, effective, now, tab],
  );
  const items = useMemo<Item[]>(() => {
    if (tab === "journals")
      return journalRows.map((row) => ({ kind: "journal", key: `journal:${row.id}`, row }));
    if (tab === "special")
      return specialRows.map((row) => ({ kind: "special", key: `special:${row.id}`, row }));
    if (tab === "all") return combineAll(eventRows, specialRows, journalRows, effective.sort, now);
    return eventRows.map((row) => ({ kind: "event", key: `event:${row.id}`, row }));
  }, [tab, eventRows, journalRows, specialRows, effective.sort, now]);

  const workshopCount = useMemo(
    () => eventRows.filter((r) => r.type === "workshop").length,
    [eventRows],
  );
  const conferenceCount = eventRows.length - workshopCount;
  const selectedIndex = Math.min(selected, Math.max(items.length - 1, 0));

  const filtersRef = useRef(filters);
  const queryRef = useRef(query);
  useEffect(() => {
    filtersRef.current = filters;
    queryRef.current = query;
  });
  const patch = useCallback(
    (p: Partial<Filters>) => {
      const next = { ...filtersRef.current, ...p };
      setFilters(next);
      setSelected(0);
      // The server sent only current editions: fetch the full set when a filter needs it.
      const eventsTab = next.tab !== "journals" && next.tab !== "special";
      if (scope === "upcoming" && eventsTab && (next.showPassed || next.community)) {
        const qs = serializeFilters({ ...next, q: queryRef.current }).toString();
        router.replace(`/explore${qs ? `?${qs}` : ""}`, { scroll: false });
      }
    },
    [scope, router],
  );

  // Keep the URL in sync (shareable views) without a server round-trip.
  useEffect(() => {
    const qs = serializeFilters(effective).toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [effective]);

  useEffect(() => {
    const onPop = () => {
      const f = parseFilters(new URLSearchParams(window.location.search));
      setFilters(f);
      setQuery(f.q);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const open = useCallback(
    (item: Item) => {
      if (item.kind === "event") {
        if (isDesktop) setPreview(item.row);
        else router.push(`/c/${item.row.slug}`);
      } else if (item.kind === "journal") {
        router.push(`/j/${item.row.slug}`);
      } else {
        const { href, external } = journalHref(item.row);
        if (external) window.open(href, "_blank", "noopener,noreferrer");
        else router.push(href);
      }
    },
    [isDesktop, router],
  );

  // List virtualization against the window scroller.
  const listRef = useRef<HTMLDivElement>(null);
  const hasResults = items.length > 0;
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const update = () =>
      setScrollMargin((listRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY);
    const el = listRef.current;
    if (el) setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [filters.view, hasResults, tab]);
  const virtualizer = useWindowVirtualizer({
    count: filters.view === "list" ? items.length : 0,
    estimateSize: () => (isDesktop ? 104 : 132),
    overscan: 8,
    scrollMargin,
    getItemKey: (i) => items[i]?.key ?? i,
  });

  // Keyboard: / search, j/k move, Enter open, b bookmark, Esc close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/" && !isTypingTarget(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (isTypingTarget(e.target) || items.length === 0) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const next = Math.max(
          0,
          Math.min(items.length - 1, selectedIndex + (e.key === "j" ? 1 : -1)),
        );
        setSelected(next);
        if (filters.view === "list") virtualizer.scrollToIndex(next, { align: "auto" });
        const it = items[next];
        if (preview && it.kind === "event") setPreview(it.row);
      } else if (e.key === "Enter" && !preview) {
        e.preventDefault();
        open(items[selectedIndex]);
      } else if (e.key === "b") {
        e.preventDefault();
        const it = items[selectedIndex];
        if (isOwner) void toggleBookmark(it.row.id, it.kind);
        else
          router.push(
            `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
          );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    items,
    selectedIndex,
    filters.view,
    virtualizer,
    preview,
    open,
    isOwner,
    toggleBookmark,
    router,
  ]);

  const activeCount = activeFilterCount(filters);
  const signature = serializeFilters({ ...effective, view: "list", sort: "deadline" }).toString();
  const railMode: RailMode =
    tab === "journals" ? "journals" : tab === "special" ? "special" : "events";
  const specialSubfields = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of specials) for (const s of r.subfields) m.set(s, (m.get(s) ?? 0) + 1);
    return m;
  }, [specials]);
  const isJournalTab = tab === "journals";

  if (dataState !== "ok" && rows.length === 0 && journals.length === 0) {
    return (
      <EmptyState
        title={dataState === "not-configured" ? "No data yet" : "The archive is unreachable"}
        className="mt-10"
      >
        {dataState === "not-configured" ? (
          <>
            Connect a database (<code className="font-mono">DATABASE_URL</code>) and run{" "}
            <code className="font-mono">pnpm ingest</code> to pull every AI/ML venue into FIndress.
          </>
        ) : (
          <>The database didn’t answer. The page will recover on its own once it’s back.</>
        )}
      </EmptyState>
    );
  }

  const summary = (() => {
    if (tab === "journals") return plural(journalRows.length, "journal", "journals");
    if (tab === "special")
      return `${plural(specialRows.length, "special issue", "special issues")}${filters.showPassed ? "" : " · open or undated calls"}`;
    const parts = [
      tab !== "workshops" && plural(conferenceCount, "conference", "conferences"),
      tab !== "conferences" && plural(workshopCount, "workshop", "workshops"),
      tab === "all" && plural(journalRows.length, "journal", "journals"),
      tab === "all" && plural(specialRows.length, "special issue", "special issues"),
    ].filter(Boolean);
    return `${parts.join(" · ")}${filters.showPassed ? "" : " · current editions"}`;
  })();

  const rail = (
    <FilterRail
      filters={filters}
      onChange={patch}
      rows={rows}
      mode={railMode}
      journals={journals}
      specialSubfields={specialSubfields}
    />
  );

  return (
    <div className="flex gap-8 pt-6">
      <aside
        aria-label="Filters"
        className="bg-chrome/80 sticky top-20 hidden max-h-[calc(100dvh-6rem)] w-[268px] shrink-0 scrollbar-none self-start overflow-y-auto rounded-2xl px-4 pt-5 pb-8 lg:block"
      >
        {showRail && rail}
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-6">
          <p className="text-muted-foreground min-w-0 text-sm" aria-live="polite">
            {summary}
          </p>
          <div className="flex items-center gap-2">
            {assistant}
            <TimezoneSelect />
          </div>
        </div>

        <TabBar value={tab} onChange={(t) => patch({ tab: t })} />

        <div className="border-hairline bg-background/85 md:bg-surface/90 sticky top-14 z-20 -mx-4 flex flex-wrap items-center gap-2 border-b px-4 py-3 backdrop-blur-xl md:-mx-0 md:rounded-xl md:border-0 md:px-3">
          <div className="relative min-w-[200px] flex-1 basis-full sm:basis-auto">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 z-10 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isJournalTab
                  ? "Search journal, publisher, topic…"
                  : tab === "special"
                    ? "Search special issues, journals, topics…"
                    : "Search acronym, name, topic, city…"
              }
              aria-label="Search venues"
              className="h-9 pr-9 pl-8"
            />
            <kbd className="border-hairline text-muted-foreground pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border px-1.5 font-mono text-xs sm:block">
              /
            </kbd>
          </div>
          <Button
            variant="outline"
            className="h-9 lg:hidden"
            onClick={() => setMobileFilters(true)}
            aria-label={`Filters${activeCount ? ` (${activeCount} active)` : ""}`}
          >
            <SlidersHorizontal /> Filters
            {activeCount > 0 && (
              <span className="tint-selected text-foreground rounded-full px-1.5 font-mono text-xs">
                {activeCount}
              </span>
            )}
          </Button>
          {isJournalTab ? (
            <Select
              value={filters.jsort}
              onValueChange={(v) => patch({ jsort: v as JournalSortKey })}
            >
              <SelectTrigger className="h-9 w-[170px]" aria-label="Sort journals by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JOURNAL_SORTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : tab === "special" ? null : (
            <Select value={filters.sort} onValueChange={(v) => patch({ sort: v as SortKey })}>
              <SelectTrigger className="h-9 w-[170px]" aria-label="Sort by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <ToggleGroup
            type="single"
            value={filters.view}
            onValueChange={(v) => v && patch({ view: v as Filters["view"] })}
            variant="outline"
            aria-label="View"
            className="h-9"
          >
            <ToggleGroupItem value="list" aria-label="List view" className="h-9">
              <List />
            </ToggleGroupItem>
            <ToggleGroupItem value="cards" aria-label="Card view" className="h-9">
              <LayoutGrid />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <motion.div
          key={signature}
          id="explore-panel"
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          initial={reduceMotion || !mounted ? false : { opacity: 0.4 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="pt-4"
        >
          {items.length === 0 ? (
            <EmptyState title="Nothing in orbit" className="mt-6">
              {tab === "special"
                ? "No special-issue calls match. Calls appear as journals and WikiCFP announce them."
                : "No venues match these filters."}
              <div className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setFilters({
                      ...DEFAULT_FILTERS,
                      tab: filters.tab,
                      view: filters.view,
                      sort: filters.sort,
                    });
                    setQuery("");
                  }}
                >
                  Clear filters
                </Button>
              </div>
            </EmptyState>
          ) : filters.view === "list" ? (
            <div
              ref={listRef}
              role="list"
              aria-label="Venues"
              className="bg-background/80 relative rounded-xl"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((v) => {
                const item = items[v.index];
                const stagger = !mounted && !reduceMotion && v.index < 16;
                const common = {
                  now,
                  selected: v.index === selectedIndex,
                  onSelect: () => setSelected(v.index),
                  onOpen: () => {
                    setSelected(v.index);
                    open(item);
                  },
                };
                return (
                  <div
                    key={item.key}
                    id={`row-${item.key.replace(":", "-")}`}
                    data-index={v.index}
                    ref={virtualizer.measureElement}
                    className="absolute inset-x-0 top-0"
                    style={{
                      transform: `translateY(${v.start - virtualizer.options.scrollMargin}px)`,
                    }}
                  >
                    {/* First-load stagger in CSS: starts at first paint, costs no hydration work. */}
                    <div
                      className={stagger ? "row-in" : undefined}
                      style={stagger ? { animationDelay: `${v.index * 20}ms` } : undefined}
                    >
                      {item.kind === "event" ? (
                        <ResultRow row={item.row} {...common} />
                      ) : item.kind === "journal" ? (
                        <JournalResultRow row={item.row} {...common} />
                      ) : (
                        <SpecialIssueResultRow row={item.row} {...common} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <CardGrid items={items} now={now} onOpen={open} reduceMotion={!!reduceMotion} />
          )}
        </motion.div>
        <p className="text-muted-foreground mt-8 hidden text-xs lg:block">
          Keyboard: <kbd className="font-mono">/</kbd> search · <kbd className="font-mono">j</kbd>/
          <kbd className="font-mono">k</kbd> move · <kbd className="font-mono">Enter</kbd> open ·{" "}
          <kbd className="font-mono">b</kbd> bookmark
        </p>
      </div>

      <Sheet open={mobileFilters} onOpenChange={setMobileFilters}>
        <SheetContent
          side="bottom"
          className="glass border-hairline max-h-[88dvh] overflow-y-auto px-5 pb-6"
        >
          <SheetHeader className="px-0">
            <SheetTitle className="font-heading text-xl">Filters</SheetTitle>
          </SheetHeader>
          {rail}
          <Button className="mt-5 w-full" onClick={() => setMobileFilters(false)}>
            Show {items.length} results
          </Button>
        </SheetContent>
      </Sheet>

      <PreviewSheet row={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

/** Segmented control: All · Conferences · Workshops · Journals · Special issues (URL ?tab=). */
function TabBar({ value, onChange }: { value: ExploreTab; onChange: (t: ExploreTab) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: ReactKeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End")
      return;
    e.preventDefault();
    const n = EXPLORE_TABS.length;
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? n - 1
          : (i + (e.key === "ArrowRight" ? 1 : -1) + n) % n;
    refs.current[next]?.focus();
    onChange(EXPLORE_TABS[next].value);
  };
  return (
    <div
      role="tablist"
      aria-label="What to explore"
      className="tint-surface mb-4 flex w-full flex-wrap gap-1 rounded-xl p-1 sm:w-fit sm:flex-nowrap"
    >
      {EXPLORE_TABS.map((t, i) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`tab-${t.value}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls="explore-panel"
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "h-8 shrink-0 rounded-lg px-3 text-sm whitespace-nowrap transition-colors",
              active
                ? "tint-selected text-foreground"
                : "text-muted-foreground hover:text-foreground tint-row-hover",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function CardGrid({
  items,
  now,
  onOpen,
  reduceMotion,
}: {
  items: Item[];
  now: number;
  onOpen: (it: Item) => void;
  reduceMotion: boolean;
}) {
  const [limit, setLimit] = useState(48);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + 48);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const shown = items.slice(0, limit);
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((item, i) => (
          <motion.div
            key={item.key}
            layout={!reduceMotion && i < 24}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {item.kind === "event" ? (
              <ResultCard row={item.row} now={now} onOpen={() => onOpen(item)} />
            ) : item.kind === "journal" ? (
              <JournalCard row={item.row} now={now} onOpen={() => onOpen(item)} />
            ) : (
              <SpecialIssueCard row={item.row} now={now} onOpen={() => onOpen(item)} />
            )}
          </motion.div>
        ))}
      </div>
      {limit < items.length && <div ref={sentinel} className="h-10" aria-hidden />}
    </>
  );
}
