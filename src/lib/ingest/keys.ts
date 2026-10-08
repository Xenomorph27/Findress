/**
 * Cross-source identity: events are deduplicated by normalized acronym + year (CLAUDE.md).
 * "NeurIPS 2026" (HF), "NeurIPS" + confs[2026] (ccfddl) and "NIPS 2026" (WikiCFP) all map to
 * "neurips-2026".
 */

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/** Decode HTML entities, including WikiCFP's double-escaped "&amp;amp;". */
export function decodeEntities(input: string): string {
  let s = input;
  for (let i = 0; i < 3 && /&(?:[a-z]+|#\d+);/i.test(s); i++) {
    s = s
      .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
      .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)));
  }
  return s;
}

/** Normalize whitespace and decode entities. */
export function cleanText(input: string | null | undefined): string | null {
  if (input == null) return null;
  const s = decodeEntities(String(input)).replace(/\s+/g, " ").trim();
  return s.length ? s : null;
}

/**
 * Display acronym: strips the year, indexing/publisher decorations WikiCFP posters add
 * ("--EI", "Springer--", "ACM--CFP--") and surrounding noise.
 */
export function cleanAcronym(raw: string): string {
  let s = decodeEntities(raw).replace(/\s+/g, " ").trim();
  s = s.replace(/\b(?:19|20)\d{2}\b/g, " ");
  s = s.replace(/^(?:(?:ACM|IEEE|Springer|EI|Ei|CFP|SCOPUS|Scopus)\s*[-–]{1,2}\s*)+/, "");
  s = s.replace(/\s*[-–]{1,2}\s*(?:EI|Ei|Scopus|SCOPUS|CFP)\s*$/, "");
  s = s
    .replace(/\s+/g, " ")
    .replace(/[\s:–-]+$/, "")
    .trim();
  return s || raw.trim();
}

export function slugify(input: string): string {
  return decodeEntities(input)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Known spellings of the same series across sources. */
const SERIES_ALIASES: Record<string, string> = {
  nips: "neurips",
  sigkdd: "kdd",
  "acm-sigkdd": "kdd",
  "ieee-cec": "cec",
  "ijcnlp-and-aacl": "ijcnlp",
  "ijcnlp-aacl": "ijcnlp",
  "aacl-ijcnlp": "ijcnlp",
  aacl: "ijcnlp",
  acmmm: "acm-mm",
  "acm-multimedia": "acm-mm",
  mm: "acm-mm",
  ecmlpkdd: "ecml-pkdd",
  ecml: "ecml-pkdd",
  "the-web-conference": "www",
  thewebconf: "www",
  webconf: "www",
  evoapplications: "evoapps",
  "iclr-conference": "iclr",
};

export function seriesKeyFor(acronym: string): string {
  const slug = slugify(cleanAcronym(acronym));
  return SERIES_ALIASES[slug] ?? slug;
}

export function dedupeKeyFor(acronym: string, year: number): string {
  return `${seriesKeyFor(acronym)}-${year}`;
}

/** Extract the first plausible event year from text (e.g. "ALTA 2026 2026" → 2026). */
export function yearFrom(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = /\b(19[9]\d|20\d{2})\b/.exec(text);
  return m ? Number(m[1]) : null;
}

export function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  return crypto.subtle.digest("SHA-256", data).then((buf) =>
    Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
  );
}

/** Safe URL normalization: returns an absolute http(s) URL or null. */
export function normalizeUrl(input: string | null | undefined, base?: string): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed || /^(mailto|javascript|tel):/i.test(trimmed)) return null;
  try {
    const url = new URL(
      /^https?:\/\//i.test(trimmed) || base ? trimmed : `https://${trimmed}`,
      base,
    );
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
