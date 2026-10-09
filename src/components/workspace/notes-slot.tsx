"use client";

import { Check, Eye, Loader2, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MessageMarkdown } from "@/components/assistant/message-markdown";
import { useOwner } from "@/lib/hooks/use-owner";
import { cn } from "@/lib/utils";
import type { TargetKind } from "@/lib/workspace/targets";

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Owner-only markdown notes per event, journal or special issue, autosaved (SPEC §4.9).
 * Renders nothing for visitors.
 */
export function NotesSlot({ eventId, kind = "event" }: { eventId: number; kind?: TargetKind }) {
  const owner = useOwner();
  const [body, setBody] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState(false);
  const [state, setState] = useState<SaveState>("idle");
  const lastSaved = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (owner !== true) return;
    let cancelled = false;
    fetch(`/api/workspace/notes?kind=${kind}&id=${eventId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { bodyMd: "" }))
      .then((d: { bodyMd: string }) => {
        if (cancelled) return;
        setBody(d.bodyMd);
        lastSaved.current = d.bodyMd;
        setLoaded(true);
        setPreview(Boolean(d.bodyMd));
      });
    return () => {
      cancelled = true;
    };
  }, [owner, eventId, kind]);

  useEffect(() => {
    if (!loaded || body === lastSaved.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setState("saving");
      const res = await fetch("/api/workspace/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id: eventId, bodyMd: body }),
      }).catch(() => null);
      if (res?.ok) {
        lastSaved.current = body;
        setState("saved");
      } else setState("error");
    }, 800);
    return () => clearTimeout(timer.current);
  }, [body, loaded, eventId, kind]);

  if (owner !== true) return null;

  return (
    <section aria-labelledby="notes-title" className="border-hairline border-t pt-8">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="notes-title" className="font-display text-2xl">
          My notes
        </h2>
        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          <span aria-live="polite" className="inline-flex items-center gap-1">
            {state === "saving" && (
              <>
                <Loader2 className="size-3 animate-spin" /> Saving
              </>
            )}
            {state === "saved" && (
              <>
                <Check className="size-3" /> Saved
              </>
            )}
            {state === "error" && (
              <span className="text-heat-hot">Not saved — retrying on next edit</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className="hover:text-foreground inline-flex items-center gap-1 rounded-md px-1.5 py-1"
            aria-pressed={preview}
          >
            {preview ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}{" "}
            {preview ? "Edit" : "Preview"}
          </button>
        </div>
      </div>
      {!loaded ? (
        <div className="border-hairline bg-surface/50 h-32 animate-pulse rounded-xl border" />
      ) : preview ? (
        <div
          className={cn(
            "border-hairline bg-surface/40 min-h-24 rounded-xl border px-4 py-2",
            !body && "text-muted-foreground text-sm",
          )}
          onDoubleClick={() => setPreview(false)}
        >
          {body ? <MessageMarkdown text={body} /> : <p className="py-2">No notes yet.</p>}
        </div>
      ) : (
        <>
          <label htmlFor={`notes-${kind}-${eventId}`} className="sr-only">
            Notes (markdown)
          </label>
          <textarea
            id={`notes-${kind}-${eventId}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder={"Ideas, co-authors, reviewer suggestions…\nMarkdown supported."}
            className="border-hairline-strong bg-surface/40 placeholder:text-muted-foreground focus:border-aurora-2 w-full resize-y rounded-xl border px-4 py-3 font-mono text-sm leading-relaxed outline-none"
          />
        </>
      )}
    </section>
  );
}
