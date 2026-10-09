"use client";

import {
  BarChart3,
  BookOpen,
  CalendarClock,
  Compass,
  FolderKanban,
  MoonStar,
  Radio,
  Sparkles,
  Sun,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { SUBFIELDS } from "@/lib/taxonomy";

interface SearchHit {
  slug: string;
  acronym: string;
  year: number;
  name: string | null;
  type: string;
  nextDeadlineAt: string | null;
}

interface JournalHit {
  slug: string;
  abbreviation: string;
  name: string;
  publisher: string | null;
}

function useEventSearch(query: string, enabled: boolean) {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [journals, setJournals] = useState<JournalHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const q = query.trim();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "8" });
        if (q) {
          params.set("q", q);
          params.set("passed", "1");
        }
        const [res, jres] = await Promise.all([
          fetch(`/api/events?${params}`, { signal: controller.signal }),
          q
            ? fetch(`/api/journals?${new URLSearchParams({ q, limit: "5", jsort: "hindex" })}`, {
                signal: controller.signal,
              })
            : null,
        ]);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { items: SearchHit[] };
        setHits(data.items ?? []);
        const jdata = jres?.ok ? ((await jres.json()) as { items: JournalHit[] }) : null;
        setJournals(jdata?.items ?? []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setHits([]);
          setJournals([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 140);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, enabled]);

  return { hits, journals, loading };
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const { hits, journals, loading } = useEventSearch(query, open);

  const go = (href: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search FIndress"
      description="Jump to a venue, apply a filter, or ask the assistant"
      className="border-hairline sm:max-w-xl"
    >
      <Command shouldFilter={false} className="glass">
        <CommandInput
          placeholder="Search venues and journals, e.g. NeurIPS, TMLR, vision workshops…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className="max-h-[min(60vh,440px)]">
          <CommandEmpty>{loading ? "Searching…" : "No venues or journals match."}</CommandEmpty>

          {hits.length > 0 && (
            <CommandGroup heading={query.trim() ? "Venues" : "Next deadlines"}>
              {hits.map((hit) => (
                <CommandItem
                  key={hit.slug}
                  value={`event-${hit.slug}`}
                  onSelect={() => go(`/c/${hit.slug}`)}
                >
                  <span className="text-aurora-ink shrink-0 text-sm font-medium">
                    {hit.acronym} {hit.year}
                  </span>
                  <span className="text-muted-foreground truncate">{hit.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {journals.length > 0 && (
            <CommandGroup heading="Journals">
              {journals.map((j) => (
                <CommandItem
                  key={j.slug}
                  value={`journal-${j.slug}`}
                  onSelect={() => go(`/j/${j.slug}`)}
                >
                  <BookOpen className="text-muted-foreground" />
                  <span className="text-aurora-ink shrink-0 text-sm font-medium">
                    {j.abbreviation}
                  </span>
                  <span className="text-muted-foreground truncate">{j.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {query.trim().length > 2 && (
            <CommandGroup heading="Assistant">
              <CommandItem
                value="ask-assistant"
                onSelect={() => go(`/explore?ask=${encodeURIComponent(query.trim())}`)}
              >
                <Sparkles className="text-aurora-ink" />
                <span>
                  Ask FIndress: <span className="text-muted-foreground">“{query.trim()}”</span>
                </span>
              </CommandItem>
            </CommandGroup>
          )}

          <CommandSeparator />
          <CommandGroup heading="Go to">
            <CommandItem value="nav-explore" onSelect={() => go("/explore")}>
              <Compass /> Explore
            </CommandItem>
            <CommandItem value="nav-journals" onSelect={() => go("/explore?tab=journals")}>
              <BookOpen /> Journals
            </CommandItem>
            <CommandItem value="nav-special" onSelect={() => go("/explore?tab=special")}>
              <CalendarClock /> Special issues
            </CommandItem>
            <CommandItem value="nav-insights" onSelect={() => go("/insights")}>
              <BarChart3 /> Insights
            </CommandItem>
            <CommandItem value="nav-workspace" onSelect={() => go("/workspace")}>
              <FolderKanban /> Workspace
            </CommandItem>
            <CommandItem value="nav-sources" onSelect={() => go("/sources")}>
              <Radio /> Sources
            </CommandItem>
          </CommandGroup>

          {!query.trim() && (
            <CommandGroup heading="Filter by subfield">
              {SUBFIELDS.slice(0, 8).map((s) => (
                <CommandItem
                  key={s.id}
                  value={`filter-${s.id}`}
                  onSelect={() => go(`/explore?subfield=${s.id}`)}
                >
                  <span className="bg-aurora-2 size-1.5 rounded-full" aria-hidden />
                  {s.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandGroup heading="Preferences">
            <CommandItem
              value="toggle-theme"
              onSelect={() => {
                setTheme(resolvedTheme === "dark" ? "light" : "dark");
                onOpenChange(false);
              }}
            >
              {resolvedTheme === "dark" ? <Sun /> : <MoonStar />}
              Switch to {resolvedTheme === "dark" ? "light" : "dark"} theme
              <CommandShortcut>theme</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
