"use client";

import { RotateCcw } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ExplorerRow, JournalListRow } from "@/lib/data/types";
import { DEFAULT_FILTERS, type DeadlineWindow, type Filters } from "@/lib/explore/filters";
import {
  CONTINENTS,
  EVENT_TYPE_LABEL,
  EVENT_TYPES,
  MODE_LABEL,
  MODES,
  RANK_FILTERS,
  SUBFIELDS,
} from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-hairline space-y-2.5 border-b pb-5">
      <legend className="text-muted-foreground mb-2.5 font-mono text-[10px] tracking-[0.16em] uppercase">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Chip({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
        active
          ? "border-aurora-2/60 bg-aurora-2/12 text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--aurora-2)_25%,transparent)]"
          : "border-hairline text-muted-foreground hover:border-hairline-strong hover:text-foreground",
      )}
    >
      {children}
      {count != null && <span className="font-mono text-[10px] opacity-60">{count}</span>}
    </button>
  );
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Toggle({
  id,
  label,
  checked,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="flex flex-col items-start gap-0.5 text-sm font-normal">
        {label}
        {hint && <span className="text-muted-foreground text-[11px]">{hint}</span>}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

const WINDOWS: { value: DeadlineWindow; label: string }[] = [
  { value: "", label: "Any" },
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
  { value: "custom", label: "Custom" },
];

const OA_OPTIONS = [
  { value: "full", label: "Full OA" },
  { value: "hybrid", label: "Hybrid" },
  { value: "subscription", label: "Subscription" },
];
const APC_OPTIONS = [
  { value: "", label: "Any" },
  { value: "0", label: "Free" },
  { value: "1000", label: "≤ $1k" },
  { value: "2500", label: "≤ $2.5k" },
  { value: "4000", label: "≤ $4k" },
];
const JOURNAL_RANKS = ["A*", "A", "B", "C", "CCF-A", "CCF-B", "CCF-C"];

export type RailMode = "events" | "journals" | "special";

function ResetHeader({
  filters,
  onChange,
  isDefault,
}: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  isDefault: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-medium">Filters</h2>
      <button
        type="button"
        onClick={() =>
          onChange({
            ...DEFAULT_FILTERS,
            tab: filters.tab,
            q: filters.q,
            view: filters.view,
            sort: filters.sort,
            jsort: filters.jsort,
          })
        }
        disabled={isDefault}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs disabled:opacity-40"
      >
        <RotateCcw className="size-3" aria-hidden /> Reset
      </button>
    </div>
  );
}

function SubfieldSection({
  filters,
  onChange,
  counts,
}: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  counts: Map<string, number>;
}) {
  return (
    <Section title="Subfield">
      <div className="flex flex-wrap gap-1.5">
        {SUBFIELDS.map((s) => (
          <Chip
            key={s.id}
            active={filters.subfields.includes(s.id)}
            count={counts.get(s.id) ?? 0}
            onClick={() => onChange({ subfields: toggle(filters.subfields, s.id) })}
          >
            {s.label}
          </Chip>
        ))}
      </div>
    </Section>
  );
}

function countSubfields(rows: { subfields: string[] }[]) {
  const m = new Map<string, number>();
  for (const r of rows) for (const s of r.subfields) m.set(s, (m.get(s) ?? 0) + 1);
  return m;
}

