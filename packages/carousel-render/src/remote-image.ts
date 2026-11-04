import { lookup } from "node:dns";
import { request } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

/**
 * Turn an image reference in a spec into a data URI for Satori. A spec can come
 * from a caller, directly or stored on a content item and rendered later, so this
 * refuses anything that isn't a public image on the public internet, whoever asked:
 * https on the default port, no credentials, every address DNS returns public
 * (checked at connect time, so a name can't change its answer afterwards), the same
 * checks again on each redirect, and bytes that really are an image. A refused or
 * failed image falls back the way a missing one does, so a render never blocks on it.
 */

const MAX_REDIRECTS = 3;
const MAX_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

const NOT_PUBLIC_V4 = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier NAT, Tailscale, some cloud metadata
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3], // multicast and reserved, up to 255.255.255.255
] as const) {
  NOT_PUBLIC_V4.addSubnet(net, prefix, "ipv4");
}
// A separate list: BlockList matches an IPv4 address against IPv6 rules through its
// mapped form, so ::/3 in a shared list would refuse every IPv4 address.
const NOT_PUBLIC_V6 = new BlockList();
for (const [net, prefix] of [
  // Only 2000::/3 is public. This takes out loopback, IPv4-mapped, NAT64, unique
  // local (Railway's private network, AWS metadata), link-local and multicast.
  ["::", 3],
  ["4000::", 2],
  ["8000::", 1],
  // Inside 2000::/3, but tunnels to an IPv4 address or documentation.
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
] as const) {
  NOT_PUBLIC_V6.addSubnet(net, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !NOT_PUBLIC_V4.check(address, "ipv4");
  if (family === 6) return !NOT_PUBLIC_V6.check(address, "ipv6");
  return false;
}

/** Node hands an IP literal straight to connect, so this only sees real names. */
export const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    if (!addresses.length || !addresses.every((a) => isPublicAddress(a.address))) {
      return callback(new Error(`${hostname} does not resolve to a public address`), "", 0);
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0]!.address, addresses[0]!.family);
  });
};

function checkedUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.port || url.username || url.password) {
    throw new Error(`refused ${url.protocol}//${url.hostname}`);
  }
  // The URL parser has already normalized 2130706433, 0x7f.1 and friends.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host)) throw new Error(`refused ${url.hostname}`);
  return url;
}

function sniffMime(b: Buffer): string | undefined {
  if (b.subarray(0, 8).toString("latin1") === "\x89PNG\r\n\x1a\n") return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (b.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  return undefined;
}

function get(url: URL): Promise<{ location?: string; body?: Buffer }> {
  return new Promise((resolve, reject) => {
    // agent: false so we never reuse a socket something else opened unguarded.
    const req = request(url, { agent: false, lookup: publicOnlyLookup, signal: AbortSignal.timeout(TIMEOUT_MS) }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        return resolve({ location: res.headers.location });
      }
      if (status !== 200) {
        res.resume();
        return reject(new Error(`${url.hostname} returned ${status}`));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) req.destroy(new Error(`${url.hostname} sent more than ${MAX_BYTES} bytes`));
        else chunks.push(chunk);
      });
      res.on("end", () => resolve({ body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

export async function fetchAsDataUri(reference: string): Promise<string | undefined> {
  // Already a data URI? Use as-is.
  if (/^data:image\//i.test(reference)) return reference;
  try {
    let url = checkedUrl(reference);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const { location, body } = await get(url);
      if (location) {
        url = checkedUrl(new URL(location, url).href);
        continue;
      }
      const mime = body && sniffMime(body);
      if (!mime) throw new Error(`${url.hostname} did not return an image`);
      return `data:${mime};base64,${body.toString("base64")}`;
    }
    throw new Error("too many redirects");
  } catch (err) {
    console.warn(`[carousel-render] skipped an image: ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
}
