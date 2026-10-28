/**
 * Autosave for a note (feedback F15). Rules:
 * - every edit is kept at once as a local draft, so leaving the page (or a failed save) never
 *   loses text: the draft is offered back the next time the note opens;
 * - one save request at a time, always of the newest text, so an older write can never land
 *   after a newer one;
 * - on leaving, a final save goes out with `keepalive` when the text is small enough for it
 *   (browsers cap keepalive bodies at 64 KiB in total); larger text relies on the draft.
 */

export type SaveState = "idle" | "unsaved" | "saving" | "saved" | "error";

export interface DraftStore {
  get(): NoteDraft | null;
  set(draft: NoteDraft): void;
  clear(): void;
}

export interface NoteDraft {
  body: string;
  /** When it was typed (epoch ms). */
  at: number;
}

export interface NoteSaverDeps {
  /** Save `body`; resolves true when the server confirmed it. */
  put(body: string, opts: { keepalive: boolean }): Promise<boolean>;
  draft: DraftStore;
  onState(state: SaveState): void;
  debounceMs?: number;
  now?: () => number;
}

/** keepalive bodies share a 64 KiB budget per page; stay well under it. */
export const KEEPALIVE_MAX_BYTES = 60_000;

export class NoteSaver {
  private latest: string;
  private saved: string;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    savedBody: string,
    private deps: NoteSaverDeps,
  ) {
    this.latest = savedBody;
    this.saved = savedBody;
  }

  get dirty(): boolean {
    return this.latest !== this.saved;
  }

  /** The owner typed: keep a draft now, save shortly. */
  edit(body: string): void {
    this.latest = body;
    if (!this.dirty) {
      clearTimeout(this.timer);
      this.deps.draft.clear();
      this.deps.onState("saved");
      return;
    }
    this.deps.draft.set({ body, at: (this.deps.now ?? Date.now)() });
    this.deps.onState("unsaved");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.deps.debounceMs ?? 800);
  }

  /** Save the newest text now (also the "Retry" action). Resolves when nothing is pending. */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.chain = this.chain.then(() => this.saveLoop());
    return this.chain;
  }

  private async saveLoop(): Promise<void> {
    while (this.dirty) {
      const body = this.latest;
      this.deps.onState("saving");
      const ok = await this.deps.put(body, { keepalive: false }).catch(() => false);
      if (!ok) {
        this.deps.onState("error");
        return;
      }
      this.saved = body;
    }
    this.deps.draft.clear();
    this.deps.onState("saved");
  }

  /** Leaving the page or the note: send what is pending if it fits a keepalive request. */
  flushOnExit(): void {
    clearTimeout(this.timer);
    if (!this.dirty) return;
    if (new TextEncoder().encode(this.latest).byteLength > KEEPALIVE_MAX_BYTES) return;
    // Fire and forget; the draft stays until a later load sees the server has the text.
    void this.deps.put(this.latest, { keepalive: true }).catch(() => false);
  }
}

/**
 * Which text to show when a note opens: the local draft if it is newer than the server copy
 * and different from it (the last edit did not reach the server), else the server copy.
 */
export function resolveDraft(
  server: { bodyMd: string; updatedAt: string | null },
  draft: NoteDraft | null,
): { body: string; restored: boolean } {
  if (!draft || draft.body === server.bodyMd) return { body: server.bodyMd, restored: false };
  const serverAt = server.updatedAt ? Date.parse(server.updatedAt) : 0;
  return draft.at > serverAt
    ? { body: draft.body, restored: true }
    : { body: server.bodyMd, restored: false };
}
