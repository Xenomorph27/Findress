import * as cheerio from "cheerio";

export interface ArxivPaper {
  title: string;
  authors: string[];
  published: string;
  summary: string;
  url: string;
}

/** Parse an arXiv API Atom feed. */
export function parseArxivFeed(xml: string, max = 5): ArxivPaper[] {
  const $ = cheerio.load(xml, { xml: true });
  const out: ArxivPaper[] = [];
  $("entry").each((_, el) => {
    if (out.length >= max) return;
    const e = $(el);
    const id = e.find("id").first().text().trim();
    const url = e.find('link[rel="alternate"]').attr("href") ?? id.replace(/^http:/, "https:");
    out.push({
      title: e.find("title").first().text().replace(/\s+/g, " ").trim(),
      authors: e
        .find("author > name")
        .map((_, a) => $(a).text().trim())
        .get()
        .slice(0, 6),
      published:
        e.find("published").text().trim().slice(0, 10) ||
        e.find("updated").text().trim().slice(0, 10),
      summary: e.find("summary").text().replace(/\s+/g, " ").trim().slice(0, 500),
      url,
    });
  });
  return out;
}

export function arxivQueryUrl(query: string, max: number): string {
  const terms = query
    .replace(/["():]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((t) => `all:${t}`)
    .join(" AND ");
  const params = new URLSearchParams({
    search_query: terms || "all:machine learning",
    sortBy: "submittedDate",
    sortOrder: "descending",
    max_results: String(Math.min(Math.max(max, 1), 5)),
  });
  return `https://export.arxiv.org/api/query?${params}`;
}
