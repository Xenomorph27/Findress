import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import { parseHTML } from "linkedom";
import { cleanText, normalizeUrl } from "@/lib/ingest/keys";

/**
 * Official CFP pages (SPEC §5.5): fetch the event's own page, extract the main text with
 * Readability, keep headings and bullets (the assistant cites sections), and pick out
 * submission essentials only when the text states them.
 */

export interface CfpExtraction {
  title: string | null;
  text: string;
  /** A same-site "Call for Papers" link found on the page (to follow once from a homepage). */
  cfpLink: string | null;
  submissionSite: string | null;
  reviewType: string | null;
  pageLimit: string | null;
  hasRebuttal: boolean | null;
}

const MAX_TEXT = 60_000;
const SUBMISSION_HOSTS =
  /^https?:\/\/(?:www\.)?(openreview\.net\/(?:group|forum)|cmt3\.research\.microsoft\.com\/|easychair\.org\/(?:conferences|cfp|my)|softconf\.com\/|[a-z0-9-]+\.softconf\.com\/|precisionconference\.com\/|new\.precisionconference\.com\/|submissions?\.[a-z0-9.-]+\/|linklings\.net\/)/i;

const NUMBER_WORDS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  twenty: 20,
};

/** Convert Readability's article HTML into plain text that keeps structure (## headings, - bullets). */
export function htmlToStructuredText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, img, iframe, form, nav, button").remove();
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    $(el).replaceWith(t ? `\n\n## ${t}\n\n` : "");
  });
  $("li").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    $(el).replaceWith(t ? `\n- ${t}` : "");
  });
  $("br").replaceWith("\n");
  $("p, div, section, article, table, tr, ul, ol, blockquote, dd, dt").each((_, el) => {
    $(el).append("\n\n");
  });
  $("td, th").each((_, el) => {
    $(el).append(" · ");
  });
  return $.root()
    .text()
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?· ?\n/g, "\n")
    .replace(/\n /g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function detectReviewType(text: string): string | null {
  if (/\btriple[- ]blind\b/i.test(text)) return "Triple-blind";
  if (/\bdouble[- ](blind|anonymous)\b/i.test(text)) return "Double-blind";
  if (/\bsingle[- ]blind\b/i.test(text)) return "Single-blind";
  if (/\bopen (peer )?review\b/i.test(text) && /\bopenreview\b/i.test(text) === false)
    return "Open review";
  return null;
}

/** Page limit only when stated near a paper/submission/limit phrase, e.g. "limited to 8 pages". */
export function detectPageLimit(text: string): string | null {
  const re =
    /(?:limited to|limit of|maximum of|max(?:imum)?\.?|up to|no more than|at most|not exceed|page limit(?: is| of)?)\s*(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|fifteen|sixteen|twenty)\s*(?:\(\d{1,2}\)\s*)?(?:content\s+)?pages?\b/i;
  const m =
    re.exec(text) ??
    // "8 pages for the main paper" (ICML style)
    /\b(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+pages?\s+(?:for|of)\s+(?:the\s+)?(?:main (?:paper|text|body|content)|content|the paper)\b/i.exec(
      text,
    );
  if (!m) {
    const alt = /\b(\d{1,2})[- ]page (?:limit|maximum|papers?|submissions?)\b/i.exec(text);
    return alt ? `${alt[1]} pages` : null;
  }
  const raw = m[1].toLowerCase();
  const n = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
  return n && n > 0 && n < 100 ? `${n} pages` : null;
}

export function extractCfp(html: string, pageUrl: string): CfpExtraction {
  const { document } = parseHTML(html);
  const base = new URL(pageUrl);

  // Links are read from the original document (Readability strips navigation).
  let cfpLink: string | null = null;
  let submissionSite: string | null = null;
  for (const a of Array.from(document.querySelectorAll("a[href]"))) {
    const href = normalizeUrl(a.getAttribute("href"), pageUrl);
    if (!href) continue;
    const label = (a.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!submissionSite && SUBMISSION_HOSTS.test(href)) submissionSite = href;
    if (
      !cfpLink &&
      /\b(call for (papers|submissions|contributions)|cfp|call for workshop papers)\b/i.test(
        label,
      ) &&
      new URL(href).host === base.host &&
      href !== pageUrl
    ) {
      cfpLink = href;
    }
  }

  let title: string | null = cleanText(document.querySelector("title")?.textContent);
  let text = "";
  try {
    const article = new Readability(document as unknown as Document, {
      charThreshold: 200,
    }).parse();
    if (article?.content) {
      text = htmlToStructuredText(article.content);
      title = cleanText(article.title) ?? title;
    }
  } catch {
    /* fall through to body text */
  }
  if (text.length < 200) {
    const { document: fresh } = parseHTML(html);
    text = htmlToStructuredText(fresh.querySelector("body")?.innerHTML ?? "");
  }
  text = text.slice(0, MAX_TEXT);

  return {
    title,
    text,
    cfpLink,
    submissionSite,
    reviewType: detectReviewType(text),
    pageLimit: detectPageLimit(text),
    hasRebuttal: /\b(rebuttal|author response|author feedback|discussion period)\b/i.test(text)
      ? true
      : null,
  };
}

/** True when the URL or title already looks like a call-for-papers page. */
export function looksLikeCfpPage(url: string, title: string | null): boolean {
  return /call[-_ ]?for[-_ ]?(papers|submissions|contributions)|\bcfp\b|callforpapers/i.test(
    `${url} ${title ?? ""}`,
  );
}
