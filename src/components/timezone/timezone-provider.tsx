"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { DEFAULT_TIMEZONE } from "@/lib/site";

const KEY = "findress:tz";
const listeners = new Set<() => void>();

function read(): string {
  try {
    return window.localStorage.getItem(KEY) || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

interface TimezoneContext {
  tz: string;
  setTz: (tz: string) => void;
}

const Ctx = createContext<TimezoneContext>({ tz: DEFAULT_TIMEZONE, setTz: () => {} });

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const tz = useSyncExternalStore(subscribe, read, () => DEFAULT_TIMEZONE);
  const setTz = useCallback((next: string) => {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable — preference lasts for this page only */
    }
    listeners.forEach((l) => l());
  }, []);
  const value = useMemo(() => ({ tz, setTz }), [tz, setTz]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTimezone() {
  return useContext(Ctx);
}
