import { Sparkles } from "lucide-react";

export interface AssistantEventRef {
  id: number;
  slug: string;
  acronym: string;
  year: number;
  hasCfp: boolean;
}

/** Placeholder column for the "Ask FIndress" assistant (wired up in phase 5). */
export function AssistantSlot({ event }: { event: AssistantEventRef }) {
  return (
    <div className="glass border-hairline rounded-2xl border p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="text-aurora-ink size-4" aria-hidden />
        <h2 className="text-sm font-medium">Ask FIndress</h2>
      </div>
      <p className="text-muted-foreground mt-2 text-sm">
        A research assistant grounded in the {event.acronym} {event.year} call for papers.
      </p>
    </div>
  );
}
