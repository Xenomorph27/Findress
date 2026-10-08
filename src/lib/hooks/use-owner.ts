"use client";

import { useEffect, useSyncExternalStore } from "react";

/** Is this browser unlocked as the owner? (GET /api/auth/session, shared across components.) */
let owner: boolean | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load() {
  inflight ??= fetch("/api/auth/session", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { owner: false }))
    .then((d: { owner?: boolean }) => {
      owner = Boolean(d.owner);
    })
    .catch(() => {
      owner = false;
    })
    .finally(() => listeners.forEach((l) => l()));
  return inflight;
}

export function resetOwner() {
  owner = null;
  inflight = null;
  void load();
}

export function useOwner(): boolean | null {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => owner,
    () => null,
  );
  useEffect(() => {
    if (owner == null) void load();
  }, []);
  return value;
}
