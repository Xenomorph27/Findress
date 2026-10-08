/** Public site URL — read from NEXT_PUBLIC_SITE_URL everywhere, with a stable fallback. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://findress.vercel.app").replace(
  /\/+$/,
  "",
);

export const SITE_NAME = "FIndress";
export const SITE_TAGLINE = "Every AI/ML venue on Earth. One view.";
export const REPO_URL = "https://github.com/Xenomorph27/Findress";

/** Identifies every outbound request made by ingestion and the assistant tools. */
export const USER_AGENT = `FIndressBot/1.0 (+${REPO_URL})`;

/** Owner's default display timezone (SPEC §4.2). */
export const DEFAULT_TIMEZONE = process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || "Asia/Kolkata";

export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
