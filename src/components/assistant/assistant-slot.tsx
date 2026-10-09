"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import dynamic from "next/dynamic";
import type { AssistantEventRef, AssistantJournalRef } from "./assistant-panel";

// Heavy (AI SDK client, markdown, KaTeX): code-split out of the event page's first load.
const AssistantPanel = dynamic(() => import("./assistant-panel").then((m) => m.AssistantPanel), {
  ssr: false,
  loading: () => (
    <div className="glass border-hairline h-full min-h-80 animate-pulse rounded-2xl border" />
  ),
});

export type { AssistantEventRef, AssistantJournalRef };

/** Docked column on desktop; a floating button + bottom sheet on mobile (SPEC §4.8). */
export function AssistantSlot({
  event,
  journal,
}: {
  event?: AssistantEventRef;
  journal?: AssistantJournalRef;
}) {
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
  const [open, setOpen] = useState(false);
  const label = event ? `${event.acronym} ${event.year}` : (journal?.abbreviation ?? "");

  if (isDesktop) {
    return (
      <AssistantPanel
        event={event}
        journal={journal}
        className="h-[calc(100dvh-7rem)] max-h-[760px]"
      />
    );
  }
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-30 h-11 rounded-full px-4 shadow-lg"
        aria-label={`Ask FIndress about ${label}`}
      >
        <Sparkles /> Ask FIndress
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="border-hairline bg-background h-[85dvh] gap-0 p-2"
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">Ask FIndress about {label}</SheetTitle>
          {open && <AssistantPanel event={event} journal={journal} className="h-full" autoFocus />}
        </SheetContent>
      </Sheet>
    </>
  );
}
