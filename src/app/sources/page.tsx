import { AlertTriangle, CheckCircle2, CircleDashed, Clock } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { RefreshButton } from "@/components/sources/refresh-button";
import { Container, EmptyState, PageHeader } from "@/components/shell/states";
import { Skeleton } from "@/components/ui/skeleton";
import { withDbFallback } from "@/lib/data/events";
import { getSourcesOverview, type SourceHealth } from "@/lib/data/sources";
import { SOURCE_META, type SourceName } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Sources",
  description: "Where FIndress data comes from, when each source was last pulled, and what failed.",
};

const STALE_MS = 48 * 3600_000;

function ago(iso: string | null, now: number): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

function Status({ h, now }: { h: SourceHealth; now: number }) {
  if (!h.lastRun) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
        <CircleDashed className="size-3.5" aria-hidden /> Never run
      </span>
    );
  }
  if (h.lastRun.ok === false) {
    return (
      <span className="text-heat-hot inline-flex items-center gap-1.5 text-xs">
        <AlertTriangle className="size-3.5" aria-hidden /> Last run failed
      </span>
    );
  }
  if (h.lastRun.ok == null) {
    return (
      <span className="text-heat-warm inline-flex items-center gap-1.5 text-xs">
        <Clock className="size-3.5" aria-hidden /> Running
      </span>
    );
  }
  const stale = h.lastSuccessAt && now - Date.parse(h.lastSuccessAt) > STALE_MS;
  return stale ? (
    <span className="text-heat-warm inline-flex items-center gap-1.5 text-xs">
      <Clock className="size-3.5" aria-hidden /> Stale
    </span>
  ) : (
    <span className="text-aurora-ink inline-flex items-center gap-1.5 text-xs">
      <CheckCircle2 className="size-3.5" aria-hidden /> Healthy
    </span>
  );
}

function SourceCard({ h, now }: { h: SourceHealth; now: number }) {
  const meta = SOURCE_META[h.source as SourceName];
  const stats = h.lastRun?.stats ?? {};
  return (
    <li className="border-hairline bg-surface/50 rounded-2xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-xl">{meta?.label ?? h.source}</h2>
            <span className="border-hairline text-muted-foreground rounded border px-1.5 text-xs font-medium uppercase">
              {meta?.kind ?? "list"}
            </span>
          </div>
          <p className="text-muted-foreground mt-1 max-w-xl text-sm">{meta?.description}</p>
          {meta?.url && (
            <a
              href={meta.url}
              target="_blank"
              rel="noreferrer"
              className="text-aurora-ink mt-1 inline-block text-xs hover:underline"
            >
              {new URL(meta.url).host}
            </a>
          )}
        </div>
        <RefreshButton step={h.source} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground text-xs">Status</dt>
          <dd className="mt-0.5">
            <Status h={h} now={now} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Last updated</dt>
          <dd className="mt-0.5 font-mono text-xs">{ago(h.lastSuccessAt, now)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Items</dt>
          <dd className="mt-0.5 font-mono text-xs">{h.items.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Recent runs</dt>
          <dd
            className="mt-1.5 flex gap-1"
            aria-label={`${h.recentRuns.filter((r) => r.ok).length} of ${h.recentRuns.length} recent runs succeeded`}
          >
            {h.recentRuns
              .slice()
              .reverse()
              .map((r) => (
                <span
                  key={r.startedAt}
                  title={`${r.startedAt.slice(0, 16).replace("T", " ")} UTC · ${r.ok == null ? "running" : r.ok ? `${r.items} items` : "failed"}`}
                  className={cn(
                    "h-3 w-1.5 rounded-sm",
                    r.ok == null ? "bg-heat-warm" : r.ok ? "bg-aurora-1" : "bg-heat-hot",
                  )}
                />
              ))}
          </dd>
        </div>
      </dl>
      {Object.keys(stats).length > 0 && (
        <p className="text-muted-foreground mt-3 text-xs">
          {Object.entries(stats)
            .map(([k, v]) => `${k} ${v}`)
            .join(" · ")}
        </p>
      )}
      {h.lastRun?.error && (
        <p className="bg-surface-2/70 text-muted-foreground mt-2 rounded-lg px-3 py-2 text-xs break-words">
          {h.lastRun.ok === false ? "Error: " : "Warnings: "}
          {h.lastRun.error}
        </p>
      )}
    </li>
  );
}

function requestTime() {
  return Date.now();
}

async function SourcesContent() {
  await connection(); // "last updated" is relative to the request time
  const res = await withDbFallback(null, getSourcesOverview);
  if (!res.data || res.data.sources.length === 0) {
    return (
      <EmptyState
        title={
          res.error && res.error !== "not-configured" ? "The archive is unreachable" : "No data yet"
        }
      >
        Connect a database and run <code className="font-mono">pnpm ingest</code>.
      </EmptyState>
    );
  }
  const { sources, merge, totals } = res.data;
  const now = requestTime();
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Events", totals.events],
          ["Workshops", totals.workshops],
          ["With CFP text", totals.withCfp],
          ["On the map", totals.geocoded],
          ["Journals", totals.journals],
          ["Special issues", totals.specialIssues],
        ].map(([label, value]) => (
          <div key={label} className="border-hairline bg-surface/50 rounded-xl border px-4 py-3">
            <p className="text-muted-foreground text-xs">{label}</p>
            <p className="mt-1 font-mono text-xl">{Number(value).toLocaleString()}</p>
          </div>
        ))}
      </div>
      <div className="border-hairline flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          Cross-source merge last ran{" "}
          <span className="text-foreground font-mono">
            {ago(merge?.lastSuccessAt ?? null, now)}
          </span>{" "}
          · refreshed daily by Vercel Cron and every 6 hours by a GitHub Action.
        </span>
        <RefreshButton step="all" label="Refresh everything" />
      </div>
      <ul className="space-y-4">
        {sources.map((h) => (
          <SourceCard key={h.source} h={h} now={now} />
        ))}
      </ul>
    </div>
  );
}

export default function SourcesPage() {
  return (
    <Container>
      <PageHeader eyebrow="Transparency" title="Sources">
        Every fact in FIndress comes from an open source. Here is when each was last pulled, how
        much it contributed, and what went wrong.
      </PageHeader>
      <Suspense
        fallback={
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
        }
      >
        <SourcesContent />
      </Suspense>
    </Container>
  );
}
