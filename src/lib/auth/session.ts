/**
 * Owner session (SPEC §8): a signed, httpOnly cookie set by /unlock after APP_PASSWORD matches.
 * Token = base64url(payload).base64url(HMAC-SHA256(payload, AUTH_SECRET)); payload = {exp}.
 * Uses Web Crypto only, so it works in Node route handlers and in proxy.ts.
 */

export const SESSION_COOKIE = "findress_owner";
export const SESSION_MAX_AGE_S = 30 * 24 * 3600;

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function createSessionToken(
  secret: string,
  maxAgeS = SESSION_MAX_AGE_S,
): Promise<string> {
  const payload = b64url(
    enc.encode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + maxAgeS })),
  );
  return `${payload}.${b64url(await hmac(secret, payload))}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
  secret: string | undefined,
): Promise<boolean> {
  if (!token || !secret) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  try {
    const expected = await hmac(secret, payload);
    if (!timingSafeEqualBytes(expected, fromB64url(sig))) return false;
    const { exp } = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { exp?: number };
    return typeof exp === "number" && exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

/** For route handlers: does this request carry a valid owner cookie? */
export async function isOwnerRequest(request: Request): Promise<boolean> {
  return verifySessionToken(
    readCookie(request.headers.get("cookie"), SESSION_COOKIE),
    process.env.AUTH_SECRET,
  );
}

/** Constant-time password check. */
export async function passwordMatches(
  input: string,
  expected: string | undefined,
): Promise<boolean> {
  if (!expected) return false;
  // Compare HMACs of both values so length differences don't leak.
  const key = "findress-password-compare";
  return timingSafeEqualBytes(await hmac(key, input), await hmac(key, expected));
}
