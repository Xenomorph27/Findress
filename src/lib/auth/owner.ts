import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/** For server components / actions: is the current request from the unlocked owner? */
export async function isOwner(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value, process.env.AUTH_SECRET);
}

/** Token for the private calendar feed URL (calendar apps can't send cookies). */
export async function icsFeedToken(): Promise<string | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("findress-ics-feed-v1")),
  );
  return Array.from(sig.slice(0, 18), (b) => b.toString(16).padStart(2, "0")).join("");
}
