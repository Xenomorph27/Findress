import { describe, expect, it } from "vitest";
import { parsePlace } from "./places";

// Every input below is a real place string from ccfddl, HF ai-deadlines or WikiCFP (fetched 2026-10).
describe("parsePlace", () => {
  it.each([
    [
      "Vancouver Convention Center, Vancouver, Canada",
      "Vancouver",
      "CA",
      "Vancouver Convention Center",
    ],
    ["Montréal, Québec, Canada", "Montréal", "CA", null],
    ["Seattle, WA, United States", "Seattle", "US", null],
    ["San Diego, California", "San Diego", "US", null],
    ["Boca Raton FL, USA", "Boca Raton", "US", null],
    ["Seoul, Korea", "Seoul", "KR", null],
    ["Seoul, Republic of Korea", "Seoul", "KR", null],
    ["Edinburgh, Scotland, UK", "Edinburgh", "GB", null],
    ["Haining, Zhejiang, China", "Haining", "CN", null],
    ["Cordis, Hong Kong SAR, China", "Hong Kong", "HK", "Cordis"],
    ["Macau SAR, China", "Macau", "MO", null],
    ["Singapore EXPO", "Singapore", "SG", "Singapore EXPO"],
    ["Singapore", "Singapore", "SG", null],
    [
      "Maastricht Exhibition & Congress Centre (MECC), The Netherlands",
      null,
      "NL",
      "Maastricht Exhibition & Congress Centre",
    ],
    ["Dubaï, UAE", "Dubaï", "AE", null],
    ["Phoenix, AZ, ", "Phoenix", "US", null],
    ["Japan", null, "JP", null],
    ["Fields Institute, Toronto, Canada", "Toronto", "CA", "Fields Institute"],
  ])("%s", (raw, city, code, venue) => {
    const p = parsePlace(raw);
    expect(p.city).toBe(city);
    expect(p.countryCode).toBe(code);
    expect(p.venue).toBe(venue);
  });

  it("detects hybrid and online modes without inventing in-person", () => {
    expect(parsePlace("San Diego, California, United States (Hybrid)").mode).toBe("hybrid");
    expect(parsePlace("Bruges, Belgium and Online").mode).toBe("hybrid");
    expect(parsePlace("Laguna Hills, CA, USA - Hybrid").mode).toBe("hybrid");
    expect(parsePlace("Online").mode).toBe("virtual");
    expect(parsePlace("Virtual conference").mode).toBe("virtual");
    expect(parsePlace("Kyoto, Japan").mode).toBeNull();
  });

  it("takes the first venue of multi-venue events and flags it", () => {
    const p = parsePlace("Sydney, Australia; Atlanta, USA; Paris, France");
    expect(p.city).toBe("Sydney");
    expect(p.countryCode).toBe("AU");
    expect(p.multiVenue).toBe(true);
  });

  it("returns nulls for unknown places", () => {
    expect(parsePlace("TBD")).toMatchObject({ city: null, country: null, mode: null });
    expect(parsePlace(null).city).toBeNull();
  });
});
