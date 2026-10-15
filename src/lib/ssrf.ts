// ============================================================
// Shared SSRF guard for server-side URL fetches.
//
// Hostname denylists alone are bypassable: WHATWG URL normalizes
// decimal/hex/octal IPv4 (2130706433 -> 127.0.0.1), but leaves
// IPv6-mapped forms ([::ffff:7f00:1]), trailing-dot hosts
// (localhost.), and DNS names that resolve private (localtest.me,
// rebinding services). Redirects can also swap the target after
// the check. This module:
//   1. validates scheme / port / credentials / hostname,
//   2. resolves DNS and refuses if ANY address is private,
//   3. PINs the connection to the pre-validated IP (custom
//      `lookup`), defeating DNS rebinding between check and connect,
//   4. follows redirects manually, re-validating every hop.
// ============================================================

import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";

/** Policy violation -> caller may map to 400. Network problems -> 502. */
export class SsrfError extends Error {
  readonly blocked: boolean;
  constructor(message: string, blocked = true) {
    super(message);
    this.name = "SsrfError";
    this.blocked = blocked;
  }
}

// ---------------- IP ranges ----------------

export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return true; // unparseable -> refuse
  const o = parts.map((p) => Number(p));
  if (o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = o;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10/8
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18/15
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function expandIPv6(ip: string): string[] | null {
  if (!ip.includes("::")) {
    const parts = ip.split(":");
    return parts.length === 8 ? parts.map((h) => h.padStart(4, "0")) : null;
  }
  const [head, tail = ""] = ip.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const fill = 8 - headParts.length - tailParts.length;
  if (fill < 0) return null;
  return [...headParts, ...Array(fill).fill("0"), ...tailParts].map((h) => h.padStart(4, "0"));
}

function hextetToV4(hi: string, lo: string): string {
  const a = parseInt(hi, 16);
  const b = parseInt(lo, 16);
  return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
}

export function isPrivateIPv6(raw: string): boolean {
  let ip = raw.toLowerCase().split("%")[0]; // drop zone id
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  // Normalize through URL so ::ffff:127.0.0.1 becomes ::ffff:7f00:1.
  try {
    ip = new URL(`http://[${ip}]`).hostname.slice(1, -1);
  } catch {
    return true;
  }
  const g = expandIPv6(ip);
  if (!g || g.length !== 8) return true; // unparseable -> refuse
  const zeroHead = (n: number) => g.slice(0, n).every((h) => h === "0000");
  if (zeroHead(8)) return true; // ::
  if (zeroHead(7) && g[7] === "0001") return true; // ::1 loopback
  if (zeroHead(5) && g[5] === "ffff") {
    // ::ffff:a.b.c.d IPv4-mapped
    return isPrivateIPv4(hextetToV4(g[6], g[7]));
  }
  if (zeroHead(6)) {
    // ::a.b.c.d deprecated IPv4-compatible
    return isPrivateIPv4(hextetToV4(g[6], g[7]));
  }
  if (g[0] === "2002") {
    // 6to4 embeds v4 in the next two hextets
    return isPrivateIPv4(hextetToV4(g[1], g[2]));
  }
  if (g[0] === "0064" && g[1] === "ff9b" && zeroHead.call(null, 0) && g.slice(2, 6).every((h) => h === "0000")) {
    // 64:ff9b::/96 NAT64 embeds v4
    return isPrivateIPv4(hextetToV4(g[6], g[7]));
  }
  const first = parseInt(g[0], 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

// ---------------- hostname policy ----------------

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "metadata",
]);
const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".localdomain", ".home.arpa"];

function assertPublicHost(hostname: string): string {
  const h = hostname.toLowerCase().replace(/\.$/, ""); // FQDN trailing dot
  if (!h) throw new SsrfError("invalid url");
  if (BLOCKED_HOSTNAMES.has(h)) throw new SsrfError("host not allowed");
  if (BLOCKED_HOST_SUFFIXES.some((s) => h.endsWith(s))) throw new SsrfError("host not allowed");
  const bare = h.replace(/^\[|\]$/g, "");
  const family = isIP(bare);
  if (family === 4 && isPrivateIPv4(bare)) throw new SsrfError("host not allowed");
  if (family === 6 && isPrivateIPv6(bare)) throw new SsrfError("host not allowed");
  return h;
}

