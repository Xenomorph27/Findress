/**
 * SCImago Journal & Country Rank (SJR) data, from the CSV a person downloads from scimagojr.com
 * ("Download data" on the journal rankings page). Semicolon-separated, quoted, decimal commas,
 * ISSNs as 8 digits without a hyphen. We never fetch it automatically (the site blocks bots, and
 * the terms are the user's to read): the file is imported by hand once a year.
 *
 * Attribution wherever SJR is shown: "Data: SCImago Journal & Country Rank, source Scopus®".
 */

export const SJR_CREDIT = "Data: SCImago Journal & Country Rank, source Scopus®";
export const SJR_URL = "https://www.scimagojr.com/";

export interface SjrRecord {
  rank: number | null;
  sourceId: string | null;
  title: string;
  type: string | null;
  /** 8-character ISSNs without hyphen, e.g. "15324435". */
  issns: string[];
  sjr: number | null;
  /** "Q1".."Q4", or null when SCImago has none ("-"). */
  quartile: "Q1" | "Q2" | "Q3" | "Q4" | null;
  hIndex: number | null;
  /** Year of the dataset when it can be read from the header (e.g. "Total Docs. (2024)"). */
  year: number | null;
}

/** Split a delimited text into rows of cells, honouring quotes (with "" escapes) and newlines. */
export function parseDelimited(text: string, delimiter = ";"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some((c) => c !== "")) rows.push(row);
  }
  return rows;
}

/** "1532-4435", "15324435", "ISSN 1532-4435" → "15324435"; null when it is not an ISSN. */
export function normalizeIssn(raw: string | null | undefined): string | null {
  const s = (raw ?? "").replace(/[^0-9Xx]/g, "").toUpperCase();
  return /^\d{7}[\dX]$/.test(s) ? s : null;
}

export function formatIssn(issn8: string): string {
  return `${issn8.slice(0, 4)}-${issn8.slice(4)}`;
}

const num = (s: string | undefined): number | null => {
  const t = (s ?? "").trim().replace(",", ".");
  if (!t || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export function parseScimagoCsv(text: string): SjrRecord[] {
  const rows = parseDelimited(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const iRank = col("rank");
  const iId = col("sourceid");
  const iTitle = col("title");
  const iType = col("type");
  const iIssn = col("issn");
  const iSjr = col("sjr");
  const iQ = col("sjr best quartile");
  const iH = col("h index", "h-index");
  if (iTitle < 0 || iIssn < 0 || iSjr < 0 || iQ < 0) {
    throw new Error(
      "This does not look like a SCImago journal CSV (need Title, Issn, SJR, SJR Best Quartile columns).",
    );
  }
  const yearCol = header.findIndex((h) => /^total docs\.? \((\d{4})\)/.test(h));
  const year = yearCol >= 0 ? Number(/\((\d{4})\)/.exec(header[yearCol])![1]) : null;
  const out: SjrRecord[] = [];
  for (const r of rows.slice(1)) {
    const title = (r[iTitle] ?? "").trim();
    if (!title) continue;
    const q = (r[iQ] ?? "").trim().toUpperCase();
    out.push({
      rank: iRank >= 0 ? num(r[iRank]) : null,
      sourceId: iId >= 0 ? (r[iId] ?? "").trim() || null : null,
      title,
      type: iType >= 0 ? (r[iType] ?? "").trim() || null : null,
      issns: (r[iIssn] ?? "")
        .split(/[,\s]+/)
        .map(normalizeIssn)
        .filter((x): x is string => x !== null),
      sjr: num(r[iSjr]),
      quartile: /^Q[1-4]$/.test(q) ? (q as SjrRecord["quartile"]) : null,
      hIndex: iH >= 0 ? num(r[iH]) : null,
      year,
    });
  }
  return out;
}

/** ISSN → record. If an ISSN appears twice, the better-ranked (lower rank number) record wins. */
export function indexByIssn(records: SjrRecord[]): Map<string, SjrRecord> {
  const idx = new Map<string, SjrRecord>();
  for (const rec of records) {
    for (const issn of rec.issns) {
      const cur = idx.get(issn);
      if (!cur || (rec.rank ?? Infinity) < (cur.rank ?? Infinity)) idx.set(issn, rec);
    }
  }
  return idx;
}

/** First record that matches any of the journal's ISSNs, or null. */
export function matchSjr(
  journalIssns: (string | null | undefined)[],
  idx: Map<string, SjrRecord>,
): SjrRecord | null {
  for (const raw of journalIssns) {
    const n = normalizeIssn(raw);
    const hit = n ? idx.get(n) : undefined;
    if (hit) return hit;
  }
  return null;
}
