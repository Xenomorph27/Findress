"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isTextUIPart, isToolUIPart, type UIMessage } from "ai";
import { ArrowUp, Loader2, Lock, RotateCcw, Sparkles, Square } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTimezone } from "@/components/timezone/timezone-provider";
import { Button } from "@/components/ui/button";
import { useOwner } from "@/lib/hooks/use-owner";
import { cn } from "@/lib/utils";
import { MessageMarkdown } from "./message-markdown";

export interface AssistantEventRef {
  id: number;
  slug: string;
  acronym: string;
  year: number;
  hasCfp: boolean;
  cfpUrl?: string | null;
}

/** A journal page's assistant: grounded in its aims & scope and special-issue calls. */
export interface AssistantJournalRef {
  id: number;
  slug: string;
  abbreviation: string;
  hasScope: boolean;
  scopeUrl?: string | null;
  /** Title of the soonest open special issue, used by the "summarize this call" prompt. */
  openCall?: string | null;
}

const JOURNAL_PROMPTS = [
  {
    label: "Does my paper fit the scope?",
    text: "Does my paper fit this journal's aims and scope? My paper is about ",
  },
  {
    label: "Compare with TMLR and JMLR",
    text: "Compare this journal with TMLR and JMLR: scope, open access and fees, review model, speed and impact metrics.",
  },
  {
    label: "Summarize this special issue's call",
    text: "Summarize the open special issue call(s): theme, topics wanted, guest editors and the submission deadline in my timezone.",
  },
  {
    label: "Fees and open access",
    text: "What does it cost to publish here, and is it open access? Cite where each fact comes from.",
  },
];

const EVENT_PROMPTS = [
  {
    label: "Elaborate the problem statement",
    text: "Elaborate the problem statement of this call: its scope, core themes, and what kinds of contributions it wants.",
  },
  { label: "Summarize the CFP in 5 bullets", text: "Summarize the call for papers in 5 bullets." },
  { label: "Which topics fit my area?", text: "Which topics of this venue fit a paper on " },
  {
    label: "Key dates in my timezone",
    text: "List every key date and deadline in my timezone, with the timezone the organizers used.",
  },
  {
    label: "Compare with last year",
    text: "Compare this edition with the previous year: dates, location, deadlines and acceptance rate.",
  },
  {
    label: "Draft an abstract outline",
    text: "Draft an abstract outline that fits this venue's scope for a paper on ",
  },
];

const GLOBAL_PROMPTS = [
  {
    label: "GenAI workshops in Asia",
    text: "Which generative AI workshops have deadlines in the next 60 days in Asia?",
  },
  {
    label: "A* deadlines this month",
    text: "Which CORE A* venues have submission deadlines in the next 30 days?",
  },
  {
    label: "NLP venues in Europe",
    text: "List upcoming NLP conferences in Europe with their next deadline.",
  },
  { label: "Recent papers on a topic", text: "Find the most recent arXiv papers on " },
];

const TOOL_LABEL: Record<string, string> = {
  getEvent: "Looked up an event",
  searchEvents: "Searched the archive",
  getJournal: "Looked up a journal",
  searchJournals: "Searched journals",
  fetchPage: "Read a linked page",
  searchArxiv: "Searched arXiv",
};

function toolSummary(part: { type: string; state: string; input?: unknown }): string {
  const name = part.type.replace(/^tool-/, "");
  const input = (part.input ?? {}) as Record<string, unknown>;
  const detail =
    (typeof input.slug === "string" && input.slug) ||
    (typeof input.query === "string" && `“${input.query}”`) ||
    (typeof input.url === "string" && new URL(input.url).hostname) ||
    "";
  const running = part.state === "input-streaming" || part.state === "input-available";
  return `${running ? (TOOL_LABEL[name] ?? name).replace(/^Looked up|^Searched|^Read/, (m) => ({ "Looked up": "Looking up", Searched: "Searching", Read: "Reading" })[m] ?? m) : (TOOL_LABEL[name] ?? name)}${detail ? ` · ${detail}` : ""}`;
}

