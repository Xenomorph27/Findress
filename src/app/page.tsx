import { BarChart3, Bot, CalendarClock, Database } from "lucide-react";
import Link from "next/link";
import { Hero } from "@/components/landing/hero";
import { Container } from "@/components/shell/states";
import { withDbFallback } from "@/lib/data/events";
import { RouteAccent } from "@/components/shell/app-shell";
import { getLandingData, type LandingData } from "@/lib/data/landing";

const EMPTY: LandingData = {
  next: [],
  markers: [],
  stats: {
    conferences: 0,
    workshops: 0,
    journals: 0,
    openSpecialIssues: 0,
    deadlinesThisMonth: 0,
    sourcesLive: 0,
    sourcesTotal: 6,
  },
};

const FEATURES = [
  {
    icon: CalendarClock,
    title: "Deadlines that tick",
    body: "Every abstract, paper, rebuttal and camera-ready date, converted to your timezone — AoE handled.",
    href: "/explore",
  },
  {
    icon: BarChart3,
    title: "The year at a glance",
    body: "A deadline calendar, venue map, rank mix and acceptance-rate trends — each chart one click from its venues.",
    href: "/insights",
  },
  {
    icon: Bot,
    title: "Ask the call for papers",
    body: "An assistant grounded in each event’s real CFP and each journal’s aims & scope: themes, fit, key dates — with citations.",
    href: "/explore",
  },
  {
    icon: Database,
    title: "Open sources, shown",
    body: "ccfddl, Hugging Face ai-deadlines, WikiCFP, OpenReview, OpenAlex and official pages — with last-updated times.",
    href: "/sources",
  },
];

export default async function HomePage() {
  const res = await withDbFallback(EMPTY, getLandingData);
  return (
    <>
      <RouteAccent route="" />
      <Hero data={res.data} />
      <Container className="pt-20">
        <ul className="border-hairline bg-hairline grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <li key={f.title} className="bg-background">
              <Link
                href={f.href}
                className="group tint-col-hover flex h-full flex-col gap-3 p-6 transition-colors"
              >
                <f.icon className="text-aurora-ink size-5" aria-hidden />
                <h2 className="font-heading text-xl leading-tight">{f.title}</h2>
                <p className="text-muted-foreground text-sm">{f.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </>
  );
}
