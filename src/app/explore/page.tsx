import type { Metadata } from "next";
import { Suspense } from "react";
import { GlobalAssistant } from "@/components/assistant/global-assistant";
import { Explorer } from "@/components/explore/explorer";
import { ExplorerSkeleton } from "@/components/explore/explorer-skeleton";
import { Container } from "@/components/shell/states";
import { getExplorerRows, withDbFallback } from "@/lib/data/events";
import { parseFilters } from "@/lib/explore/filters";

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
  const dataState =
    res.error == null ? "ok" : res.error === "not-configured" ? "not-configured" : "error";
  return (
    <Explorer
      rows={res.data}
      initialFilters={filters}
      initialNow={requestTime()}
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
