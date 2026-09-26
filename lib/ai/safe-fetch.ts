import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { ApiError } from "@/lib/api/errors";

export { MAX_BASE_URL_CHARS, parseCustomBaseUrl } from "@/types/api";

/** A chat completion for one CV report stays far below this; the cap stops a hostile host from filling memory. */
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** public: reachable on the internet; private: a local or private network; blocked: never a model server. */
export type AddressKind = "public" | "private" | "blocked";

function ipv4Bytes(text: string): number[] | null {
  const parts = text.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) {
    return null;
  }
  const bytes = parts.map(Number);
  return bytes.every((byte) => byte <= 255) ? bytes : null;
}

type Range = readonly [number, number, number, number, number];

/** Where a local or private model server can live: loopback, RFC 1918, and CGNAT (Tailscale, for one). */
const PRIVATE_IPV4: readonly Range[] = [
  [127, 0, 0, 0, 8],
  [10, 0, 0, 0, 8],
  [172, 16, 0, 0, 12],
  [192, 168, 0, 0, 16],
  [100, 64, 0, 0, 10],
];

/** Never a model server: "this network", link-local (cloud metadata), documentation, benchmarking, relays, multicast, reserved. */
const BLOCKED_IPV4: readonly Range[] = [
  [0, 0, 0, 0, 8],
  [169, 254, 0, 0, 16],
  [192, 0, 0, 0, 24],
  [192, 0, 2, 0, 24],
  [192, 88, 99, 0, 24],
  [198, 18, 0, 0, 15],
  [198, 51, 100, 0, 24],
  [203, 0, 113, 0, 24],
  [224, 0, 0, 0, 4],
  [240, 0, 0, 0, 4],
];

function toUint32(bytes: readonly number[]): number {
  return (((bytes[0] ?? 0) << 24) | ((bytes[1] ?? 0) << 16) | ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0)) >>> 0;
}

/**
 * Cloud metadata services inside ranges that ALLOW_PRIVATE_ENDPOINTS admits (Alibaba Cloud sits in
 * CGNAT; the IPv6 endpoints of AWS and GCP are unique-local), so the private mode alone would let them through.
 */
const METADATA_IPV4 = new Set([toUint32([100, 100, 100, 200])]);
const METADATA_IPV6 = new Set(["fd00:ec2::254", "fd20:ce::254"].map((text) => ipv6Bytes(text)?.join(".")));

function inRange(value: number, [a, b, c, d, prefix]: Range): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return ((value & mask) >>> 0) === ((toUint32([a, b, c, d]) & mask) >>> 0);
}

function classifyIpv4(bytes: readonly number[]): AddressKind {
  const value = toUint32(bytes);
  if (METADATA_IPV4.has(value) || BLOCKED_IPV4.some((range) => inRange(value, range))) return "blocked";
  if (PRIVATE_IPV4.some((range) => inRange(value, range))) return "private";
  return "public";
}

function ipv6Bytes(text: string): number[] | null {
  let head = text;
  let tail: number[] = [];
  const lastColon = text.lastIndexOf(":");
  // An embedded IPv4 tail, as in ::ffff:192.0.2.1, fills the last 32 bits.
  if (text.slice(lastColon + 1).includes(".")) {
    const v4 = ipv4Bytes(text.slice(lastColon + 1));
    if (v4 === null) {
      return null;
    }
    tail = v4;
    head = `${text.slice(0, lastColon + 1)}0:0`;
  }
  const halves = head.split("::");
  if (halves.length > 2) {
    return null;
  }
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) {
    return null;
  }
  const groups = [...left, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...right];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) {
    return null;
  }
  const bytes = groups.flatMap((group) => {
    const value = parseInt(group, 16);
    return [value >> 8, value & 0xff];
  });
  if (tail.length === 4) {
    bytes.splice(12, 4, ...tail);
  }
  return bytes;
}

function classifyIpv6(b: readonly number[]): AddressKind {
  const zeros = (from: number, to: number) => b.slice(from, to).every((byte) => byte === 0);
  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::/96) forms reach the IPv4 address they carry.
  if (zeros(0, 10) && b[10] === 0xff && b[11] === 0xff) return classifyIpv4(b.slice(12));
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && zeros(4, 12)) return classifyIpv4(b.slice(12));
  if (zeros(0, 15) && b[15] === 1) return "private";
  if (METADATA_IPV6.has(b.join("."))) return "blocked";
  // Unique local addresses (fc00::/7) are the IPv6 private networks.
  if (((b[0] ?? 0) & 0xfe) === 0xfc) return "private";
  if (((b[0] ?? 0) & 0xe0) !== 0x20) return "blocked";
  // Inside 2000::/3: IETF assignments such as Teredo (2001::/23), documentation (2001:db8::/32), and 6to4 (2002::/16).
  const ietf = b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && (b[3] ?? 0) < 0x02;
  const documentation = b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8;
  const sixToFour = b[0] === 0x20 && b[1] === 0x02;
  return ietf || documentation || sixToFour ? "blocked" : "public";
}

