import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AssistantSlot } from "@/components/assistant/assistant-slot";
import { CfpText } from "@/components/event/cfp-text";
import { ChipList, Ranks, TopicLine, TypeBadge } from "@/components/event/chips";
import { CollapsibleText } from "@/components/event/collapsible-text";
import { EventActions } from "@/components/event/event-actions";
import { EventDetailSkeleton } from "@/components/event/event-detail-skeleton";
import { TimelineRibbon } from "@/components/event/timeline-ribbon";
import { OaBadge } from "@/components/explore/journal-rows";
import { formatApc } from "@/lib/journals/format";
import { JournalCountsChart } from "@/components/journal/counts-chart";
import { SpecialIssueList } from "@/components/journal/special-issue-list";
import { Container, EmptyState } from "@/components/shell/states";
import { NotesSlot } from "@/components/workspace/notes-slot";
import { withDbFallback } from "@/lib/data/events";
import { getJournalDetail, getJournalMeta } from "@/lib/data/journals";
import type { DetailDeadline, JournalDetail } from "@/lib/data/types";
import { SUBFIELD_LABEL, type SubfieldId } from "@/lib/taxonomy";

export async function generateMetadata(props: PageProps<"/j/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const meta = await withDbFallback(null, () => getJournalMeta(slug));
  const j = meta.data;
  if (!j) return { title: "Journal" };
  return {
    title: `${j.abbreviation} — ${j.name}`,
    description: `${j.name}${j.publisher ? ` (${j.publisher})` : ""}: aims & scope, open access and fees, metrics, rankings and special-issue deadlines.`,
  };
}

const NA = <span className="text-muted-foreground">Not announced</span>;