async function errorMessage(err: Error | undefined): Promise<string | null> {
  if (!err) return null;
  try {
    const data = JSON.parse(err.message) as { message?: string; error?: string };
    return data.message ?? data.error ?? err.message;
  } catch {
    return err.message || "Something went wrong.";
  }
}

export function AssistantPanel({
  event,
  journal,
  initialQuestion,
  className,
  autoFocus,
}: {
  event?: AssistantEventRef;
  journal?: AssistantJournalRef;
  initialQuestion?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const owner = useOwner();
  const { tz } = useTimezone();
  const scope = event ? `event:${event.id}` : journal ? `journal:${journal.id}` : "global";
  const subjectLabel = event
    ? `${event.acronym} ${event.year}`
    : journal
      ? journal.abbreviation
      : null;
  const subjectPath = event ? `/c/${event.slug}` : journal ? `/j/${journal.slug}` : "/explore";
  const [input, setInput] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sentInitial = useRef(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          eventSlug: event?.slug ?? null,
          journalSlug: journal?.slug ?? null,
          tz,
        }),
      }),
    [event?.slug, journal?.slug, tz],
  );
  const { messages, sendMessage, status, error, stop, setMessages, clearError } = useChat({
    id: scope,
    transport,
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    void errorMessage(error).then(setErrorText);
  }, [error]);

  // Restore the saved conversation for this event (owner only).
  useEffect(() => {
    if (owner !== true || historyLoaded) return;
    let cancelled = false;
    fetch(`/api/chat?scope=${encodeURIComponent(scope)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d: { messages: UIMessage[] }) => {
        if (cancelled) return;
        if (d.messages?.length) setMessages(d.messages);
        setHistoryLoaded(true);
      })
      .catch(() => setHistoryLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [owner, scope, historyLoaded, setMessages]);

  useEffect(() => {
    if (initialQuestion && owner === true && historyLoaded && !sentInitial.current) {
      sentInitial.current = true;
      void sendMessage({ text: initialQuestion });
    }
  }, [initialQuestion, owner, historyLoaded, sendMessage]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    clearError();
    setErrorText(null);
    void sendMessage({ text: t });
    setInput("");
  };

  const applyPrompt = (text: string) => {
    if (text.endsWith(" ")) {
      setInput(text);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(text.length, text.length);
      });
    } else submit(text);
  };

  const clear = async () => {
    stop();
    setMessages([]);
    await fetch(`/api/chat?scope=${encodeURIComponent(scope)}`, { method: "DELETE" }).catch(
      () => {},
    );
  };

  const prompts = event
    ? EVENT_PROMPTS
    : journal
      ? JOURNAL_PROMPTS.filter((p) => journal.openCall || !p.label.includes("special issue"))
      : GLOBAL_PROMPTS;

  return (
    <section
      aria-label="Ask FIndress"
      className={cn("glass border-hairline flex min-h-0 flex-col rounded-2xl border", className)}
    >
      <header className="border-hairline flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="text-aurora-ink size-4" aria-hidden />
          <h2 className="text-sm font-medium">Ask FIndress</h2>
          <span className="text-muted-foreground text-xs">
            {subjectLabel ? `· ${subjectLabel}` : "· whole archive"}
          </span>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="xs"
            onClick={clear}
            className="text-muted-foreground"
            aria-label="Clear conversation"
          >
            <RotateCcw /> Clear
          </Button>
        )}
      </header>

      {owner === false ? (
        <div className="text-muted-foreground flex flex-col items-start gap-3 p-5 text-sm">
          <p>
            {event
              ? `A research assistant grounded in the ${event.acronym} ${event.year} call for papers — scope, themes, fit and key dates, with citations.`
              : journal
                ? `A research assistant grounded in ${journal.abbreviation}'s aims & scope and its special-issue calls — fit, fees, metrics and deadlines, with citations.`
                : "Ask across every venue: deadlines, regions, subfields, recent papers."}
          </p>
          <p className="text-xs">Your session ended. Sign in again to ask.</p>
          <Button asChild variant="outline" size="sm">
            <Link href={`/login?next=${encodeURIComponent(subjectPath)}`}>
              <Lock /> Sign in to ask
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
            aria-live="polite"
            aria-busy={busy}
          >
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-muted-foreground text-sm">
                  {event
                    ? event.hasCfp
                      ? "Answers come from this event’s call for papers and records, with citations."
                      : "The official CFP text hasn’t been fetched yet; answers use the event record and source descriptions."
                    : journal
                      ? journal.hasScope
                        ? "Answers come from this journal’s aims & scope, its special-issue calls and its record, with citations."
                        : "The journal’s aims & scope page couldn’t be fetched; answers use its record and special-issue calls."
                      : "Ask about any venue or journal in the archive."}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {prompts.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyPrompt(p.text)}
                      disabled={owner == null}
                      className="border-hairline bg-surface/90 text-muted-foreground hover:border-aurora-2/50 hover:text-foreground rounded-full border px-2.5 py-1 text-left text-xs transition-colors disabled:opacity-50"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, mi) => {
              const isLast = mi === messages.length - 1;
              if (m.role === "user") {
                return (
                  <div key={m.id} className="flex justify-end">
                    <p className="bg-surface-2 max-w-[88%] rounded-2xl rounded-br-md px-3 py-2 text-sm whitespace-pre-wrap">
                      {m.parts
                        .filter(isTextUIPart)
                        .map((p) => p.text)
                        .join("")}
                    </p>
                  </div>
                );
              }
              const meta = (m.metadata ?? {}) as { finishReason?: string };
              const text = m.parts
                .filter(isTextUIPart)
                .map((p) => p.text)
                .join("");
              return (
                <div key={m.id} className="space-y-2">
                  {m.parts.filter(isToolUIPart).map((p, i) => (
                    <p key={i} className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      {p.state === "output-available" || p.state === "output-error" ? (
                        <span className="bg-aurora-1 size-1.5 rounded-full" aria-hidden />
                      ) : (
                        <Loader2 className="size-3 animate-spin" aria-hidden />
                      )}
                      {toolSummary(p as never)}
                    </p>
                  ))}
                  {text && (
                    <MessageMarkdown text={text} cfpUrl={event?.cfpUrl ?? journal?.scopeUrl} />
                  )}
                  {isLast && status === "streaming" && (
                    <span
                      aria-hidden
                      className="animate-caret bg-aurora-2 inline-block h-4 w-[2px] translate-y-0.5"
                    />
                  )}
                  {meta.finishReason === "content-filter" && (
                    <p className="text-muted-foreground text-xs">
                      The model declined to answer this request.
                    </p>
                  )}
                  {meta.finishReason === "length" && (
                    <p className="text-muted-foreground text-xs">
                      Answer cut at the length limit — ask to continue.
                    </p>
                  )}
                </div>
              );
            })}
            {status === "submitted" && (
              <p className="text-muted-foreground flex items-center gap-2 text-xs">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Reading the call for
                papers…
              </p>
            )}
            {errorText && (
              <p
                role="alert"
                className="border-heat-hot/40 bg-heat-hot/10 rounded-lg border px-3 py-2 text-xs"
              >
                {errorText}
              </p>
            )}
          </div>

          <form
            className="border-hairline border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
          >
            <div className="border-hairline-strong bg-background/60 focus-within:border-aurora-2 flex items-end gap-2 rounded-xl border p-1.5">
              <label htmlFor={`ask-${scope}`} className="sr-only">
                Ask a question
              </label>
              <textarea
                id={`ask-${scope}`}
                ref={inputRef}
                rows={2}
                value={input}
                autoFocus={autoFocus}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(input);
                  }
                }}
                placeholder={subjectLabel ? `Ask about ${subjectLabel}…` : "Ask about any venue…"}
                className="placeholder:text-muted-foreground max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
              />
              {busy ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  onClick={() => stop()}
                  aria-label="Stop"
                >
                  <Square />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon-sm"
                  disabled={!input.trim() || owner !== true}
                  aria-label="Send"
                >
                  <ArrowUp />
                </Button>
              )}
            </div>
            <p className="text-muted-foreground mt-1.5 px-1 text-xs">
              Grounded in sources · may be wrong — check the official page before you submit.
            </p>
          </form>
        </>
      )}
    </section>
  );
}