/** Journals tab: open access, APC, rank and publisher (plus subfield). */
function JournalRail({
  filters,
  onChange,
  journals,
}: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  journals: JournalListRow[];
}) {
  const subfieldCounts = useMemo(() => countSubfields(journals), [journals]);
  const publishers = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of journals) if (j.publisher) m.set(j.publisher, (m.get(j.publisher) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [journals]);
  const isDefault =
    !filters.subfields.length &&
    !filters.oa.length &&
    !filters.apcMax &&
    !filters.jranks.length &&
    !filters.publishers.length;
  return (
    <div className="space-y-5">
      <ResetHeader filters={filters} onChange={onChange} isDefault={isDefault} />
      <Section title="Open access">
        <div className="flex flex-wrap gap-1.5">
          {OA_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              active={filters.oa.includes(o.value)}
              onClick={() => onChange({ oa: toggle(filters.oa, o.value) })}
            >
              {o.label}
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="Publication fee (APC)">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Maximum APC">
          {APC_OPTIONS.map((o) => (
            <Chip
              key={o.value || "any"}
              active={filters.apcMax === o.value}
              onClick={() => onChange({ apcMax: o.value })}
            >
              {o.label}
            </Chip>
          ))}
        </div>
        <p className="text-muted-foreground text-[11px]">
          Subscription journals charge no APC; journals with an unknown fee are hidden by a limit.
        </p>
      </Section>
      <Section title="Rank">
        <div className="flex flex-wrap gap-1.5">
          {JOURNAL_RANKS.map((r) => (
            <Chip
              key={r}
              active={filters.jranks.includes(r)}
              onClick={() => onChange({ jranks: toggle(filters.jranks, r) })}
            >
              <span className="font-mono">{r.startsWith("CCF") ? r : `CORE ${r}`}</span>
            </Chip>
          ))}
        </div>
        <p className="text-muted-foreground text-[11px]">
          CORE journal ranks are the final 2020 edition; SJR quartiles are not shown (see Sources).
        </p>
      </Section>
      <SubfieldSection filters={filters} onChange={onChange} counts={subfieldCounts} />
      <Section title="Publisher">
        <div className="flex flex-wrap gap-1.5">
          {publishers.map(([name, n]) => (
            <Chip
              key={name}
              active={filters.publishers.includes(name)}
              count={n}
              onClick={() => onChange({ publishers: toggle(filters.publishers, name) })}
            >
              {name}
            </Chip>
          ))}
        </div>
      </Section>
    </div>
  );
}

/** Special-issues tab: deadline window, closed calls, subfield. */
function SpecialRail({
  filters,
  onChange,
  counts,
}: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  counts: Map<string, number>;
}) {
  const isDefault = !filters.window && !filters.showPassed && !filters.subfields.length;
  return (
    <div className="space-y-5">
      <ResetHeader filters={filters} onChange={onChange} isDefault={isDefault} />
      <Section title="Deadline">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Deadline window">
          {WINDOWS.filter((w) => w.value !== "custom").map((w) => (
            <Chip
              key={w.value || "any"}
              active={filters.window === w.value}
              onClick={() => onChange({ window: w.value })}
            >
              {w.label}
            </Chip>
          ))}
        </div>
        <Toggle
          id="f-passed"
          label="Hide closed calls"
          checked={!filters.showPassed}
          onChange={(v) => onChange({ showPassed: !v })}
        />
      </Section>
      <SubfieldSection filters={filters} onChange={onChange} counts={counts} />
    </div>
  );
}

export function FilterRail({
  filters,
  onChange,
  rows,
  mode = "events",
  journals = [],
  specialSubfields,
}: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  rows: ExplorerRow[];
  mode?: RailMode;
  journals?: JournalListRow[];
  specialSubfields?: Map<string, number>;
}) {
  if (mode === "journals")
    return <JournalRail filters={filters} onChange={onChange} journals={journals} />;
  if (mode === "special")
    return (
      <SpecialRail filters={filters} onChange={onChange} counts={specialSubfields ?? new Map()} />
    );
  return <EventRail filters={filters} onChange={onChange} rows={rows} />;
}

