"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { BookmarkStatus } from "@/lib/taxonomy";

/**
 * Owner bookmarks, shared by every star on the page. Loaded once from /api/workspace/bookmarks;
 * a 401 means "not unlocked" and stars link to /unlock instead.
 */
interface State {
  loaded: boolean;
  isOwner: boolean;
  statuses: Map<number, BookmarkStatus>;
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
      const data = (await res.json()) as { items: { eventId: number; status: BookmarkStatus }[] };
      emit({
        loaded: true,
        isOwner: true,
        statuses: new Map(data.items.map((i) => [i.eventId, i.status])),
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

  const setStatus = useCallback(async (eventId: number, status: BookmarkStatus | null) => {
    const prev = state.statuses;
    const next = new Map(prev);
    if (status) next.set(eventId, status);
    else next.delete(eventId);
    emit({ ...state, statuses: next });
    const res = await fetch("/api/workspace/bookmarks", {
      method: status ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, status }),
    }).catch(() => null);
    if (!res?.ok) emit({ ...state, statuses: prev });
    return Boolean(res?.ok);
  }, []);

  const toggle = useCallback(
    (eventId: number) => setStatus(eventId, state.statuses.has(eventId) ? null : "interested"),
    [setStatus],
  );

  return {
    loaded: snapshot.loaded,
    isOwner: snapshot.isOwner,
    statusOf: (id: number) => snapshot.statuses.get(id) ?? null,
    isBookmarked: (id: number) => snapshot.statuses.has(id),
    toggle,
    setStatus,
  };
}
