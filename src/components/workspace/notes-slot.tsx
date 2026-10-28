"use client";

import { Check, Eye, Loader2, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MessageMarkdown } from "@/components/assistant/message-markdown";
import { useOwner } from "@/lib/hooks/use-owner";
import { cn } from "@/lib/utils";
import {
  NoteSaver,
  resolveDraft,
  type DraftStore,
  type NoteDraft,
  type SaveState,
} from "@/lib/workspace/note-saver";
import type { TargetKind } from "@/lib/workspace/targets";

/** The unsaved-text safety net in this browser (storage can be unavailable: then no draft). */
function draftStore(key: string): DraftStore {
  return {
    get() {
      try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as NoteDraft) : null;
      } catch {
        return null;
      }
    },
    set(draft) {
      try {
        localStorage.setItem(key, JSON.stringify(draft));
      } catch {
        /* storage full or blocked: the save request still runs */
      }
    },
    clear() {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Owner-only markdown notes per event, journal or special issue, autosaved (SPEC §4.9).
 * Edits are kept as a local draft immediately and saved one request at a time (NoteSaver), so
 * leaving the page or a failed save does not lose text. Renders nothing for visitors.
 */
export function NotesSlot({ eventId, kind = "event" }: { eventId: number; kind?: TargetKind }) {
  const owner = useOwner();
  const [body, setBody] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState(false);
  const [state, setState] = useState<SaveState>("idle");
  const [restored, setRestored] = useState(false);
  const saver = useRef<NoteSaver | null>(null);

  useEffect(() => {
    if (owner !== true) return;
    let cancelled = false;
    const drafts = draftStore(`findress:note-draft:${kind}:${eventId}`);
    fetch(`/api/workspace/notes?kind=${kind}&id=${eventId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { bodyMd: "", updatedAt: null }))
      .then((d: { bodyMd: string; updatedAt: string | null }) => {
        if (cancelled) return;
        const s = new NoteSaver(d.bodyMd, {
          put: (bodyMd, { keepalive }) =>
            fetch("/api/workspace/notes", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind, id: eventId, bodyMd }),
              keepalive,
            }).then((res) => res.ok),
          draft: drafts,
          onState: setState,
        });
        saver.current = s;
        const start = resolveDraft(d, drafts.get());
        setBody(start.body);
        setRestored(start.restored);
        setLoaded(true);
        setPreview(Boolean(start.body) && !start.restored);
        if (start.restored) s.edit(start.body);
        else drafts.clear();
      });
    // Leaving the tab or closing it: send what is pending.
    const onHide = () => saver.current?.flushOnExit();
    window.addEventListener("pagehide", onHide);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", onHide);
      // Navigating to another page inside the app (or another note): same.
      saver.current?.flushOnExit();
      saver.current = null;
    };
  }, [owner, eventId, kind]);

  const onChange = (text: string) => {
    setBody(text);
    setRestored(false);
    saver.current?.edit(text);
  };

  if (owner !== true) return null;

  return (
    <section aria-labelledby="notes-title" className="border-hairline border-t pt-8">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="notes-title" className="font-heading text-xl">
          My notes
        </h2>
        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          <span aria-live="polite" className="inline-flex items-center gap-1">
            {state === "unsaved" && <span>Unsaved changes</span>}
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
              <span className="text-heat-hot inline-flex items-center gap-1.5">
                Not saved (kept in this browser).
                <button
                  type="button"
                  onClick={() => void saver.current?.flush()}
                  className="hover:text-foreground underline underline-offset-2"
                >
                  Retry
                </button>
              </span>
            )}
            {restored && state !== "error" && <span>Restored unsaved text from this browser</span>}
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
            onChange={(e) => onChange(e.target.value)}
            rows={8}
            placeholder={"Ideas, co-authors, reviewer suggestions…\nMarkdown supported."}
            className="border-hairline-strong bg-surface/40 placeholder:text-muted-foreground focus:border-aurora-2 w-full resize-y rounded-xl border px-4 py-3 text-sm outline-none"
          />
        </>
      )}
    </section>
  );
}
