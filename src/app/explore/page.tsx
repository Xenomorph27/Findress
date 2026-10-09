import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { GlobalAssistant } from "@/components/assistant/global-assistant";
import { PackedExplorer } from "@/components/explore/packed-explorer";
import { ExplorerSkeleton } from "@/components/explore/explorer-skeleton";
import { Container } from "@/components/shell/states";
import { getExplorerRows, withDbFallback } from "@/lib/data/events";
import { getJournalRows, getSpecialIssueRows } from "@/lib/data/journals";
import { inDefaultScope, parseFilters } from "@/lib/explore/filters";
import { packExplorerRows, packObjects } from "@/lib/explore/pack";

export const metadata: Metadata = {
  title: "Explore",
  description:
    "Every AI/ML conference, workshop, journal and special issue — filter by deadline, subfield, rank, open access and place.",
};

/** Request time for the first render (client components keep their own ticking clock). */
function requestTime(): number {
  return Date.now();
}

async function ExplorerLoader({
  searchParams,
}: {
  searchParams: PageProps<"/explore">["searchParams"];
}) {
  const sp = await searchParams;
  await connection(); // the row set and countdowns depend on the request time
  const filters = parseFilters(sp);
  const [res, journalRes, specialRes] = await Promise.all([
    withDbFallback([], getExplorerRows),
    withDbFallback([], getJournalRows),
    withDbFallback([], getSpecialIssueRows),
  ]);
  // The default view (current editions from ranked/structured sources) ships only what it
  // shows; asking for past editions or community-listed calls re-requests the full set.
  const now = requestTime();
  const full = filters.showPassed || filters.community;
  const rows = full ? res.data : res.data.filter((r) => inDefaultScope(r, now));
  const dataState =
    res.error == null ? "ok" : res.error === "not-configured" ? "not-configured" : "error";
  return (
    <PackedExplorer
      packedRows={packExplorerRows(rows)}
      packedJournals={packObjects(journalRes.data)}
      specials={specialRes.data}
      scope={full ? "full" : "upcoming"}
      initialFilters={filters}
      initialNow={now}
      dataState={dataState}
      assistant={<GlobalAssistant />}
    />
  );
}

export default function ExplorePage(props: PageProps<"/explore">) {
  return (
    <Container>
      {/* Static shell: the title and intro paint at first byte, before the row data streams in. */}
      <header className="pt-8 md:pt-10">
        <h1 className="font-heading text-3xl leading-tight md:text-5xl">Explore</h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-base">
          Every AI/ML conference, workshop, journal and special issue in one list. Filter by
          deadline, subfield, rank, open access and place.
        </p>
      </header>
      <Suspense fallback={<ExplorerSkeleton />}>
        <ExplorerLoader searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}
