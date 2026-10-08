"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { AssistantPanel } from "./assistant-panel";

/** Archive-wide assistant on /explore (opened from the button or ?ask= from the command palette). */
export function GlobalAssistant() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState<string | undefined>();

  useEffect(() => {
    const url = new URL(window.location.href);
    const ask = url.searchParams.get("ask");
    if (ask) {
      url.searchParams.delete("ask");
      window.history.replaceState(window.history.state, "", url);
      queueMicrotask(() => {
        setQuestion(ask.slice(0, 2000));
        setOpen(true);
      });
    }
  }, []);

  return (
    <>
      <Button variant="outline" className="h-8" onClick={() => setOpen(true)}>
        <Sparkles className="text-aurora-ink" /> Ask FIndress
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="border-hairline bg-background w-full gap-0 p-2 sm:max-w-[480px]"
        >
          <SheetTitle className="sr-only">Ask FIndress about the archive</SheetTitle>
          <AssistantPanel className="h-full" initialQuestion={question} autoFocus />
        </SheetContent>
      </Sheet>
    </>
  );
}