export function classifyAddress(address: string): AddressKind {
  const ip = address.replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  const family = isIP(ip);
  if (family === 4) {
    const bytes = ipv4Bytes(ip);
    return bytes === null ? "blocked" : classifyIpv4(bytes);
  }
  if (family === 6) {
    const bytes = ipv6Bytes(ip);
    return bytes === null ? "blocked" : classifyIpv6(bytes);
  }
  return "blocked";
}

type Resolver = (hostname: string) => Promise<LookupAddress[]>;

export interface SafeFetchOptions {
  /** ALLOW_PRIVATE_ENDPOINTS: plain HTTP and private or loopback hosts, for a server the owner controls. */
  allowPrivate?: boolean;
  resolve?: Resolver;
  request?: typeof httpsRequest;
  httpRequest?: typeof httpRequest;
}

const systemResolver: Resolver = (hostname) => lookup(hostname, { all: true, verbatim: true });

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : Object.assign(new Error("The call was aborted."), { name: "AbortError" });
}

/** A DNS lookup cannot be cancelled, so an abort settles the call without waiting for the answer. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal | null): Promise<T> {
  if (signal === null) {
    return promise;
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function toHeaders(incoming: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      headers.append(name, item);
    }
  }
  return headers;
}

/**
 * T21/T27: fetch for a custom endpoint. The host is resolved here and every address must pass the
 * mode's rules; the connection then gets only that checked address, so a second DNS answer
 * (rebinding) cannot point it elsewhere. Redirects come back as responses and are never followed.
 */
export async function safeFetch(input: string, init: RequestInit = {}, options: SafeFetchOptions = {}): Promise<Response> {
  const url = new URL(input);
  const secure = url.protocol === "https:";
  if ((!secure && !(url.protocol === "http:" && options.allowPrivate)) || url.username !== "" || url.password !== "") {
    throw new ApiError("INVALID_INPUT");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const signal = init.signal ?? null;
  if (signal?.aborted) {
    throw abortReason(signal);
  }

  let addresses: LookupAddress[];
  try {
    addresses = await untilAborted((options.resolve ?? systemResolver)(hostname), signal);
  } catch (error) {
    // A name that does not exist is a wrong address; a temporary DNS failure may pass on a retry.
    if ((error as { code?: unknown } | null)?.code === "ENOTFOUND") {
      throw new ApiError("INVALID_INPUT", { cause: error });
    }
    throw error;
  }
  const allowed = (kind: AddressKind) => kind === "public" || (kind === "private" && options.allowPrivate === true);
  const pinned = addresses[0];
  if (pinned === undefined || !addresses.every((entry) => allowed(classifyAddress(entry.address)))) {
    throw new ApiError("INVALID_INPUT");
  }

  // Node asks for every address when it races IPv4 and IPv6 (autoSelectFamily); each one passed the check above.
  const checked = addresses.map(({ address, family }) => ({ address, family }));
  const pinnedLookup: LookupFunction = (_hostname, lookupOptions, callback) => {
    if (lookupOptions.all) {
      callback(null, checked);
    } else {
      callback(null, pinned.address, pinned.family);
    }
  };

  const headers = Object.fromEntries(new Headers(init.headers).entries());
  const body = typeof init.body === "string" ? init.body : null;
  if (body !== null) {
    headers["content-length"] = String(Buffer.byteLength(body));
  }
  const send = secure ? (options.request ?? httpsRequest) : (options.httpRequest ?? httpRequest);

  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const settle = (finish: () => void) => {
      if (!settled) {
        settled = true;
        finish();
      }
    };
    const fail = (error: unknown) => settle(() => reject(error));
    // A 101 reply, or a connection cut mid-answer, closes the socket without an error event, so the call would never settle.
    const closedEarly = () => fail(new Error("The endpoint closed the connection without a complete answer."));
    const outgoing = send(
      {
        protocol: url.protocol,
        hostname,
        port: url.port === "" ? (secure ? 443 : 80) : Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: init.method ?? "GET",
        headers,
        lookup: pinnedLookup,
        ...(secure && isIP(hostname) === 0 ? { servername: hostname } : {}),
        ...(signal ? { signal } : {}),
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        let size = 0;
        incoming.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            incoming.destroy();
            outgoing.destroy();
            fail(new Error("The endpoint sent more than the response limit."));
            return;
          }
          chunks.push(chunk);
        });
        incoming.on("end", () => {
          const status = incoming.statusCode ?? 502;
          const valid = status >= 200 && status <= 599;
          const empty = status === 204 || status === 205 || status === 304;
          settle(() =>
            resolve(
              new Response(empty ? null : Buffer.concat(chunks), {
                status: valid ? status : 502,
                headers: toHeaders(incoming.headers),
              }),
            ),
          );
        });
        incoming.on("error", fail);
        incoming.on("close", closedEarly);
      },
    );
    outgoing.on("error", fail);
    outgoing.on("close", closedEarly);
    if (body !== null) {
      outgoing.write(body);
    }
    outgoing.end();
  });
}
