import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KEEPALIVE_MAX_BYTES,
  NoteSaver,
  resolveDraft,
  type NoteDraft,
  type SaveState,
} from "./note-saver";

// feedback F15: navigating away, failures and reordered responses never lose the newest text.

function harness(opts: { put?: (body: string, keepalive: boolean) => Promise<boolean> } = {}) {
  const states: SaveState[] = [];
  const puts: { body: string; keepalive: boolean }[] = [];
  let draft: NoteDraft | null = null;
  const saver = new NoteSaver("", {
    put: (body, { keepalive }) => {
      puts.push({ body, keepalive });
      return opts.put ? opts.put(body, keepalive) : Promise.resolve(true);
    },
    draft: {
      get: () => draft,
      set: (d) => {
        draft = d;
      },
      clear: () => {
        draft = null;
      },
    },
    onState: (s) => states.push(s),
    debounceMs: 800,
    now: () => 1000,
  });
  return { saver, states, puts, draft: () => draft };
}

describe("NoteSaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("marks the note unsaved and keeps a draft the moment you type", () => {
    const h = harness();
    h.saver.edit("idea");
    expect(h.states.at(-1)).toBe("unsaved");
    expect(h.draft()).toEqual({ body: "idea", at: 1000 });
    expect(h.puts).toEqual([]);
  });

  it("saves after the pause and clears the draft once confirmed", async () => {
    const h = harness();
    h.saver.edit("idea");
    await vi.advanceTimersByTimeAsync(800);
    expect(h.puts).toEqual([{ body: "idea", keepalive: false }]);
    expect(h.states.at(-1)).toBe("saved");
    expect(h.draft()).toBeNull();
  });

  it("leaving inside the pause sends the text with keepalive and keeps the draft", () => {
    const h = harness();
    h.saver.edit("last words");
    h.saver.flushOnExit();
    expect(h.puts).toEqual([{ body: "last words", keepalive: true }]);
    expect(h.draft()?.body).toBe("last words");
  });

  it("text too large for keepalive is left to the draft", () => {
    const h = harness();
    h.saver.edit("x".repeat(KEEPALIVE_MAX_BYTES + 1));
    h.saver.flushOnExit();
    expect(h.puts).toEqual([]);
    expect(h.draft()?.body).toHaveLength(KEEPALIVE_MAX_BYTES + 1);
  });

  it("never has two saves in flight, and the last one written is the newest text", async () => {
    const pending: Array<(ok: boolean) => void> = [];
    const h = harness({ put: () => new Promise((resolve) => pending.push(resolve)) });
    h.saver.edit("v1");
    await vi.advanceTimersByTimeAsync(800);
    expect(h.puts.map((p) => p.body)).toEqual(["v1"]);
    h.saver.edit("v2");
    await vi.advanceTimersByTimeAsync(800);
    h.saver.edit("v3");
    await vi.advanceTimersByTimeAsync(800);
    // v1 is still in flight: nothing else was sent.
    expect(h.puts.map((p) => p.body)).toEqual(["v1"]);
    pending.shift()!(true);
    await vi.advanceTimersByTimeAsync(0);
    // Then only the newest text goes out (v2 is skipped, not written after v3).
    expect(h.puts.map((p) => p.body)).toEqual(["v1", "v3"]);
    pending.shift()!(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.states.at(-1)).toBe("saved");
    expect(h.saver.dirty).toBe(false);
  });

  it("a failed save shows an error, keeps the draft, and Retry saves", async () => {
    let fail = true;
    const h = harness({ put: async () => !fail });
    h.saver.edit("idea");
    await vi.advanceTimersByTimeAsync(800);
    expect(h.states.at(-1)).toBe("error");
    expect(h.draft()?.body).toBe("idea");
    fail = false;
    await h.saver.flush();
    expect(h.states.at(-1)).toBe("saved");
    expect(h.draft()).toBeNull();
  });

  it("typing back to the saved text is not a pending change", () => {
    const h = harness();
    h.saver.edit("x");
    h.saver.edit("");
    expect(h.states.at(-1)).toBe("saved");
    expect(h.draft()).toBeNull();
  });
});

describe("resolveDraft", () => {
  const server = { bodyMd: "server text", updatedAt: "2027-01-01T00:00:00.000Z" };
  it("restores a newer draft that never reached the server", () => {
    const at = Date.parse("2027-01-02T00:00:00Z");
    expect(resolveDraft(server, { body: "lost edit", at })).toEqual({
      body: "lost edit",
      restored: true,
    });
  });
  it("prefers the server when the draft is older or identical", () => {
    const old = Date.parse("2026-12-31T00:00:00Z");
    expect(resolveDraft(server, { body: "old", at: old }).body).toBe("server text");
    expect(resolveDraft(server, { body: "server text", at: Date.now() }).restored).toBe(false);
    expect(resolveDraft(server, null).body).toBe("server text");
  });
});
