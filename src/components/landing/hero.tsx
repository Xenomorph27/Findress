"use client";

import { ArrowRight, Search } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { CountdownChip } from "@/components/event/countdown-chip";
import { Button } from "@/components/ui/button";
import type { LandingData } from "@/lib/data/landing";
import { SITE_TAGLINE } from "@/lib/site";
import { formatInZone } from "@/lib/time/format";

const Globe = dynamic(() => import("./globe").then((m) => m.Globe), { ssr: false });

export function Hero({ data }: { data: LandingData }) {
  const [highlight, setHighlight] = useState<{ lat: number; lng: number } | null>(null);
  const [first, ...rest] = SITE_TAGLINE.split(". ");

  return (
    <>
      <section className="relative isolate overflow-hidden">
        {/* One slow aurora blob, behind the hero only. */}
        <div
          aria-hidden
          className="absolute top-[-20%] right-[-10%] -z-10 h-[620px] w-[620px] rounded-full opacity-[0.10] blur-[90px] dark:opacity-25"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, var(--aurora-1), var(--aurora-2) 45%, var(--aurora-3) 75%, transparent 80%)",
          }}
        />
        <div className="mx-auto grid max-w-[1280px] items-center gap-8 px-4 pt-14 pb-10 md:px-8 lg:grid-cols-12 lg:pt-20">
          <div className="lg:col-span-6">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              AI/ML conferences &amp; workshops · live
            </p>
            {/* The product name is the page's main visual title (largest step, tight tracking). */}
            <h1 className="font-heading mt-5 text-5xl leading-none tracking-tight">FIndress</h1>
            <p className="font-heading mt-4 text-xl leading-snug text-balance sm:text-3xl">
              {first}.
              <br />
              <span className="text-muted-foreground">{rest.join(". ")}</span>
            </p>
            <p className="text-muted-foreground mt-6 max-w-lg text-base">
              Every deadline, ranking and call for papers across machine learning, NLP, vision,
              robotics and beyond — refreshed from open sources, with an assistant that reads each
              CFP for you.
            </p>
            <form action="/explore" className="mt-8 flex max-w-lg gap-2" role="search">
              <label htmlFor="hero-q" className="sr-only">
                Search venues
              </label>
              <div className="relative flex-1">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2"
                  aria-hidden
                />
                <input
                  id="hero-q"
                  name="q"
                  placeholder="NeurIPS, diffusion workshops, Seoul…"
                  className="border-hairline-strong bg-surface/70 placeholder:text-muted-foreground focus:border-aurora-2 h-11 w-full rounded-xl border pr-3 pl-9 text-sm backdrop-blur"
                />
              </div>
              <Button type="submit" className="h-11 px-4">
                Explore <ArrowRight />
              </Button>
            </form>
            <dl className="mt-12 grid max-w-xl grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
              {(
                [
                  ["Conferences", data.stats.conferences, "/explore?tab=conferences"],
                  ["Workshops", data.stats.workshops, "/explore?tab=workshops"],
                  ["Journals", data.stats.journals, "/explore?tab=journals"],
                  ["Open special issues", data.stats.openSpecialIssues, "/explore?tab=special"],
                ] as const
              ).map(([label, value, href]) => (
                <div key={label}>
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="mt-1 font-mono text-xl">
                    <Link href={href} className="hover:text-aurora-ink transition-colors">
                      {value.toLocaleString()}
                    </Link>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-muted-foreground mt-4 text-xs">
              <span className="text-foreground font-mono">{data.stats.deadlinesThisMonth}</span>{" "}
              deadlines this month ·{" "}
              <span className="text-foreground font-mono">
                {data.stats.sourcesLive}/{data.stats.sourcesTotal}
              </span>{" "}
              sources refreshed in the last 48 h
            </p>
          </div>
          <div className="relative w-full min-w-0 lg:col-span-6">
            <Globe venues={data.venues} highlight={highlight} />
          </div>
        </div>
      </section>

      <section aria-labelledby="next-title" className="mx-auto max-w-[1280px] px-4 md:px-8">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 id="next-title" className="font-heading text-xl">
            Next deadlines
          </h2>
          <Link href="/explore" className="text-muted-foreground hover:text-foreground text-sm">
            All upcoming →
          </Link>
        </div>
        {data.next.length === 0 ? (
          <p className="border-hairline-strong text-muted-foreground rounded-xl border border-dashed p-6 text-sm">
            No upcoming deadlines yet — ingestion hasn’t run.
          </p>
        ) : (
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {data.next.map((d) => (
              <li key={d.slug}>
                <Link
                  href={`/c/${d.slug}`}
                  onMouseEnter={() =>
                    d.lat != null && d.lng != null && setHighlight({ lat: d.lat, lng: d.lng })
                  }
                  onMouseLeave={() => setHighlight(null)}
                  onFocus={() =>
                    d.lat != null && d.lng != null && setHighlight({ lat: d.lat, lng: d.lng })
                  }
                  onBlur={() => setHighlight(null)}
                  className="group border-hairline bg-surface/60 hover:border-hairline-strong flex h-full flex-col gap-3 rounded-xl border p-4 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-heading text-xl leading-none">
                      {d.acronym} <span className="text-muted-foreground">{d.year}</span>
                    </span>
                  </div>
                  <span className="text-muted-foreground line-clamp-2 text-xs">{d.name}</span>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                    <CountdownChip dueAt={d.at} label={d.kind === "abstract" ? "abs" : "paper"} />
                    <span className="text-muted-foreground font-mono text-xs">
                      {formatInZone(d.at, "UTC", "MMM d")}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
