import type { Continent } from "@/lib/taxonomy";

export interface CountryInfo {
  code: string;
  name: string;
  continent: Continent;
  /** Approximate centroid — used for the map when a city can't be geocoded. */
  lat: number;
  lng: number;
  aliases: string[];
}

type Row = [
  code: string,
  name: string,
  continent: string,
  lat: number,
  lng: number,
  aliases?: string,
];

const AF = "Africa";
const AS = "Asia";
const EU = "Europe";
const NA = "North America";
const SA = "South America";
const OC = "Oceania";

/** Countries that host (or plausibly host) AI/ML venues. Aliases are "|"-separated. */
const ROWS: Row[] = [
  ["US", "United States", NA, 39.8, -98.6, "usa|u.s.a.|u.s.|us|united states of america|america"],
  ["CA", "Canada", NA, 56.1, -106.3],
  ["MX", "Mexico", NA, 23.6, -102.5, "méxico"],
  ["CR", "Costa Rica", NA, 9.7, -83.8],
  ["PA", "Panama", NA, 8.5, -80.8],
  ["CU", "Cuba", NA, 21.5, -77.8],
  ["PR", "Puerto Rico", NA, 18.2, -66.5],
  ["BR", "Brazil", SA, -14.2, -51.9, "brasil"],
  ["AR", "Argentina", SA, -38.4, -63.6],
  ["CL", "Chile", SA, -35.7, -71.5],
  ["CO", "Colombia", SA, 4.6, -74.3],
  ["PE", "Peru", SA, -9.2, -75.0, "perú"],
  ["UY", "Uruguay", SA, -32.5, -55.8],
  ["EC", "Ecuador", SA, -1.8, -78.2],
  ["VE", "Venezuela", SA, 6.4, -66.6],
  [
    "GB",
    "United Kingdom",
    EU,
    54.0,
    -2.5,
    "uk|u.k.|great britain|britain|england|scotland|wales|northern ireland",
  ],
  ["IE", "Ireland", EU, 53.4, -8.2, "republic of ireland"],
  ["FR", "France", EU, 46.2, 2.2],
  ["DE", "Germany", EU, 51.2, 10.4, "deutschland"],
  ["NL", "Netherlands", EU, 52.1, 5.3, "the netherlands|holland"],
  ["BE", "Belgium", EU, 50.5, 4.5],
  ["LU", "Luxembourg", EU, 49.8, 6.1],
  ["CH", "Switzerland", EU, 46.8, 8.2],
  ["AT", "Austria", EU, 47.5, 14.6],
  ["IT", "Italy", EU, 41.9, 12.6, "italia"],
  ["ES", "Spain", EU, 40.5, -3.7, "españa"],
  ["PT", "Portugal", EU, 39.4, -8.2],
  ["GR", "Greece", EU, 39.1, 21.8],
  ["CY", "Cyprus", EU, 35.1, 33.4],
  ["MT", "Malta", EU, 35.9, 14.4],
  ["SE", "Sweden", EU, 60.1, 18.6],
  ["NO", "Norway", EU, 60.5, 8.5],
  ["DK", "Denmark", EU, 56.3, 9.5],
  ["FI", "Finland", EU, 61.9, 25.7],
  ["IS", "Iceland", EU, 64.9, -19.0],
  ["PL", "Poland", EU, 51.9, 19.1],
  ["CZ", "Czechia", EU, 49.8, 15.5, "czech republic"],
  ["SK", "Slovakia", EU, 48.7, 19.7],
  ["HU", "Hungary", EU, 47.2, 19.5],
  ["RO", "Romania", EU, 45.9, 25.0],
  ["BG", "Bulgaria", EU, 42.7, 25.5],
  ["HR", "Croatia", EU, 45.1, 15.2],
  ["SI", "Slovenia", EU, 46.2, 14.995],
  ["RS", "Serbia", EU, 44.0, 21.0],
  ["BA", "Bosnia and Herzegovina", EU, 43.9, 17.7],
  ["MK", "North Macedonia", EU, 41.6, 21.7, "macedonia"],
  ["AL", "Albania", EU, 41.2, 20.2],
  ["ME", "Montenegro", EU, 42.7, 19.4],
  ["EE", "Estonia", EU, 58.6, 25.0],
  ["LV", "Latvia", EU, 56.9, 24.6],
  ["LT", "Lithuania", EU, 55.2, 23.9],
  ["UA", "Ukraine", EU, 48.4, 31.2],
  ["MD", "Moldova", EU, 47.4, 28.4],
  ["RU", "Russia", EU, 61.5, 105.3, "russian federation"],
  ["TR", "Türkiye", AS, 39.0, 35.2, "turkey|turkiye"],
  ["GE", "Georgia", AS, 42.3, 43.4],
  ["AM", "Armenia", AS, 40.1, 45.0],
  ["AZ", "Azerbaijan", AS, 40.1, 47.6],
  ["IL", "Israel", AS, 31.0, 34.9],
  ["JO", "Jordan", AS, 30.6, 36.2],
  ["LB", "Lebanon", AS, 33.9, 35.9],
  ["AE", "United Arab Emirates", AS, 23.4, 53.8, "uae|u.a.e."],
  ["SA", "Saudi Arabia", AS, 23.9, 45.1, "ksa"],
  ["QA", "Qatar", AS, 25.4, 51.2],
  ["BH", "Bahrain", AS, 26.0, 50.6],
  ["KW", "Kuwait", AS, 29.3, 47.5],
  ["OM", "Oman", AS, 21.5, 55.9],
  ["IR", "Iran", AS, 32.4, 53.7],
  ["IQ", "Iraq", AS, 33.2, 43.7],
  ["KZ", "Kazakhstan", AS, 48.0, 66.9],
  ["UZ", "Uzbekistan", AS, 41.4, 64.6],
  ["PK", "Pakistan", AS, 30.4, 69.3],
  ["IN", "India", AS, 20.6, 78.96, "bharat"],
  ["BD", "Bangladesh", AS, 23.7, 90.4],
  ["LK", "Sri Lanka", AS, 7.9, 80.8],
  ["NP", "Nepal", AS, 28.4, 84.1],
  [
    "CN",
    "China",
    AS,
    35.9,
    104.2,
    "pr china|p.r. china|prc|people's republic of china|mainland china",
  ],
  ["HK", "Hong Kong", AS, 22.32, 114.17, "hong kong sar|hksar"],
  ["MO", "Macau", AS, 22.2, 113.55, "macao|macau sar|macao sar"],
  ["TW", "Taiwan", AS, 23.7, 121.0, "republic of china"],
  ["JP", "Japan", AS, 36.2, 138.3],
  ["KR", "South Korea", AS, 35.9, 127.8, "korea|republic of korea|korea, republic of|s. korea"],
  ["MN", "Mongolia", AS, 46.9, 103.8],
  ["SG", "Singapore", AS, 1.35, 103.82],
  ["MY", "Malaysia", AS, 4.2, 101.98],
  ["TH", "Thailand", AS, 15.9, 100.99],
  ["VN", "Vietnam", AS, 14.06, 108.3, "viet nam"],
  ["ID", "Indonesia", AS, -0.8, 113.9],
  ["PH", "Philippines", AS, 12.9, 121.8],
  ["KH", "Cambodia", AS, 12.6, 104.99],
  ["MM", "Myanmar", AS, 21.9, 95.96],
  ["AU", "Australia", OC, -25.3, 133.8],
  ["NZ", "New Zealand", OC, -40.9, 174.9],
  ["FJ", "Fiji", OC, -17.7, 178.1],
  ["EG", "Egypt", AF, 26.8, 30.8],
  ["MA", "Morocco", AF, 31.8, -7.1],
  ["TN", "Tunisia", AF, 33.9, 9.5],
  ["DZ", "Algeria", AF, 28.0, 1.7],
  ["ZA", "South Africa", AF, -30.6, 22.9],
  ["NG", "Nigeria", AF, 9.1, 8.7],
  ["KE", "Kenya", AF, -0.02, 37.9],
  ["GH", "Ghana", AF, 7.9, -1.0],
  ["RW", "Rwanda", AF, -1.9, 29.9],
  ["ET", "Ethiopia", AF, 9.1, 40.5],
  ["SN", "Senegal", AF, 14.5, -14.5],
  ["TZ", "Tanzania", AF, -6.4, 34.9],
  ["UG", "Uganda", AF, 1.4, 32.3],
  ["MU", "Mauritius", AF, -20.3, 57.6],
];

