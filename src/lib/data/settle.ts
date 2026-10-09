import "server-only";
import { cacheLife } from "next/cache";

/**
 * A database error must never escape a "use cache" scope. During `next build` Next.js turns any
 * error thrown while filling a cache into a failed prerender, even when the page catches it, so
 * an unreachable DATABASE_URL failed the whole deploy. Cached loaders therefore `settle` their
 * query into a value (a failure is cached for a minute instead of hours, which keeps it
 * prerenderable) and `unwrap` it outside the cache, where `withDbFallback` turns the rethrown
 * error into the page's error state.
 */
export type Settled<T> = { ok: true; value: T } | { ok: false; error: string };

/** Retried after a minute; `expire` ≥ 5 min so it stays in the prerender (no dynamic hole). */
const FAILED = { stale: 300, revalidate: 60, expire: 3600 };

/** Use inside a "use cache" function in place of `cacheLife(profile)`. */
export async function settle<T>(
  profile: "minutes" | "hours",
  query: () => Promise<T>,
): Promise<Settled<T>> {
  try {
    const value = await query();
    if (profile === "minutes") cacheLife("minutes");
    else cacheLife("hours");
    return { ok: true, value };
  } catch (err) {
    cacheLife(FAILED);
    return { ok: false, error: (err as Error).message || "database error" };
  }
}

export function unwrap<T>(settled: Settled<T>): T {
  if (settled.ok) return settled.value;
  throw new Error(settled.error);
}
