import { createHmac } from "node:crypto";
import { isIPv6 } from "node:net";

/** DELTA-50: the quota day runs on GMT+8 (Asia/Makassar), which has no daylight saving time. */
const QUOTA_OFFSET_MS = 8 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** EXPIREAT is absolute, so an hour of slack keeps a store whose clock runs ahead from dropping a count before its window ends. */
const EXPIRY_MARGIN_S = 3600;
const STORE_TIMEOUT_MS = 5000;

export interface QuotaStore {
  read(key: string): Promise<number>;
  /** Adds one and sets the expiry when the key has none yet; returns the new count. */
  increment(key: string, expiresAtSeconds: number): Promise<number>;
}

export class QuotaStoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "QuotaStoreError";
  }
}

export interface QuotaStatus {
  limit: number;
  used: number;
  remaining: number;
  /** ISO 8601 with the +08:00 offset. */
  resetsAt: string;
}

export function quotaDay(nowMs: number): string {
  return new Date(nowMs + QUOTA_OFFSET_MS).toISOString().slice(0, 10);
}

/** The next 00:00 GMT+8, in UTC milliseconds. */
export function nextResetMs(nowMs: number): number {
  return Math.floor((nowMs + QUOTA_OFFSET_MS) / DAY_MS) * DAY_MS + DAY_MS - QUOTA_OFFSET_MS;
}

/** The start of the next clock hour, in UTC milliseconds. GMT+8 is a whole-hour offset, so both share hour boundaries. */
export function nextHourMs(nowMs: number): number {
  return Math.floor(nowMs / HOUR_MS) * HOUR_MS + HOUR_MS;
}

export function quotaIso(ms: number): string {
  return `${new Date(ms + QUOTA_OFFSET_MS).toISOString().slice(0, 19)}+08:00`;
}

/** Eight 16-bit groups of an address that passed isIPv6; a dotted IPv4 tail becomes the last two groups. */
function ipv6Groups(ip: string): number[] {
  let text = ip;
  const dotted = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (dotted !== null) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    text = `${ip.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.split("::");
  const left = head === "" ? [] : head.split(":");
  if (tail === undefined) {
    return left.map((group) => parseInt(group, 16));
  }
  const right = tail === "" ? [] : tail.split(":");
  const zeros = Array.from({ length: 8 - left.length - right.length }, () => "0");
  return [...left, ...zeros, ...right].map((group) => parseInt(group, 16));
}

/**
 * rules.md §4.3.4: the identity that gets hashed. An IPv6 client usually holds a whole /64, so it is
 * counted by that prefix; an IPv4 address written in IPv6 form counts as the IPv4 address.
 */
export function clientNetwork(clientIp: string): string {
  let ip = clientIp.trim().toLowerCase();
  ip = /^\[([^\]]+)\](?::\d+)?$/.exec(ip)?.[1] ?? ip;
  ip = ip.replace(/%.*$/, "");
  ip = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip)?.[1] ?? ip;
  if (!isIPv6(ip)) {
    return ip;
  }
  const groups = ipv6Groups(ip);
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");
  }
  return `${groups.slice(0, 4).map((group) => group.toString(16)).join(":")}::/64`;
}

function clientHash(secret: string, clientIp: string): string {
  return createHmac("sha256", secret).update(clientNetwork(clientIp)).digest("hex");
}

/** rules.md §4.3.4: only an HMAC of the client's network is stored, next to the GMT+8 date. */
export function quotaKey(secret: string, clientIp: string, nowMs: number): string {
  return `quota:v1:${quotaDay(nowMs)}:${clientHash(secret, clientIp)}`;
}

/** rules.md §4.3.6: the hourly counter uses the same HMAC, next to the GMT+8 hour. */
export function requestKey(secret: string, clientIp: string, nowMs: number): string {
  const hour = new Date(nowMs + QUOTA_OFFSET_MS).toISOString().slice(0, 13);
  return `requests:v1:${hour}:${clientHash(secret, clientIp)}`;
}

export interface RequestWindow {
  allowed: boolean;
  /** ISO 8601 with the +08:00 offset: the start of the next hour. */
  resetsAt: string;
}

export async function recordRequest(
  store: QuotaStore,
  key: string,
  limit: number,
  nowMs: number,
): Promise<RequestWindow> {
  const resetMs = nextHourMs(nowMs);
  const count = await store.increment(key, Math.floor(resetMs / 1000) + EXPIRY_MARGIN_S);
  return { allowed: count <= limit, resetsAt: quotaIso(resetMs) };
}

function toStatus(limit: number, used: number, nowMs: number): QuotaStatus {
  return { limit, used, remaining: Math.max(0, limit - used), resetsAt: quotaIso(nextResetMs(nowMs)) };
}

export async function readQuota(store: QuotaStore, key: string, limit: number, nowMs: number): Promise<QuotaStatus> {
  return toStatus(limit, await store.read(key), nowMs);
}

export async function recordAnalysis(
  store: QuotaStore,
  key: string,
  limit: number,
  nowMs: number,
): Promise<QuotaStatus> {
  const used = await store.increment(key, Math.floor(nextResetMs(nowMs) / 1000) + EXPIRY_MARGIN_S);
  return toStatus(limit, used, nowMs);
}

/** Development and tests only: counts live in this process and vanish on restart. */
export function createMemoryStore(now: () => number = Date.now): QuotaStore {
  const counters = new Map<string, { count: number; expiresAtMs: number }>();
  const live = (key: string) => {
    const entry = counters.get(key);
    if (entry !== undefined && entry.expiresAtMs <= now()) {
      counters.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    async read(key) {
      return live(key)?.count ?? 0;
    },
    async increment(key, expiresAtSeconds) {
      const entry = live(key) ?? { count: 0, expiresAtMs: expiresAtSeconds * 1000 };
      entry.count += 1;
      counters.set(key, entry);
      return entry.count;
    },
  };
}

function commandResult(entry: unknown): unknown {
  const record = entry !== null && typeof entry === "object" ? (entry as { result?: unknown; error?: unknown }) : null;
  if (record === null || record.error !== undefined) {
    throw new QuotaStoreError("Upstash command failed");
  }
  return record.result;
}

function toCount(value: unknown): number {
  const count = value === null ? 0 : Number(value);
  if (!Number.isInteger(count) || count < 0) {
    throw new QuotaStoreError("Upstash counter is not a count");
  }
  return count;
}

/** Upstash Redis over its REST API; errors never include the URL or the token. */
export function createUpstashStore(config: { url: string; token: string }, fetchImpl: typeof fetch = fetch): QuotaStore {
  const call = async (path: string, body: unknown): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetchImpl(`${config.url}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
      });
    } catch (error) {
      throw new QuotaStoreError("Upstash request failed", { cause: error });
    }
    if (!response.ok) {
      throw new QuotaStoreError(`Upstash answered ${response.status}`);
    }
    try {
      return await response.json();
    } catch (error) {
      throw new QuotaStoreError("Upstash sent invalid JSON", { cause: error });
    }
  };
  return {
    async read(key) {
      return toCount(commandResult(await call("", ["GET", key])));
    },
    async increment(key, expiresAtSeconds) {
      const results = await call("/pipeline", [
        ["INCR", key],
        ["EXPIREAT", key, String(expiresAtSeconds), "NX"],
      ]);
      if (!Array.isArray(results) || results.length !== 2) {
        throw new QuotaStoreError("Upstash pipeline answered unexpectedly");
      }
      commandResult(results[1]);
      return toCount(commandResult(results[0]));
    },
  };
}
