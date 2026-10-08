"use client";

import { useSyncExternalStore } from "react";

/**
 * One shared 1-second clock for every countdown on the page. Components pick a granularity,
 * so a "42d" chip only re-renders when its rounded value changes, while < 72h chips tick each second.
 */
const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Current time floored to `granularityMs`; null during SSR/hydration (render a placeholder). */
export function useNow(granularityMs = 1000): number | null {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(now / granularityMs) * granularityMs,
    () => null,
  );
}
