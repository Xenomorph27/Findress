/** Serializable shapes passed from server data loaders to client components. */

export interface RowDeadline {
  kind: "abstract" | "paper";
  /** Epoch ms (UTC). */
  at: number;
  label: string | null;
}

/** One row in /explore — compact on purpose (the whole explorable set is sent once). */
export interface ExplorerRow {
  id: number;
  slug: string;
  acronym: string;
  name: string | null;
  year: number;
  type: string;
  parent: { slug: string; acronym: string; year: number } | null;
  subfields: string[];
  topics: string[];
  rankCore: string | null;
  rankCcf: string | null;
  mode: string | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  continent: string | null;
  lat: number | null;
  lng: number | null;
  startDate: string | null;
  endDate: string | null;
  deadlines: RowDeadline[];
  hasRebuttal: boolean | null;
  reviewType: string | null;
  /** Only WikiCFP lists it and it has no rank: hidden behind a toggle by default. */
  communityOnly: boolean;
  /** Newest edition of its series in the archive (keeps flagships listed between cycles). */
  latestInSeries: boolean;
  sources: string[];
  createdAt: number;
}

export interface DetailDeadline {
  kind: string;
  label: string | null;
  dueAtUtc: string;
  originalTz: string | null;
  originalText: string | null;
  comment: string | null;
  source: string;
}

export interface DetailSource {
  source: string;
  sourceId: string;
  url: string | null;
  fieldsProvided: string[];
  lastSeenAt: string;
}

export interface EditionSummary {
  slug: string;
  year: number;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  startDate: string | null;
  endDate: string | null;
  dateText: string | null;
}

export interface AcceptancePoint {
  year: number;
  submitted: number | null;
  accepted: number | null;
  rate: number | null;
  sourceUrl: string | null;
}

export interface ChildEvent {
  slug: string;
  acronym: string;
  name: string | null;
  type: string;
  startDate: string | null;
  nextDeadline: { kind: string; at: string } | null;
  website: string | null;
}

export interface EventDetail {
  id: number;
  slug: string;
  seriesKey: string;
  acronym: string;
  name: string | null;
  year: number;
  type: string;
  parent: { slug: string; acronym: string; year: number; name: string | null } | null;
  subfields: string[];
  topics: string[];
  cfpTopics: string[];
  rankCore: string | null;
  rankCcf: string | null;
  mode: string | null;
  locationRaw: string | null;
  venue: string | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  continent: string | null;
  startDate: string | null;
  endDate: string | null;
  dateText: string | null;
  website: string | null;
  description: string | null;
  submissionSite: string | null;
  pageLimit: string | null;
  reviewType: string | null;
  hasRebuttal: boolean | null;
  cfpText: string | null;
  cfpUrl: string | null;
  cfpFetchedAt: string | null;
  sources: string[];
  provenance: Record<string, string>;
  updatedAt: string;
  deadlines: DetailDeadline[];
  sourceRefs: DetailSource[];
  children: ChildEvent[];
  history: EditionSummary[];
  acceptance: AcceptancePoint[];
}