export const COUNTRIES: CountryInfo[] = ROWS.map(([code, name, continent, lat, lng, aliases]) => ({
  code,
  name,
  continent: continent as Continent,
  lat,
  lng,
  aliases: aliases ? aliases.split("|") : [],
}));

export function foldText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const BY_NAME = new Map<string, CountryInfo>();
const BY_CODE = new Map<string, CountryInfo>();
for (const c of COUNTRIES) {
  BY_CODE.set(c.code, c);
  for (const n of [c.name, ...c.aliases]) BY_NAME.set(foldText(n), c);
}

export function countryByCode(code: string | null | undefined): CountryInfo | null {
  return code ? (BY_CODE.get(code.toUpperCase()) ?? null) : null;
}

export function countryByName(name: string | null | undefined): CountryInfo | null {
  if (!name) return null;
  const key = foldText(name)
    .replace(/^the /, "")
    .replace(/[.,;]+$/, "");
  return BY_NAME.get(key) ?? BY_NAME.get(foldText(name)) ?? null;
}

/** Continent for any ISO code we know; null otherwise. */
export function continentFor(code: string | null | undefined): Continent | null {
  return countryByCode(code)?.continent ?? null;
}

export const US_STATES: Record<string, string> = {
  AL: "alabama",
  AK: "alaska",
  AZ: "arizona",
  AR: "arkansas",
  CA: "california",
  CO: "colorado",
  CT: "connecticut",
  DE: "delaware",
  FL: "florida",
  GA: "georgia",
  HI: "hawaii",
  ID: "idaho",
  IL: "illinois",
  IN: "indiana",
  IA: "iowa",
  KS: "kansas",
  KY: "kentucky",
  LA: "louisiana",
  ME: "maine",
  MD: "maryland",
  MA: "massachusetts",
  MI: "michigan",
  MN: "minnesota",
  MS: "mississippi",
  MO: "missouri",
  MT: "montana",
  NE: "nebraska",
  NV: "nevada",
  NH: "new hampshire",
  NJ: "new jersey",
  NM: "new mexico",
  NY: "new york",
  NC: "north carolina",
  ND: "north dakota",
  OH: "ohio",
  OK: "oklahoma",
  OR: "oregon",
  PA: "pennsylvania",
  RI: "rhode island",
  SC: "south carolina",
  SD: "south dakota",
  TN: "tennessee",
  TX: "texas",
  UT: "utah",
  VT: "vermont",
  VA: "virginia",
  WA: "washington",
  WV: "west virginia",
  WI: "wisconsin",
  WY: "wyoming",
  DC: "district of columbia",
};
const US_STATE_NAMES = new Set(Object.values(US_STATES));

export function isUsState(segment: string): boolean {
  const s = segment.trim();
  return s.toUpperCase() in US_STATES && s.length === 2 ? true : US_STATE_NAMES.has(foldText(s));
}