function Section({
  id,
  title,
  children,
  aside,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="scroll-mt-24">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="font-heading text-xl">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="bg-surface/60 min-w-0 rounded-xl px-4 py-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="tabular mt-0.5 font-mono text-xl leading-tight">{value ?? "—"}</dd>
      {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}

const PROVENANCE_LABEL: Record<string, string> = {
  openalex: "OpenAlex",
  crossref: "Crossref",
  ccf: "CCF list",
  core: "CORE portal",
  "journal-site": "journal site",
  "journal site": "journal site",
};

function Header({ j }: { j: JournalDetail }) {
  const calls = j.specialIssues.length;
  const jif = j.impactMetrics.find((m) => /^journal impact factor$/i.test(m.name));
  return (
    <header className="space-y-5 pt-8 md:pt-12">
      <nav
        aria-label="Breadcrumb"
        className="text-muted-foreground flex items-center gap-1.5 text-xs"
      >
        <Link href="/explore?tab=journals" className="hover:text-foreground">
          Journals
        </Link>
        <span aria-hidden>/</span>
        <span className="text-foreground">{j.abbreviation}</span>
      </nav>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <TypeBadge type="journal" />
        <OaBadge value={j.openAccess} />
        <Ranks core={j.rankCoreJournal} ccf={j.rankCcf} />
      </div>
      <div>
        <h1 className="font-heading text-3xl leading-tight md:text-5xl">{j.abbreviation}</h1>
        <p className="text-muted-foreground mt-3 max-w-3xl text-base text-balance">
          {j.name}
          {j.publisher && <span className="opacity-80"> · {j.publisher}</span>}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="h-index" value={j.hIndex} hint="OpenAlex" />
        <Stat
          label="2-yr mean citedness"
          value={j.twoYrMeanCitedness?.toFixed(2) ?? null}
          hint="OpenAlex"
        />
        <Stat
          label={jif ? `Impact factor ${jif.year ?? ""}`.trim() : "Works indexed"}
          value={jif ? jif.value : (j.worksCount?.toLocaleString() ?? null)}
          hint={jif ? jif.source : "OpenAlex"}
        />
        <Stat
          label="Publication fee"
          value={
            j.apcUsd != null ? (j.apcUsd === 0 ? "None" : `$${j.apcUsd.toLocaleString()}`) : null
          }
          hint={
            j.apcUsd == null
              ? formatApc(j)
              : j.apcUsd === 0
                ? "Journal site · no author fees"
                : `${j.provenance.apcUsd === "openalex" ? "OpenAlex" : "Journal site"}${j.openAccess === "hybrid" ? " · optional OA" : ""}`
          }
        />
      </dl>
      <p className="text-muted-foreground text-sm">
        Rolling submissions
        {calls > 0 && ` · ${calls} special-issue ${calls === 1 ? "call" : "calls"} on record`}
        {j.avgTimeToFirstDecision && ` · first decision in ${j.avgTimeToFirstDecision} (median)`}
      </p>
      <EventActions
        eventId={j.id}
        kind="journal"
        slug={j.slug}
        title={j.abbreviation}
        website={j.homepage}
        websiteLabel="Journal site"
        icsHref={
          j.specialIssues.some((c) => c.submissionDeadlineUtc)
            ? `/api/journals/${j.slug}/ics`
            : null
        }
        icsLabel="Special-issue dates"
      />
    </header>
  );
}

function ScopeSection({ j }: { j: JournalDetail }) {
  return (
    <Section
      id="scope"
      title="Aims & scope"
      aside={
        j.scopeFetchedAt && j.scopeUrl ? (
          <p className="text-muted-foreground text-xs">
            Fetched {j.scopeFetchedAt.slice(0, 10)} from{" "}
            <a
              href={j.scopeUrl}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              {new URL(j.scopeUrl).host}
            </a>
          </p>
        ) : null
      }
    >
      {(j.subfields.length > 0 || j.topics.length > 0) && (
        <div className="mb-6 space-y-3" aria-label="Topics">
          <ChipList items={j.subfields.map((s) => SUBFIELD_LABEL[s as SubfieldId] ?? s)} active />
          <TopicLine items={j.topics} />
        </div>
      )}
      {j.scopeText ? (
        <CollapsibleText>
          <CfpText text={j.scopeText} />
        </CollapsibleText>
      ) : (
        <p className="text-muted-foreground text-sm">
          The aims & scope page isn’t available to FIndress
          {j.homepage ? (
            <>
              {" "}
              (the publisher blocks automated readers) — read it on the{" "}
              <a
                href={j.homepage}
                target="_blank"
                rel="noreferrer"
                className="text-aurora-ink hover:underline"
              >
                journal site
              </a>
              .
            </>
          ) : (
            "."
          )}{" "}
          Topic chips above come from OpenAlex.
        </p>
      )}
    </Section>
  );
}

function SpecialIssues({ j }: { j: JournalDetail }) {
  const dated: DetailDeadline[] = j.specialIssues
    .filter((c) => c.submissionDeadlineUtc)
    .map((c) => ({
      kind: "Special issue",
      label: c.title,
      dueAtUtc: c.submissionDeadlineUtc!,
      originalTz: null,
      originalText: c.deadlineText,
      comment: null,
      source: c.source,
    }));
  return (
    <Section
      id="special-issues"
      title="Special issues"
      aside={
        <span className="text-muted-foreground font-mono text-xs">{j.specialIssues.length}</span>
      }
    >
      {j.specialIssues.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No special-issue calls found for {j.abbreviation} yet. Calls appear here when the
          journal’s page or WikiCFP lists one.
        </p>
      ) : (
        <div className="space-y-6">
          {dated.length > 0 && <TimelineRibbon deadlines={dated} startDate={null} endDate={null} />}
          <SpecialIssueList calls={j.specialIssues} journalAbbr={j.abbreviation} />
        </div>
      )}
    </Section>
  );
}

function Submission({ j }: { j: JournalDetail }) {
  const link = (href: string | null) =>
    href ? (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-aurora-ink break-all hover:underline"
      >
        {new URL(href).host}
        {new URL(href).pathname.length > 1 ? new URL(href).pathname : ""}
      </a>
    ) : (
      NA
    );
  const rows: [string, React.ReactNode][] = [
    ["Submissions", "Rolling — accepted all year"],
    ["Submission guidelines", link(j.submissionUrl)],
    ["Journal site", link(j.homepage)],
    ["Open access", j.openAccess ? <OaBadge value={j.openAccess} /> : NA],
    ["Publication fee", formatApc(j)],
    ["Review model", j.reviewModel ?? NA],
    [
      "Time to first decision",
      j.avgTimeToFirstDecision
        ? `${j.avgTimeToFirstDecision} (median, published by the journal)`
        : NA,
    ],
    [
      "ISSN",
      j.issns.length ? (
        <span className="font-mono">
          {j.issnPrint && `${j.issnPrint} (print)`}
          {j.issnPrint && j.issnOnline && " · "}
          {j.issnOnline && `${j.issnOnline} (online)`}
          {!j.issnPrint && !j.issnOnline && j.issns.join(", ")}
        </span>
      ) : (
        <span className="text-muted-foreground">Not assigned yet</span>
      ),
    ],
  ];
  return (
    <Section id="submission" title="Submission">
      <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground mt-3 text-xs">
        Only shown when the journal or an open source states it — always confirm on the journal
        site.
      </p>
    </Section>
  );
}

function Metrics({ j }: { j: JournalDetail }) {
  return (
    <Section
      id="metrics"
      title="Metrics"
      aside={
        j.metricsAsOf ? (
          <p className="text-muted-foreground text-xs">
            OpenAlex, as of {j.metricsAsOf.slice(0, 10)}
          </p>
        ) : null
      }
    >
      <div className="space-y-8">
        <table className="w-full text-sm">
          <caption className="sr-only">Journal metrics with their source</caption>
          <thead>
            <tr className="text-muted-foreground text-left text-xs">
              <th className="py-1.5 font-normal">Metric</th>
              <th className="py-1.5 text-right font-normal">Value</th>
              <th className="hidden py-1.5 pl-4 font-normal sm:table-cell">Source</th>
            </tr>
          </thead>
          <tbody className="divide-hairline divide-y">
            {[
              ["h-index", j.hIndex?.toLocaleString(), "OpenAlex"],
              ["i10-index", j.i10Index?.toLocaleString(), "OpenAlex"],
              ["2-year mean citedness", j.twoYrMeanCitedness?.toFixed(2), "OpenAlex"],
              ["Works indexed", j.worksCount?.toLocaleString(), "OpenAlex"],
              ["Citations", j.citedByCount?.toLocaleString(), "OpenAlex"],
              ...j.impactMetrics.map((m) => [
                `${m.name}${m.year ? ` (${m.year})` : ""}`,
                m.value,
                m.source,
              ]),
              ["CORE journal rank", j.rankCoreJournal, "CORE2020 (final edition)"],
              ["CCF rank", j.rankCcf, "CCF 2026 list"],
              ["SJR quartile", null, "not tracked (Scimago blocks automated use)"],
            ].map(([k, v, src]) => (
              <tr key={k as string}>
                <td className="py-2 pr-3">{k}</td>
                <td className="tabular py-2 text-right font-mono">{v ?? "—"}</td>
                <td className="text-muted-foreground hidden py-2 pl-4 text-xs sm:table-cell">
                  {src}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <JournalCountsChart data={j.countsByYear.slice(-12)} />
      </div>
    </Section>
  );
}

function Sources({ j }: { j: JournalDetail }) {
  const winners = new Map<string, string[]>();
  for (const [field, source] of Object.entries(j.provenance)) {
    const label = PROVENANCE_LABEL[source] ?? source;
    winners.set(label, [...(winners.get(label) ?? []), field]);
  }
  const refs: { label: string; href: string | null; note: string }[] = [
    {
      label: "FIndress seed list",
      href: null,
      note: "Name, abbreviation, ISSNs (verified against OpenAlex and Crossref), subfields, links",
    },
    {
      label: "OpenAlex",
      href: j.openalexId ? `https://openalex.org/${j.openalexId}` : null,
      note: `Used for: ${(winners.get("OpenAlex") ?? []).join(", ") || "—"}`,
    },
    {
      label: "Crossref",
      href: j.issns[0] ? `https://api.crossref.org/journals/${j.issns[0]}` : null,
      note: "Print/online ISSN types and publisher name",
    },
  ];
  if (j.rankCcf)
    refs.push({
      label: "CCF list",
      href: "https://github.com/WenyanLiu/CCFrank4dblp",
      note: "CCF 2026 recommended journals (CCFrank4dblp data)",
    });
  if (j.rankCoreJournal)
    refs.push({
      label: "CORE portal",
      href: "https://portal.core.edu.au/jnl-ranks/",
      note: "CORE2020 journal rank — CORE stopped ranking journals in 2022",
    });
  if (winners.has("journal site"))
    refs.push({
      label: "Journal site",
      href: j.scopeUrl ?? j.homepage,
      note: `Used for: ${(winners.get("journal site") ?? []).join(", ")}`,
    });
  return (
    <Section id="sources" title="Sources">
      <ul className="space-y-3">
        {refs.map((r) => (
          <li key={r.label} className="bg-surface/50 rounded-xl p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{r.label}</span>
              {r.href && (
                <a
                  href={r.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-aurora-ink text-xs hover:underline"
                >
                  View upstream record ↗
                </a>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">{r.note}</p>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-3 text-xs">Last updated {j.updatedAt.slice(0, 10)}.</p>
    </Section>
  );
}

async function JournalContent({ params }: { params: PageProps<"/j/[slug]">["params"] }) {
  const { slug } = await params;
  const res = await withDbFallback(null, () => getJournalDetail(slug));
  if (res.error && res.error !== "not-configured") {
    return (
      <EmptyState title="The archive is unreachable" className="mt-12">
        The database didn’t answer. Try again in a moment.
      </EmptyState>
    );
  }
  const j = res.data;
  if (!j) notFound();
  const openCall = j.specialIssues.find((c) => c.submissionDeadlineUtc)?.title ?? null;
  return (
    <div className="grid gap-10 lg:grid-cols-12">
      <div className="min-w-0 space-y-14 lg:col-span-8">
        <Header j={j} />
        <ScopeSection j={j} />
        <SpecialIssues j={j} />
        <Submission j={j} />
        <Metrics j={j} />
        <NotesSlot eventId={j.id} kind="journal" />
        <Sources j={j} />
      </div>
      <aside className="min-w-0 lg:col-span-4" aria-label="Assistant">
        <div className="lg:sticky lg:top-20 lg:pt-12">
          <AssistantSlot
            journal={{
              id: j.id,
              slug: j.slug,
              abbreviation: j.abbreviation,
              hasScope: Boolean(j.scopeText),
              scopeUrl: j.scopeUrl ?? j.homepage,
              openCall,
            }}
          />
        </div>
      </aside>
    </div>
  );
}

export default function JournalPage(props: PageProps<"/j/[slug]">) {
  return (
    <Container>
      <Suspense fallback={<EventDetailSkeleton />}>
        <JournalContent params={props.params} />
      </Suspense>
    </Container>
  );
}