/** Validate scheme/port/credentials/host. Returns normalized host. */
export function parsePublicHttpUrl(raw: string): { url: URL; host: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SsrfError("invalid url");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new SsrfError("unsupported protocol");
  if (u.username || u.password) throw new SsrfError("credentials in url not allowed");
  const port = u.port || (u.protocol === "https:" ? "443" : "80");
  if (port !== "80" && port !== "443") throw new SsrfError("port not allowed");
  const host = assertPublicHost(u.hostname);
  return { url: u, host };
}

async function resolvePublicIp(host: string): Promise<{ ip: string; family: 4 | 6 }> {
  const bare = host.replace(/^\[|\]$/g, "");
  const literal = isIP(bare);
  if (literal === 4 || literal === 6) return { ip: bare, family: literal };
  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await new Promise((resolve, reject) =>
      dnsLookup(bare, { all: true, verbatim: true }, (err, result) =>
        err ? reject(err) : resolve(result as Array<{ address: string; family: number }>)
      )
    );
  } catch {
    throw new SsrfError("dns lookup failed", false);
  }
  if (!addrs?.length) throw new SsrfError("dns lookup failed", false);
  for (const a of addrs) {
    const priv = a.family === 4 ? isPrivateIPv4(a.address) : isPrivateIPv6(a.address);
    if (priv) throw new SsrfError("host resolves to a private address");
  }
  return { ip: addrs[0].address, family: addrs[0].family === 6 ? 6 : 4 };
}

// ---------------- pinned fetch ----------------

interface HopResult {
  status: number;
  contentType: string;
  location?: string;
  text: string;
  truncated: boolean;
}

function requestPinned(
  url: URL,
  ip: string,
  family: 4 | 6,
  headers: Record<string, string>,
  timeoutMs: number,
  maxBytes: number
): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = mod(
      url,
      {
        method: "GET",
        headers,
        timeout: timeoutMs,
        // Pin the socket to the address we already validated — a DNS
        // rebind between the check and the connect cannot retarget it.
        lookup: ((_h: string, options: { all?: boolean }, cb: (...args: unknown[]) => void) => {
          if (options && options.all) cb(null, [{ address: ip, family }]);
          else cb(null, ip, family);
        }) as never,
      },
      (res: IncomingMessage) => {
        const status = res.statusCode || 0;
        const contentType = String(res.headers["content-type"] || "");
        if (status >= 300 && status < 400) {
          res.resume(); // drain, don't download redirect bodies
          resolve({ status, contentType, location: res.headers.location ? String(res.headers.location) : undefined, text: "", truncated: false });
          return;
        }
        const chunks: Buffer[] = [];
        let received = 0;
        let truncated = false;
        let ended = false;
        const finish = (trunc: boolean) =>
          resolve({ status, contentType, text: Buffer.concat(chunks).toString("utf-8"), truncated: trunc });
        res.on("data", (c: Buffer) => {
          if (truncated) return;
          received += c.length;
          if (received > maxBytes) {
            const keep = Math.max(0, c.length - (received - maxBytes));
            if (keep > 0) chunks.push(c.subarray(0, keep));
            truncated = true;
            res.destroy();
            finish(true);
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => {
          ended = true;
          finish(truncated);
        });
        res.on("aborted", () => {
          if (!ended) finish(true);
        });
        res.on("error", () => {
          if (!ended) truncated ? finish(true) : reject(new Error("fetch failed"));
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
}

export interface SafeFetchResult {
  status: number;
  finalUrl: string;
  contentType: string;
  text: string;
  truncated: boolean;
}

/**
 * SSRF-hardened GET that returns the response body as text.
 * Every hop (including redirects) is validated and connection-pinned.
 * Throws SsrfError on policy violations or network failure.
 */
export async function safeFetchText(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxBytes = opts.maxBytes ?? 2_000_000;
  const maxRedirects = opts.maxRedirects ?? 5;

  let current = rawUrl;
  let currentUrl = "";
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const { url, host } = parsePublicHttpUrl(current);
    currentUrl = url.toString();
    const { ip, family } = await resolvePublicIp(host);
    const result = await requestPinned(url, ip, family, opts.headers ?? {}, timeoutMs, maxBytes);
    if (result.location && result.status >= 300 && result.status < 400) {
      let next: string;
      try {
        next = new URL(result.location, url).toString();
      } catch {
        throw new SsrfError("bad redirect target");
      }
      current = next;
      continue;
    }
    return {
      status: result.status,
      finalUrl: currentUrl,
      contentType: result.contentType,
      text: result.text,
      truncated: result.truncated,
    };
  }
  throw new SsrfError("too many redirects");
}