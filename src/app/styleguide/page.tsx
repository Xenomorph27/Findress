import type { Metadata } from "next";
import { ArrowRight, Bookmark, Sparkles } from "lucide-react";
import { LocationLabel, ModeChip, RankChip, TopicChip, TypeBadge } from "@/components/event/chips";
import { Container, EmptyState, PageHeader } from "@/components/shell/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DemoCountdowns } from "./demo-countdowns";
import { SheetDemo } from "./sheet-demo";

export const metadata: Metadata = { title: "Styleguide", robots: { index: false } };

const SWATCHES = [
  ["--bg", "Background"],
  ["--surface", "Surface"],
  ["--surface-2", "Surface 2"],
  ["--text", "Text"],
  ["--muted-text", "Muted"],
  ["--aurora-1", "Aurora · teal"],
  ["--aurora-2", "Aurora · cyan"],
  ["--aurora-3", "Aurora · violet"],
  ["--heat-calm", "Heat · calm"],
  ["--heat-warm", "Heat · warm"],
  ["--heat-hot", "Heat · hot"],
  ["--heat-passed", "Heat · passed"],
] as const;

function ThemePanel({ theme }: { theme: "dark" | "light" }) {
  return (
    <section
      aria-label={`${theme} theme`}
      className={cn(
        theme === "dark" ? "dark" : "light-scope",
        "border-hairline bg-background text-foreground space-y-8 rounded-2xl border p-5 md:p-7",
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground font-mono text-[11px] tracking-[0.18em] uppercase">
          {theme} theme
        </p>
        <span className="bg-aurora h-px w-16" aria-hidden />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium">Colour tokens</h3>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {SWATCHES.map(([token, label]) => (
            <div key={token} className="border-hairline overflow-hidden rounded-lg border">
              <div className="h-10" style={{ background: `var(${token})` }} />
              <div className="px-2 py-1.5">
                <p className="truncate text-[11px]">{label}</p>
                <p className="text-muted-foreground font-mono text-[10px]">{token}</p>
              </div>
            </div>
          ))}
          <div className="border-hairline col-span-3 overflow-hidden rounded-lg border sm:col-span-4">
            <div className="bg-aurora h-6" />
            <p className="text-muted-foreground px-2 py-1.5 font-mono text-[10px]">
              aurora gradient — focus rings, active filters, primary highlights (used sparingly)
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Typography</h3>
        <p className="font-display text-5xl leading-none">Every AI/ML venue.</p>
        <p className="font-display text-3xl italic">NeurIPS 2026</p>
        <p className="text-base">
          Geist Sans for interface and body copy — dense information that still breathes.
        </p>
        <p className="text-muted-foreground text-sm">Muted supporting text at small size.</p>
        <p className="tabular font-mono text-sm">2026-01-28 23:59 AoE · 12d 04:33:09</p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium">Buttons</h3>
        <div className="flex flex-wrap gap-2">
          <Button>
            Explore venues <ArrowRight />
          </Button>
          <Button variant="outline">
            <Bookmark /> Bookmark
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium">Badges & chips</h3>
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type="conference" />
          <TypeBadge type="workshop" />
          <RankChip system="CORE" rank="A*" />
          <RankChip system="CCF" rank="A" />
          <RankChip system="CORE" rank="B" />
          <ModeChip mode="hybrid" />
          <ModeChip mode="virtual" />
          <TopicChip>diffusion models</TopicChip>
          <TopicChip active>LLM agents</TopicChip>
          <Badge variant="outline">shadcn badge</Badge>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <LocationLabel city="Seoul" country="South Korea" countryCode="KR" />
          <LocationLabel city={null} country={null} countryCode={null} />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium">Countdown chips (heat scale)</h3>
        <DemoCountdowns />
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium">Card, input, skeleton</h3>
        <Card className="border-hairline">
          <CardHeader>
            <CardTitle className="font-display text-2xl font-normal">ICML 2027</CardTitle>
            <CardDescription>International Conference on Machine Learning</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Search venues…" aria-label="Demo search input" />
            <div className="space-y-2" aria-hidden>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium">Glass sheet</h3>
        <SheetDemo />
      </div>

      <EmptyState title="Nothing in orbit" icon={Sparkles}>
        Empty states stay calm and explain what to do next.
      </EmptyState>
    </section>
  );
}

export default function StyleguidePage() {
  return (
    <Container>
      <PageHeader eyebrow="Design system" title="Research Observatory">
        Tokens and base components, rendered in both themes side by side.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-2">
        <ThemePanel theme="dark" />
        <ThemePanel theme="light" />
      </div>
    </Container>
  );
}
