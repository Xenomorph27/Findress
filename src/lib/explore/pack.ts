import type { ExplorerRow, RowDeadline } from "@/lib/data/types";

/**
 * Columnar packing for the explorer's row data. The page ships every current row to the browser
 * (filtering is client-side), and with ~600 rows the repeated key names were ~40% of the
 * payload. Packed: the key list once, then one value array per row.
 */
export interface Packed<T> {
  k: (keyof T & string)[];
  v: unknown[][];
}

export function packObjects<T extends object>(items: T[]): Packed<T> {
  if (items.length === 0) return { k: [], v: [] };
  const keys = Object.keys(items[0]) as (keyof T & string)[];
  return { k: keys, v: items.map((it) => keys.map((key) => it[key])) };
}

export function unpackObjects<T extends object>(packed: Packed<T>): T[] {
  const { k, v } = packed;
  return v.map((values) => {
    const out: Record<string, unknown> = {};
    for (let i = 0; i < k.length; i++) out[k[i]] = values[i];
    return out as T;
  });
}

/**
 * Explorer rows go one step further: their nested deadline and parent objects become tuples,
 * and `sources` (only used server-side) stays behind.
 */
type DeadlineTuple = [RowDeadline["kind"], number, string | null];
type ParentTuple = [string, string, number];
type WireRow = Omit<ExplorerRow, "deadlines" | "parent" | "sources"> & {
  deadlines: DeadlineTuple[];
  parent: ParentTuple | null;
};

export function packExplorerRows(rows: ExplorerRow[]): Packed<WireRow> {
  return packObjects<WireRow>(
    rows.map((r) => {
      const wire: Partial<ExplorerRow> = { ...r };
      delete wire.sources;
      return {
        ...(wire as Omit<ExplorerRow, "sources">),
        deadlines: r.deadlines.map((d) => [d.kind, d.at, d.label] as DeadlineTuple),
        parent: r.parent ? [r.parent.slug, r.parent.acronym, r.parent.year] : null,
      };
    }),
  );
}

export function unpackExplorerRows(packed: Packed<WireRow>): ExplorerRow[] {
  return unpackObjects(packed).map((r) => ({
    ...r,
    deadlines: r.deadlines.map(([kind, at, label]) => ({ kind, at, label })),
    parent: r.parent ? { slug: r.parent[0], acronym: r.parent[1], year: r.parent[2] } : null,
    sources: [],
  }));
}

export type PackedExplorerRows = Packed<WireRow>;
