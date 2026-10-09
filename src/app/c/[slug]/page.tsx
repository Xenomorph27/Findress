import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, ViewTransition } from "react";
import { AssistantSlot } from "@/components/assistant/assistant-slot";
import { AcceptanceChart } from "@/components/event/acceptance-chart";
import { CfpText } from "@/components/event/cfp-text";
import {
  ChipList,
  LocationLabel,
  ModeChip,
  Ranks,
  TopicLine,
  TypeBadge,
} from "@/components/event/chips";
import { CollapsibleText } from "@/components/event/collapsible-text";
import { CountdownChip } from "@/components/event/countdown-chip";
import { EventActions } from "@/components/event/event-actions";
import { EventDetailSkeleton } from "@/components/event/event-detail-skeleton";
import { TimelineRibbon } from "@/components/event/timeline-ribbon";
import { NotesSlot } from "@/components/workspace/notes-slot";
import { Container, EmptyState } from "@/components/shell/states";
import { getEventDetail, getEventMeta, withDbFallback } from "@/lib/data/events";
import type { EventDetail } from "@/lib/data/types";
import { SOURCE_META, SUBFIELD_LABEL, type SourceName, type SubfieldId } from "@/lib/taxonomy";
import { formatDateRange } from "@/lib/time/format";

export async function generateMetadata(props: PageProps<"/c/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const meta = await withDbFallback(null, () => getEventMeta(slug));
  const e = meta.data;
  if (!e) return { title: "Event" };
  const where = [e.city, e.country].filter(Boolean).join(", ");
  return {
    title: `${e.acronym} ${e.year}`,
    description: `${e.name ?? e.acronym}${where ? ` — ${where}` : ""}. Deadlines, call for papers and history.`,
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

function Header({ e }: { e: EventDetail }) {
  const dates = formatDateRange(e.startDate, e.endDate);
  return (
    <header className="space-y-5 pt-8 md:pt-12">
      <nav
        aria-label="Breadcrumb"
        className="text-muted-foreground flex items-center gap-1.5 text-xs"
      >
        <Link href="/explore" className="hover:text-foreground">
          Explore
        </Link>
        <span aria-hidden>/</span>
        {e.parent && (
          <>
            <Link href={`/c/${e.parent.slug}`} className="hover:text-foreground">
              {e.parent.acronym} {e.parent.year}
            </Link>
            <span aria-hidden>/</span>
          </>
        )}
        <span className="text-foreground">
          {e.acronym} {e.year}
        </span>
      </nav>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <TypeBadge type={e.type} />
        <Ranks core={e.rankCore} ccf={e.rankCcf} />
        <ModeChip mode={e.mode} />
      </div>
      <div>
        <ViewTransition name={`acronym-${e.slug}`}>
          <h1 className="font-heading text-3xl leading-tight md:text-5xl">
            {e.acronym} <span className="text-muted-foreground">{e.year}</span>
          </h1>
        </ViewTransition>
        <p className="text-muted-foreground mt-3 max-w-3xl text-base text-balance">
          {e.name ?? "Full name not announced"}
        </p>
      </div>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">When</dt>
        <dd className="font-mono">{dates ?? e.dateText ?? NA}</dd>
        <dt className="text-muted-foreground">Where</dt>
        <dd className="min-w-0 break-words">
          {e.city || e.country ? (
            <LocationLabel city={e.city} country={e.country} countryCode={e.countryCode} />
          ) : (
            NA
          )}
          {e.venue && <span className="text-muted-foreground"> · {e.venue}</span>}
        </dd>
      </dl>
      <EventActions
        eventId={e.id}
        slug={e.slug}
        title={`${e.acronym} ${e.year}`}
        website={e.website}
      />
    </header>
  );
}

function CfpSection({ e }: { e: EventDetail }) {
  const chips = e.cfpTopics.length ? e.cfpTopics : e.topics;
  return (
    <Section
      id="cfp"
      title="Call for papers"
      aside={
        e.cfpFetchedAt && e.cfpUrl ? (
          <p className="text-muted-foreground text-xs">
            Fetched {new Date(e.cfpFetchedAt).toISOString().slice(0, 10)} from{" "}
            <a
              href={e.cfpUrl}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              {new URL(e.cfpUrl).host}
            </a>
          </p>
        ) : null
      }
    >
      {(chips.length > 0 || e.subfields.length > 0) && (
        <div className="mb-6 space-y-3" aria-label="Topics of interest">
          <ChipList items={e.subfields.map((s) => SUBFIELD_LABEL[s as SubfieldId] ?? s)} active />
          <TopicLine items={chips} max={24} />
        </div>
      )}
      {e.cfpText ? (
        <CollapsibleText>
          <CfpText text={e.cfpText} />
        </CollapsibleText>
      ) : e.description ? (
        <div>
          <p className="text-muted-foreground mb-2 text-xs">
            The official page hasn’t been fetched yet; this is the description listed by the
            sources.
          </p>
          <CollapsibleText collapsedHeight={260}>
            <CfpText text={e.description} />
          </CollapsibleText>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          CFP text not available yet
          {e.website ? " — it is fetched from the official page on the next refresh." : "."}
        </p>
      )}
    </Section>
  );
}

function Essentials({ e }: { e: EventDetail }) {
  const rows: [string, React.ReactNode][] = [
    ["Page limit", e.pageLimit ?? NA],
    ["Review", e.reviewType ?? NA],
    ["Rebuttal", e.hasRebuttal ? "Yes (mentioned in the CFP)" : NA],
    [
      "Submission site",
      e.submissionSite ? (
        <a
          href={e.submissionSite}
          target="_blank"
          rel="noreferrer"
          className="text-aurora-ink break-all hover:underline"
        >
          {new URL(e.submissionSite).host}
        </a>
      ) : (
        NA
      ),
    ],
  ];
  return (
    <Section id="essentials" title="Submission essentials">
      <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground mt-3 text-xs">
        Only shown when stated in the CFP or a source — always confirm on the official page.
      </p>
    </Section>
  );
}

function Workshops({ e }: { e: EventDetail }) {
  if (e.children.length === 0) return null;
  return (
    <Section
      id="workshops"
      title="Workshops & tracks"
      aside={<span className="text-muted-foreground font-mono text-xs">{e.children.length}</span>}
    >
      <ul className="-mx-3 space-y-1">
        {e.children.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/c/${c.slug}`}
              className="tint-row-hover flex items-center justify-between gap-3 rounded-lg px-3 py-3 transition-colors"
            >
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="font-heading shrink-0 text-base">{c.acronym}</span>
                <span className="text-muted-foreground truncate text-sm">{c.name}</span>
              </span>
              <CountdownChip dueAt={c.nextDeadline?.at ?? null} />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function History({ e }: { e: EventDetail }) {
  if (e.history.length === 0 && e.acceptance.length === 0) return null;
  return (
    <Section id="history" title="History & stats">
      <div className="grid gap-8 lg:grid-cols-2">
        {e.history.length > 0 && (
          <table className="w-full text-sm">
            <caption className="text-muted-foreground mb-2 text-left text-sm">
              Past and future editions
            </caption>
            <thead className="sr-only">
              <tr>
                <th>Year</th>
                <th>Place</th>
                <th>Dates</th>
              </tr>
            </thead>
            <tbody className="divide-hairline divide-y">
              {e.history.slice(0, 10).map((h) => (
                <tr key={h.slug}>
                  <td className="py-2 pr-3 font-mono">
                    <Link href={`/c/${h.slug}`} className="hover:text-aurora-ink">
                      {h.year}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">
                    {h.city || h.country ? (
                      <LocationLabel
                        city={h.city}
                        country={h.country}
                        countryCode={h.countryCode}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="text-muted-foreground py-2 text-right font-mono text-xs">
                    {formatDateRange(h.startDate, h.endDate) ?? h.dateText ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {e.acceptance.length > 0 && (
          <div>
            <AcceptanceChart data={e.acceptance} />
            <details className="text-muted-foreground mt-2 text-xs">
              <summary className="hover:text-foreground cursor-pointer">Table view</summary>
              <table className="mt-2 w-full">
                <thead>
                  <tr className="tint-header hairline-screen text-left">
                    <th className="py-1 font-normal">Year</th>
                    <th className="py-1 text-right font-normal">Submitted</th>
                    <th className="py-1 text-right font-normal">Accepted</th>
                    <th className="py-1 text-right font-normal">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {e.acceptance.map((a) => (
                    <tr key={a.year} className="border-hairline border-t font-mono">
                      <td className="py-1">{a.year}</td>
                      <td className="tabular py-1 text-right">
                        {a.submitted?.toLocaleString() ?? "—"}
                      </td>
                      <td className="tabular py-1 text-right">
                        {a.accepted?.toLocaleString() ?? "—"}
                      </td>
                      <td className="tabular py-1 text-right">
                        {a.rate != null ? `${(a.rate * 100).toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2">
                Source: ccfddl accept_rates (each row links its original source upstream).
              </p>
            </details>
          </div>
        )}
      </div>
    </Section>
  );
}

function Sources({ e }: { e: EventDetail }) {
  const winners = new Map<string, string[]>();
  for (const [field, source] of Object.entries(e.provenance)) {
    winners.set(source, [...(winners.get(source) ?? []), field]);
  }
  return (
    <Section id="sources" title="Sources">
      <ul className="space-y-3">
        {e.sourceRefs.map((r) => {
          const meta = SOURCE_META[r.source as SourceName];
          const used = winners.get(r.source) ?? [];
          return (
            <li
              key={`${r.source}-${r.sourceId}`}
              className="bg-surface lift rounded-xl p-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{meta?.label ?? r.source}</span>
                {r.url && (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-aurora-ink text-xs hover:underline"
                  >
                    View upstream record ↗
                  </a>
                )}
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                Used for: {used.length ? used.join(", ") : "—"} · seen {r.lastSeenAt.slice(0, 10)}
              </p>
            </li>
          );
        })}
        {e.cfpUrl && (
          <li className="bg-surface lift rounded-xl p-4 text-sm">
            <span className="font-medium">Official CFP page</span>
            <p className="text-muted-foreground mt-1 text-xs">
              CFP text, topics and submission essentials · {e.cfpUrl}
            </p>
          </li>
        )}
      </ul>
    </Section>
  );
}

async function EventContent({ params }: { params: PageProps<"/c/[slug]">["params"] }) {
  const { slug } = await params;
  const res = await withDbFallback(null, () => getEventDetail(slug));
  if (res.error && res.error !== "not-configured") {
    return (
      <EmptyState title="The archive is unreachable" className="mt-12">
        The database didn’t answer. Try again in a moment.
      </EmptyState>
    );
  }
  const e = res.data;
  if (!e) notFound();
  return (
    <div className="grid gap-10 lg:grid-cols-12">
      <div className="min-w-0 space-y-14 lg:col-span-8">
        <Header e={e} />
        <TimelineRibbon deadlines={e.deadlines} startDate={e.startDate} endDate={e.endDate} />
        <CfpSection e={e} />
        <Workshops e={e} />
        <Essentials e={e} />
        <History e={e} />
        <NotesSlot eventId={e.id} />
        <Sources e={e} />
      </div>
      <aside className="min-w-0 lg:col-span-4" aria-label="Assistant">
        <div className="lg:sticky lg:top-20 lg:pt-12">
          <AssistantSlot
            event={{
              id: e.id,
              slug: e.slug,
              acronym: e.acronym,
              year: e.year,
              hasCfp: Boolean(e.cfpText),
              cfpUrl: e.cfpUrl ?? e.website,
            }}
          />
        </div>
      </aside>
    </div>
  );
}

export default function EventPage(props: PageProps<"/c/[slug]">) {
  return (
    <Container>
      <Suspense fallback={<EventDetailSkeleton />}>
        <EventContent params={props.params} />
      </Suspense>
    </Container>
  );
}
