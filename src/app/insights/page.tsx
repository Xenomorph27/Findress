import type { Metadata } from "next";
import { Suspense } from "react";
import { InsightsDashboard } from "@/components/insights/insights-dashboard";
import { Container, EmptyState, PageHeader } from "@/components/shell/states";
import { Skeleton } from "@/components/ui/skeleton";
import { getInsightsPayload } from "@/lib/data/insights";
import { withDbFallback } from "@/lib/data/events";

export const metadata: Metadata = {
  title: "Insights",
  description:
    "Deadline calendar, events per month, venue map, rank mix, acceptance-rate trends and topics.",
};

async function InsightsLoader({
  searchParams,
}: {
  searchParams: PageProps<"/insights">["searchParams"];
}) {
  const sp = await searchParams;
  const subfield = typeof sp.subfield === "string" ? sp.subfield : null;
  const res = await withDbFallback(null, getInsightsPayload);
  if (!res.data || res.data.slices.all.totals.events === 0) {
    return (
      <EmptyState
        title={
          res.error === "not-configured" || !res.error
            ? "No data yet"
            : "The archive is unreachable"
        }
      >
        Insights appear once ingestion has run.
      </EmptyState>
    );
  }
  return <InsightsDashboard payload={res.data} initialSubfield={subfield} />;
}

function InsightsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[74px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-56 rounded-2xl" />
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}

export default function InsightsPage(props: PageProps<"/insights">) {
  return (
    <Container>
      <PageHeader eyebrow="Insights" title="The shape of the year">
        Where and when the AI/ML community submits, every chart one click from the venues behind it.
      </PageHeader>
      <Suspense fallback={<InsightsSkeleton />}>
        <InsightsLoader searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}
