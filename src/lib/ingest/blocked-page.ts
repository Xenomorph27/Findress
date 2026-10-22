/**
 * Detects pages that are not the page we asked for: bot challenges, JavaScript walls and error
 * pages that some sites serve to datacenter IPs (Vercel, GitHub runners) with HTTP 200.
 * Scraped text that matches must never be stored, and must never replace an earlier good value.
 */

const BLOCK_PHRASES: RegExp[] = [
  /a required part of this site couldn.?t load/i,
  /this may be due to a browser extension,? network issues,? or browser settings/i,
  /enable javascript (and cookies )?to (continue|view|access)/i,
  /(please )?enable cookies/i,
  /checking (if the site connection is secure|your browser)/i,
  /verify(ing)? (that )?you are (a )?human/i,
  /are you a robot/i,
  /unusual traffic from your (computer )?network/i,
  /access (to this page )?(has been )?denied/i,
  /request blocked/i,
  /attention required!? \| cloudflare/i,
  /just a moment\.\.\./i,
  /\bcaptcha\b/i,
  /ddos protection by/i,
  /error 1020|error 1015|error 1010/i,
];

/** Pages shorter than this cannot be an aims & scope section. */
export const MIN_SCOPE_CHARS = 120;

/** True when the text (or raw HTML) looks like a block/challenge/error page. */
export function looksBlocked(textOrHtml: string | null | undefined): boolean {
  if (!textOrHtml) return false;
  // Challenge pages are short; a long article that merely mentions "captcha" is not one.
  const head = textOrHtml.length > 6000 ? textOrHtml.slice(0, 6000) : textOrHtml;
  return BLOCK_PHRASES.some((re) => re.test(head));
}

/** A scraped value is storable when it is non-empty, long enough, and not a block page. */
export function isUsableScrape(
  text: string | null | undefined,
  minChars = MIN_SCOPE_CHARS,
): text is string {
  return typeof text === "string" && text.trim().length >= minChars && !looksBlocked(text);
}
