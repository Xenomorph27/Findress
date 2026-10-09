import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Container, EmptyState, PageHeader } from "@/components/shell/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarFeed } from "@/components/workspace/calendar-feed";
import { Kanban } from "@/components/workspace/kanban";
import { MyDeadlines } from "@/components/workspace/my-deadlines";
import { icsFeedToken, isOwner } from "@/lib/auth/owner";
import { listWorkspace } from "@/lib/data/workspace";
import { getDb } from "@/lib/db";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "Workspace", robots: { index: false } };

function requestTime() {
  return Date.now();
}

async function WorkspaceContent() {
  if (!(await isOwner())) redirect("/login?next=/workspace");
  const db = getDb();
  if (!db) {
    return (
      <EmptyState title="No database">Set DATABASE_URL to keep bookmarks and notes.</EmptyState>
    );
  }
  const [items, token] = await Promise.all([listWorkspace(db), icsFeedToken()]);
  const now = requestTime();
  if (items.length === 0) {
    return (
      <EmptyState
        title="Your orbit is empty"
        action={
          <Button asChild>
            <Link href="/explore">Find venues to track</Link>
          </Button>
        }
      >
        Star venues in Explore (or press <kbd className="font-mono">b</kbd> on a row) and they land
        here, ready to move through Interested → Planning → Writing → Submitted.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-12">
      <section aria-labelledby="pipeline-title">
        <h2 id="pipeline-title" className="font-heading mb-4 text-xl">
          Pipeline
        </h2>
        <Kanban initial={items} now={now} />
        <p className="text-muted-foreground mt-2 text-xs">
          Drag cards between columns, or focus a card and use Space + arrow keys.
        </p>
      </section>
      <div className="grid gap-10 lg:grid-cols-12">
        <section aria-labelledby="deadlines-title" className="lg:col-span-7">
          <h2 id="deadlines-title" className="font-heading mb-4 text-xl">
            My upcoming deadlines
          </h2>
          <MyDeadlines items={items} now={now} />
        </section>
        <section aria-labelledby="feed-title" className="lg:col-span-5">
          <h2 id="feed-title" className="font-heading mb-4 text-xl">
            Calendar
          </h2>
          <CalendarFeed feedUrl={token ? absoluteUrl(`/api/workspace/ics?token=${token}`) : null} />
        </section>
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Container>
      <PageHeader eyebrow="Private" title="Workspace">
        The venues you’re tracking, where each submission stands, and every date that matters.
      </PageHeader>
      <Suspense
        fallback={
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-72 w-[260px] shrink-0 rounded-2xl" />
            ))}
          </div>
        }
      >
        <WorkspaceContent />
      </Suspense>
    </Container>
  );
}
