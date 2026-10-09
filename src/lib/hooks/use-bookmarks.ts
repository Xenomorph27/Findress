"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { BookmarkStatus } from "@/lib/taxonomy";
import { targetKey, type TargetKind } from "@/lib/workspace/targets";

/**
 * Owner bookmarks (events, journals, special issues), shared by every star on the page.
 * Loaded once from /api/workspace/bookmarks; a 401 means "not unlocked" and stars link to
 * /unlock instead. Keys are "<kind>:<id>".
 */
interface State {
  loaded: boolean;
  isOwner: boolean;
  statuses: Map<string, BookmarkStatus>;
}

let state: State = { loaded: false, isOwner: false, statuses: new Map() };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = (next: State) => {
  state = next;
  listeners.forEach((l) => l());
};

async function load(force = false) {
  if (inflight && !force) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/workspace/bookmarks", { cache: "no-store" });
      if (!res.ok) {
        emit({ loaded: true, isOwner: false, statuses: new Map() });
        return;
      }
      const data = (await res.json()) as { items: { key: string; status: BookmarkStatus }[] };
      emit({
        loaded: true,
        isOwner: true,
        statuses: new Map(data.items.map((i) => [i.key, i.status])),
      });
    } catch {
      emit({ loaded: true, isOwner: false, statuses: new Map() });
    }
  })();
  return inflight;
}

export function refreshBookmarks() {
  return load(true);
}

export function useBookmarks() {
  const snapshot = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );

  useEffect(() => {
    if (!state.loaded) void load();
  }, []);

  const setStatus = useCallback(
    async (id: number, status: BookmarkStatus | null, kind: TargetKind = "event") => {
      const key = targetKey({ kind, id });
      const prev = state.statuses;
      const next = new Map(prev);
      if (status) next.set(key, status);
      else next.delete(key);
      emit({ ...state, statuses: next });
      const res = await fetch("/api/workspace/bookmarks", {
        method: status ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, status }),
      }).catch(() => null);
      if (!res?.ok) emit({ ...state, statuses: prev });
      return Boolean(res?.ok);
    },
    [],
  );

  const toggle = useCallback(
    (id: number, kind: TargetKind = "event") =>
      setStatus(id, state.statuses.has(targetKey({ kind, id })) ? null : "interested", kind),
    [setStatus],
  );

  return {
    loaded: snapshot.loaded,
    isOwner: snapshot.isOwner,
    statusOf: (id: number, kind: TargetKind = "event") =>
      snapshot.statuses.get(targetKey({ kind, id })) ?? null,
    isBookmarked: (id: number, kind: TargetKind = "event") =>
      snapshot.statuses.has(targetKey({ kind, id })),
    toggle,
    setStatus,
  };
}
