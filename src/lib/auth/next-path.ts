/**
 * Where to send the owner after login. Only same-site relative paths are allowed. Anything
 * absolute, protocol-relative ("//evil.com"), backslash-tricked ("/\evil.com"), carrying control
 * characters, or pointing back at /login or an API route falls back to "/".
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  // Backslashes and control characters: browsers normalise "\" to "/", so "/\evil.com" escapes.
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return "/";
  let url: URL;
  try {
    url = new URL(value, "http://findress.local");
  } catch {
    return "/";
  }
  if (url.origin !== "http://findress.local") return "/";
  if (url.pathname === "/login" || url.pathname.startsWith("/api/")) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}
