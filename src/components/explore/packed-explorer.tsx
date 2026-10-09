"use client";

import { type ComponentProps, useMemo } from "react";
import type { JournalListRow } from "@/lib/data/types";
import {
  type Packed,
  type PackedExplorerRows,
  unpackExplorerRows,
  unpackObjects,
} from "@/lib/explore/pack";
import { Explorer } from "./explorer";

type ExplorerProps = ComponentProps<typeof Explorer>;

/** Explorer fed by the packed (columnar) row payload; unpacks once on the client. */
export function PackedExplorer({
  packedRows,
  packedJournals,
  ...rest
}: Omit<ExplorerProps, "rows" | "journals"> & {
  packedRows: PackedExplorerRows;
  packedJournals: Packed<JournalListRow>;
}) {
  const rows = useMemo(() => unpackExplorerRows(packedRows), [packedRows]);
  const journals = useMemo(() => unpackObjects(packedJournals), [packedJournals]);
  return <Explorer rows={rows} journals={journals} {...rest} />;
}
