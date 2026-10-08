/** Shared vocabularies for events, deadlines, filters and sources. */

export const EVENT_TYPES = ["conference", "workshop", "symposium", "journal_track"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  conference: "Conference",
  workshop: "Workshop",
  symposium: "Symposium",
  journal_track: "Journal-first track",
};

export const DEADLINE_KINDS = [
  "abstract",
  "paper",
  "supplementary",
  "rebuttal",
  "notification",
  "camera_ready",
  "registration",
  "other",
] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];
export const DEADLINE_KIND_LABEL: Record<DeadlineKind, string> = {
  abstract: "Abstract",
  paper: "Full paper",
  supplementary: "Supplementary",
  rebuttal: "Rebuttal",
  notification: "Notification",
  camera_ready: "Camera-ready",
  registration: "Registration",
  other: "Milestone",
};
/** Deadlines that count as "the next deadline" for sorting and countdowns. */
export const SUBMISSION_KINDS: readonly DeadlineKind[] = ["abstract", "paper"];

export const SUBFIELDS = [
  { id: "genai", label: "Generative AI" },
  { id: "nlp", label: "NLP" },
  { id: "cv", label: "Computer Vision" },
  { id: "ml", label: "ML & Theory" },
  { id: "rl-robotics", label: "RL & Robotics" },
  { id: "data-mining", label: "Data Mining & IR" },
  { id: "ai-safety", label: "AI Safety & Ethics" },
  { id: "speech", label: "Speech & Audio" },
  { id: "multimodal", label: "Multimodal" },
  { id: "hci-ai", label: "HCI × AI" },
  { id: "health-ai", label: "Health & Bio AI" },
  { id: "kr", label: "Reasoning & Planning" },
  { id: "ml-systems", label: "ML Systems" },
  { id: "ai-general", label: "General AI" },
] as const;
export type SubfieldId = (typeof SUBFIELDS)[number]["id"];
export const SUBFIELD_LABEL = Object.fromEntries(SUBFIELDS.map((s) => [s.id, s.label])) as Record<
  SubfieldId,
  string
>;
export function isSubfield(id: string): id is SubfieldId {
  return id in SUBFIELD_LABEL;
}

export const CORE_RANKS = ["A*", "A", "B", "C"] as const;
export const CCF_RANKS = ["A", "B", "C"] as const;
/** Filter values: CORE ranks as-is, CCF ranks prefixed, plus "unranked". */
export const RANK_FILTERS = ["A*", "A", "B", "C", "CCF-A", "CCF-B", "CCF-C", "unranked"] as const;
export type RankFilter = (typeof RANK_FILTERS)[number];

export const MODES = ["in_person", "hybrid", "virtual"] as const;
export type Mode = (typeof MODES)[number];
export const MODE_LABEL: Record<Mode, string> = {
  in_person: "In person",
  hybrid: "Hybrid",
  virtual: "Virtual",
};

export const CONTINENTS = [
  "Africa",
  "Asia",
  "Europe",
  "North America",
  "South America",
  "Oceania",
] as const;
export type Continent = (typeof CONTINENTS)[number];

export const SOURCES = [
  "ccfddl",
  "huggingface",
  "wikicfp",
  "openreview",
  "cfp",
  "topics",
  "geocode",
] as const;
/** Sources that produce events (vs. enrichment steps that improve existing events). */
export const LIST_SOURCES = ["ccfddl", "huggingface", "wikicfp", "openreview"] as const;
export type ListSourceName = (typeof LIST_SOURCES)[number];
export const ENRICHMENT_STEPS = ["cfp", "topics", "geocode"] as const;
export type EnrichmentStep = (typeof ENRICHMENT_STEPS)[number];
export type SourceName = (typeof SOURCES)[number];
export const SOURCE_META: Record<
  SourceName,
  { label: string; url: string; description: string; kind: "list" | "enrichment" }
> = {
  ccfddl: {
    label: "ccfddl",
    url: "https://github.com/ccfddl/ccf-deadlines",
    description:
      "Community-maintained YAML of CS conference deadlines, CCF/CORE ranks and acceptance rates.",
    kind: "list",
  },
  huggingface: {
    label: "Hugging Face ai-deadlines",
    url: "https://huggingface.co/spaces/huggingface/ai-deadlines",
    description: "Curated ML/NLP/CV deadlines with full milestone timelines.",
    kind: "list",
  },
  wikicfp: {
    label: "WikiCFP",
    url: "http://www.wikicfp.com",
    description: "Category RSS feeds — the broadest source of smaller conferences and workshops.",
    kind: "list",
  },
  openreview: {
    label: "OpenReview",
    url: "https://openreview.net",
    description: "Venue groups and workshop lists for venues hosted on OpenReview (API v2).",
    kind: "list",
  },
  cfp: {
    label: "Official CFP pages",
    url: "",
    description: "Readability-extracted call-for-papers text from each event's own website.",
    kind: "enrichment",
  },
  topics: {
    label: "Topic tagging",
    url: "",
    description: "Keyword rules that assign subfields and topic tags.",
    kind: "enrichment",
  },
  geocode: {
    label: "Geocoding",
    url: "https://nominatim.openstreetmap.org",
    description:
      "Static country table plus cached OpenStreetMap Nominatim lookups (1 req/s) for venue cities.",
    kind: "enrichment",
  },
};

/** Lower number = more trusted when two sources disagree on a field. */
export const SOURCE_PRIORITY: Record<SourceName, number> = {
  huggingface: 1,
  ccfddl: 2,
  openreview: 3,
  wikicfp: 4,
  cfp: 5,
  topics: 6,
  geocode: 7,
};
