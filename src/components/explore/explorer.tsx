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
import type { ExplorerRow } from "@/lib/data/types";
import {
  activeFilterCount,
  applyFilters,
  DEFAULT_FILTERS,
  parseFilters,
  serializeFilters,
  type Filters,
  type SortKey,
} from "@/lib/explore/filters";
import { useBookmarks } from "@/lib/hooks/use-bookmarks";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useNow } from "@/lib/hooks/use-now";
import { ResultCard, ResultRow } from "./event-rows";
import { FilterRail } from "./filter-rail";
import { PreviewSheet } from "./preview-sheet";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "deadline", label: "Nearest deadline" },
  { value: "date", label: "Event date" },
  { value: "rank", label: "Rank" },
  { value: "name", label: "Name" },
  { value: "recent", label: "Recently added" },
];

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

export function Explorer({
  rows,
  initialFilters,
  initialNow,
  dataState,
  assistant,
  scope = "full",
}: {
  scope?: "full" | "upcoming";
  rows: ExplorerRow[];
  initialFilters: Filters;
  initialNow: number;
  dataState: "ok" | "not-configured" | "error";
  assistant?: ReactNode;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
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
  const results = useMemo(() => applyFilters(rows, effective, now), [rows, effective, now]);
  const workshopCount = useMemo(
    () => results.filter((r) => r.type === "workshop").length,
    [results],
  );
  const selectedIndex = Math.min(selected, Math.max(results.length - 1, 0));

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
      // The server sent only upcoming rows: fetch the full set when a filter needs it.
      if (scope === "upcoming" && (next.showPassed || next.community)) {
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
    (row: ExplorerRow) => {
      if (isDesktop) setPreview(row);
      else router.push(`/c/${row.slug}`);
    },
    [isDesktop, router],
  );

  // List virtualization against the window scroller.
  const listRef = useRef<HTMLDivElement>(null);
  const hasResults = results.length > 0;
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const update = () =>
      setScrollMargin((listRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY);
    const el = listRef.current;
    if (el) setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [filters.view, hasResults]);
  const virtualizer = useWindowVirtualizer({
    count: filters.view === "list" ? results.length : 0,
    estimateSize: () => (isDesktop ? 96 : 118),
    overscan: 8,
    scrollMargin,
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
      if (isTypingTarget(e.target) || results.length === 0) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const next = Math.max(
          0,
          Math.min(results.length - 1, selectedIndex + (e.key === "j" ? 1 : -1)),
        );
        setSelected(next);
        if (filters.view === "list") virtualizer.scrollToIndex(next, { align: "auto" });
        if (preview) setPreview(results[next]);
      } else if (e.key === "Enter" && !preview) {
        e.preventDefault();
        open(results[selectedIndex]);
      } else if (e.key === "b") {
        e.preventDefault();
        const row = results[selectedIndex];
        if (isOwner) void toggleBookmark(row.id);
        else
          router.push(
            `/unlock?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
          );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    results,
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

  if (dataState !== "ok" && rows.length === 0) {
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

  return (
    <div className="flex gap-8 pt-6">
      <aside
        aria-label="Filters"
        className="sticky top-20 hidden max-h-[calc(100dvh-6rem)] w-[268px] shrink-0 scrollbar-none self-start overflow-y-auto pr-2 pb-8 lg:block"
      >
        <FilterRail filters={filters} onChange={patch} rows={rows} />
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
          <div>
            <h1 className="font-display text-4xl leading-none md:text-5xl">Explore</h1>
            <p className="text-muted-foreground mt-2 text-sm" aria-live="polite">
              <span className="text-foreground tabular font-mono">{results.length}</span> venues
              {workshopCount > 0 && (
                <>
                  {" "}
                  · <span className="tabular font-mono">{workshopCount}</span> workshops
                </>
              )}
              {!filters.showPassed && " · upcoming deadlines"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {assistant}
            <TimezoneSelect />
          </div>
        </div>

        <div className="border-hairline bg-background/85 sticky top-14 z-20 -mx-4 flex flex-wrap items-center gap-2 border-b px-4 py-3 backdrop-blur-xl md:-mx-0 md:rounded-xl md:border md:px-3">
          <div className="relative min-w-[200px] flex-1">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search acronym, name, topic, city…"
              aria-label="Search venues"
              className="h-9 pr-9 pl-8"
            />
            <kbd className="border-hairline text-muted-foreground pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border px-1.5 font-mono text-[10px] sm:block">
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
              <span className="bg-aurora-2/15 text-foreground rounded-full px-1.5 font-mono text-[10px]">
                {activeCount}
              </span>
            )}
          </Button>
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
          initial={reduceMotion || !mounted ? false : { opacity: 0.4 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="pt-3"
        >
          {results.length === 0 ? (
            <EmptyState title="Nothing in orbit" className="mt-6">
              No venues match these filters.
              <div className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setFilters({ ...DEFAULT_FILTERS, view: filters.view, sort: filters.sort });
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
              className="border-hairline bg-surface/40 relative overflow-hidden rounded-xl border"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((item) => {
                const row = results[item.index];
                const stagger = !mounted && !reduceMotion && item.index < 16;
                return (
                  <div
                    key={row.slug}
                    id={`row-${row.slug}`}
                    data-index={item.index}
                    ref={virtualizer.measureElement}
                    className="absolute inset-x-0 top-0"
                    style={{
                      transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
                    }}
                  >
                    <motion.div
                      initial={stagger ? { opacity: 0, y: 6 } : false}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.2,
                        ease: "easeOut",
                        delay: stagger ? item.index * 0.02 : 0,
                      }}
                    >
                      <ResultRow
                        row={row}
                        now={now}
                        selected={item.index === selectedIndex}
                        onSelect={() => setSelected(item.index)}
                        onOpen={() => {
                          setSelected(item.index);
                          open(row);
                        }}
                      />
                    </motion.div>
                  </div>
                );
              })}
            </div>
          ) : (
            <CardGrid rows={results} now={now} onOpen={open} reduceMotion={!!reduceMotion} />
          )}
        </motion.div>
        <p className="text-muted-foreground mt-6 hidden text-xs lg:block">
          Keyboard: <kbd className="font-mono">/</kbd> search · <kbd className="font-mono">j</kbd>/
          <kbd className="font-mono">k</kbd> move · <kbd className="font-mono">Enter</kbd> preview ·{" "}
          <kbd className="font-mono">b</kbd> bookmark
        </p>
      </div>

      <Sheet open={mobileFilters} onOpenChange={setMobileFilters}>
        <SheetContent
          side="bottom"
          className="glass border-hairline max-h-[88dvh] overflow-y-auto px-5 pb-6"
        >
          <SheetHeader className="px-0">
            <SheetTitle className="font-display text-2xl font-normal">Filters</SheetTitle>
          </SheetHeader>
          <FilterRail filters={filters} onChange={patch} rows={rows} />
          <Button className="mt-5 w-full" onClick={() => setMobileFilters(false)}>
            Show {results.length} venues
          </Button>
        </SheetContent>
      </Sheet>

      <PreviewSheet row={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function CardGrid({
  rows,
  now,
  onOpen,
  reduceMotion,
}: {
  rows: ExplorerRow[];
  now: number;
  onOpen: (r: ExplorerRow) => void;
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
  const shown = rows.slice(0, limit);
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((row, i) => (
          <motion.div
            key={row.slug}
            layout={!reduceMotion && i < 24}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <ResultCard row={row} now={now} onOpen={() => onOpen(row)} />
          </motion.div>
        ))}
      </div>
      {limit < rows.length && <div ref={sentinel} className="h-10" aria-hidden />}
    </>
  );
}
