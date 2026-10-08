import type { Metadata } from "next";
import { Suspense } from "react";
import { GlobalAssistant } from "@/components/assistant/global-assistant";
import { Explorer } from "@/components/explore/explorer";
import { ExplorerSkeleton } from "@/components/explore/explorer-skeleton";
import { Container } from "@/components/shell/states";
import { getExplorerRows, withDbFallback } from "@/lib/data/events";
import { nextDeadline, parseFilters } from "@/lib/explore/filters";

export const metadata: Metadata = {
  title: "Explore",
  description:
    "Every AI/ML conference and workshop — filter by deadline, subfield, rank and place.",
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
  const filters = parseFilters(sp);
  const res = await withDbFallback([], getExplorerRows);
  // The default view (upcoming, ranked/structured sources) ships only what it shows; asking for
  // passed or community-listed calls makes the client re-request the full set.
  const now = requestTime();
  const full = filters.showPassed || filters.community;
  const today = new Date(now).toISOString().slice(0, 10);
  const rows = full
    ? res.data
    : res.data.filter((r) => {
        if (r.communityOnly) return false;
        const nd = nextDeadline(r, now);
        return nd ? !nd.passed : r.startDate == null || r.startDate >= today;
      });
  const dataState =
    res.error == null ? "ok" : res.error === "not-configured" ? "not-configured" : "error";
  return (
    <Explorer
      rows={rows}
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
      <Suspense fallback={<ExplorerSkeleton />}>
        <ExplorerLoader searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}
