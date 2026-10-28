import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * Outbound request policy for everything FIndress fetches on its own (ingestion scrapers and
 * the assistant's fetchPage tool). Websites come from upstream lists and CFP pages, so a URL or a
 * redirect may point at the machine running the job (127.0.0.1, the LAN router, a cloud metadata
 * address). Only public destinations are allowed:
 * - assertFetchableUrl() checks every URL and every redirect hop (scheme, credentials, IP literals)
 * - publicOnlyLookup() checks what a host name RESOLVES to, at connect time, so a name that
 *   resolves (or later re-resolves) to a private address is refused too (no DNS rebinding)
 */

export class BlockedDestinationError extends Error {
  constructor(url: string, why: string) {
    super(`refused to fetch ${url}: ${why}`);
    this.name = "BlockedDestinationError";
  }
}

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // RFC 1918
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (cloud metadata lives here)
  ["172.16.0.0", 12], // RFC 1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // RFC 1918
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, broadcast
] as const)
  blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["64:ff9b::", 96], // NAT64 (maps to IPv4)
  ["100::", 64], // discard
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
] as const)
  blocked.addSubnet(net, prefix, "ipv6");

/** True for a globally routable address; false for loopback, private, link-local, etc. */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return !blocked.check(ip, "ipv4");
  if (family === 6) {
    // IPv4-mapped (::ffff:a.b.c.d / ::ffff:7f00:1) and IPv4-compatible forms: judge the IPv4 part.
    const mapped = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return isPublicAddress(mapped[1]);
    const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
    if (hexMapped) {
      const hi = parseInt(hexMapped[1], 16);
      const lo = parseInt(hexMapped[2], 16);
      return isPublicAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return !blocked.check(ip, "ipv6");
  }
  return false;
}

/**
 * Throws BlockedDestinationError unless `url` is an http(s) URL without credentials whose host
 * is a name, or a public IP literal. WHATWG URL parsing already turns alternate IPv4 spellings
 * (2130706433, 0x7f.1, 127.1) into dotted quads. `allowHost` adds a caller policy (the
 * assistant's host allow-list), applied to every hop as well.
 */
export function assertFetchableUrl(url: string, allowHost?: (host: string) => boolean): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new BlockedDestinationError(url, "not a valid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:")
    throw new BlockedDestinationError(url, `scheme ${u.protocol} is not allowed`);
  if (u.username || u.password)
    throw new BlockedDestinationError(url, "URLs with credentials are not fetched");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost"))
    throw new BlockedDestinationError(url, "local host");
  if (isIP(host) && !isPublicAddress(host))
    throw new BlockedDestinationError(url, "private or reserved address");
  if (allowHost && !allowHost(host))
    throw new BlockedDestinationError(url, `host ${host} is not allowed here`);
  return u;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * dns.lookup() replacement for the HTTP agent: resolves every address of the name and refuses
 * the connection if any of them is not public (a name with one private address could be
 * answered with it on the next resolution).
 */
export function publicOnlyLookup(
  hostname: string,
  options: { all?: boolean; family?: number } | number | undefined,
  callback: LookupCallback,
  resolve: typeof dnsLookup = dnsLookup,
): void {
  const family = typeof options === "number" ? options : (options?.family ?? 0);
  const all = typeof options === "object" && options?.all === true;
  resolve(hostname, { all: true, family }, (err, addresses) => {
    if (err) return callback(err, all ? [] : "");
    const list = addresses as LookupAddress[];
    const bad = list.find((a) => !isPublicAddress(a.address));
    if (bad || list.length === 0) {
      const e = new BlockedDestinationError(
        hostname,
        bad ? `resolves to a private or reserved address (${bad.address})` : "no address",
      ) as NodeJS.ErrnoException;
      e.code = "EBLOCKED";
      return callback(e, all ? [] : "");
    }
    if (all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

let agent: Agent | null = null;

/** fetch() whose connections only ever reach public addresses (see publicOnlyLookup). */
export const publicFetch: typeof fetch = (input, init) => {
  agent ??= new Agent({ connect: { lookup: publicOnlyLookup as never } });
  return undiciFetch(input as never, { ...(init as object), dispatcher: agent }) as never;
};