function EventRail({
  filters,
  onChange,
  rows,
}: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  rows: ExplorerRow[];
}) {
  const countryCounts = useMemo(() => {
    const m = new Map<string, { name: string; n: number }>();
    for (const r of rows) {
      if (!r.countryCode) continue;
      const cur = m.get(r.countryCode) ?? { name: r.country ?? r.countryCode, n: 0 };
      cur.n++;
      m.set(r.countryCode, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 14);
  }, [rows]);

  const subfieldCounts = useMemo(() => countSubfields(rows), [rows]);

  const isDefault =
    JSON.stringify({
      ...filters,
      tab: "all",
      q: "",
      view: "list",
      sort: "deadline",
      jsort: DEFAULT_FILTERS.jsort,
    }) === JSON.stringify({ ...DEFAULT_FILTERS });

  return (
    <div className="space-y-5">
      <ResetHeader filters={filters} onChange={onChange} isDefault={isDefault} />

      <Section title="Deadline">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Deadline window">
          {WINDOWS.map((w) => (
            <Chip
              key={w.value || "any"}
              active={filters.window === w.value}
              onClick={() => onChange({ window: w.value })}
            >
              {w.label}
            </Chip>
          ))}
        </div>
        {filters.window === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="date"
              aria-label="Deadline from"
              value={filters.dlFrom}
              onChange={(e) => onChange({ dlFrom: e.target.value })}
              className="h-8 font-mono text-xs"
            />
            <Input
              type="date"
              aria-label="Deadline to"
              value={filters.dlTo}
              onChange={(e) => onChange({ dlTo: e.target.value })}
              className="h-8 font-mono text-xs"
            />
          </div>
        )}
        <Toggle
          id="f-passed"
          label="Hide past editions"
          checked={!filters.showPassed}
          onChange={(v) => onChange({ showPassed: !v })}
        />
      </Section>

      <Section title="Type">
        <div className="flex flex-wrap gap-1.5">
          {EVENT_TYPES.filter((t) =>
            filters.tab === "workshops"
              ? t === "workshop"
              : filters.tab === "conferences"
                ? t !== "workshop"
                : true,
          ).map((t) => (
            <Chip
              key={t}
              active={filters.types.includes(t)}
              onClick={() => onChange({ types: toggle(filters.types, t) })}
            >
              {EVENT_TYPE_LABEL[t]}
            </Chip>
          ))}
        </div>
      </Section>

      <SubfieldSection filters={filters} onChange={onChange} counts={subfieldCounts} />

      <Section title="Rank">
        <div className="flex flex-wrap gap-1.5">
          {RANK_FILTERS.map((r) => (
            <Chip
              key={r}
              active={filters.ranks.includes(r)}
              onClick={() => onChange({ ranks: toggle(filters.ranks, r) })}
            >
              <span className="font-mono">
                {r === "unranked" ? "Unranked" : r.startsWith("CCF") ? r : `CORE ${r}`}
              </span>
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Where">
        <div className="flex flex-wrap gap-1.5">
          {CONTINENTS.map((c) => (
            <Chip
              key={c}
              active={filters.continents.includes(c)}
              onClick={() => onChange({ continents: toggle(filters.continents, c) })}
            >
              {c}
            </Chip>
          ))}
        </div>
        {countryCounts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {countryCounts.map(([code, { name, n }]) => (
              <Chip
                key={code}
                active={filters.countries.includes(code)}
                count={n}
                onClick={() => onChange({ countries: toggle(filters.countries, code) })}
              >
                {name}
              </Chip>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {MODES.map((m) => (
            <Chip
              key={m}
              active={filters.modes.includes(m)}
              onClick={() => onChange({ modes: toggle(filters.modes, m) })}
            >
              {MODE_LABEL[m]}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Event dates">
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date"
            aria-label="Event starts after"
            value={filters.evFrom}
            onChange={(e) => onChange({ evFrom: e.target.value })}
            className="h-8 font-mono text-xs"
          />
          <Input
            type="date"
            aria-label="Event starts before"
            value={filters.evTo}
            onChange={(e) => onChange({ evTo: e.target.value })}
            className="h-8 font-mono text-xs"
          />
        </div>
      </Section>

      <Section title="Submission">
        <div className="space-y-3">
          <Toggle
            id="f-abstract"
            label="Has abstract deadline"
            checked={filters.hasAbstract}
            onChange={(v) => onChange({ hasAbstract: v })}
          />
          <Toggle
            id="f-rebuttal"
            label="Has rebuttal"
            hint="When known from the CFP"
            checked={filters.hasRebuttal}
            onChange={(v) => onChange({ hasRebuttal: v })}
          />
          <Toggle
            id="f-blind"
            label="Double-blind"
            hint="When known from the CFP"
            checked={filters.doubleBlind}
            onChange={(v) => onChange({ doubleBlind: v })}
          />
        </div>
      </Section>

      <Toggle
        id="f-community"
        label="Show community-listed"
        hint="Unranked calls found only on WikiCFP"
        checked={filters.community}
        onChange={(v) => onChange({ community: v })}
      />
    </div>
  );
}
