import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { events, geocodeCache } from "@/lib/db/schema";
import { continentFor, countryByCode, foldText } from "./countries";
import type { PoliteFetcher } from "./http";

/**
 * Geocoding (SPEC §9): country centroids from the static table; cities via OpenStreetMap
 * Nominatim (max 1 req/s, identified User-Agent, every answer cached in geocode_cache —
 * including misses, so a city is never looked up twice).
 */
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

interface NominatimHit {
  lat: string;
  lon: string;
  address?: { country_code?: string; country?: string };
}

export async function lookupCity(
  db: Db,
  fetcher: PoliteFetcher,
  city: string,
  country: string | null,
  allowNetwork: boolean,
): Promise<{ lat: number; lng: number; countryCode: string | null } | null | "skipped"> {
  const query = foldText([city, country].filter(Boolean).join(", "));
  const [cached] = await db
    .select()
    .from(geocodeCache)
    .where(eq(geocodeCache.query, query))
    .limit(1);
  if (cached) {
    return cached.ok && cached.lat != null && cached.lng != null
      ? { lat: cached.lat, lng: cached.lng, countryCode: cached.countryCode }
      : null;
  }
  if (!allowNetwork) return "skipped";
  const params = new URLSearchParams({
    q: [city, country].filter(Boolean).join(", "),
    format: "jsonv2",
    limit: "1",
    addressdetails: "1",
    "accept-language": "en",
  });
  const hits = await fetcher.getJson<NominatimHit[]>(`${NOMINATIM}?${params}`, {
    minIntervalMs: 1100,
  });
  const hit = hits[0];
  const lat = hit ? Number(hit.lat) : null;
  const lng = hit ? Number(hit.lon) : null;
  const ok = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const countryCode = hit?.address?.country_code?.toUpperCase() ?? null;
  await db
    .insert(geocodeCache)
    .values({ query, ok, lat: ok ? lat : null, lng: ok ? lng : null, city, country, countryCode })
    .onConflictDoNothing();
  return ok ? { lat: lat!, lng: lng!, countryCode } : null;
}

export async function geocodeEvents(
  db: Db,
  fetcher: PoliteFetcher,
  deadlineMs: number,
  log: (m: string) => void = () => {},
): Promise<{ geocoded: number; fromCountry: number; lookups: number; pending: number }> {
  const rows = await db
    .select({
      id: events.id,
      city: events.city,
      country: events.country,
      countryCode: events.countryCode,
    })
    .from(events)
    .where(
      and(
        isNull(events.geocodedAt),
        or(sql`${events.city} is not null`, sql`${events.countryCode} is not null`),
      ),
    )
    .orderBy(asc(events.nextDeadlineAt));
  let geocoded = 0;
  let fromCountry = 0;
  let lookups = 0;
  let pending = 0;
  for (const r of rows) {
    let lat: number | null = null;
    let lng: number | null = null;
    let countryCode = r.countryCode;
    if (r.city) {
      const allowNetwork = Date.now() + 1500 < deadlineMs;
      try {
        const res = await lookupCity(db, fetcher, r.city, r.country, allowNetwork);
        if (res === "skipped") {
          pending++;
          continue;
        }
        if (allowNetwork) lookups++;
        if (res) {
          lat = res.lat;
          lng = res.lng;
          countryCode ??= res.countryCode;
        }
      } catch (err) {
        log(`geocode "${r.city}": ${(err as Error).message}`);
        pending++;
        continue;
      }
    }
    if (lat == null) {
      const c = countryByCode(countryCode);
      if (c) {
        lat = c.lat;
        lng = c.lng;
        fromCountry++;
      }
    } else geocoded++;
    const known = countryByCode(countryCode);
    await db
      .update(events)
      .set({
        lat,
        lng,
        countryCode,
        country: r.country ?? known?.name ?? null,
        continent: continentFor(countryCode),
        geocodedAt: new Date(),
      })
      .where(eq(events.id, r.id));
  }
  return { geocoded, fromCountry, lookups, pending };
}
