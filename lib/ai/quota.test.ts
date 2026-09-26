import { describe, expect, it, vi } from "vitest";
import {
  QuotaStoreError,
  clientNetwork,
  createMemoryStore,
  createUpstashStore,
  formatWib,
  nextHourMs,
  nextResetMs,
  quotaKey,
  readQuota,
  recordAnalysis,
  recordRequest,
  requestKey,
  wibDay,
} from "./quota";

const LAST_SECOND_OF_DAY = Date.parse("2026-09-26T16:59:59Z"); // 23:59:59 WIB, 26 Sept
const MIDNIGHT = Date.parse("2026-09-26T17:00:00Z"); // 00:00 WIB, 27 Sept

describe("WIB day and reset", () => {
  it("uses UTC+7 for the day and resets at 00:00 WIB", () => {
    expect(wibDay(LAST_SECOND_OF_DAY)).toBe("2026-09-26");
    expect(formatWib(nextResetMs(LAST_SECOND_OF_DAY))).toBe("2026-09-27T00:00:00+07:00");
    expect(wibDay(MIDNIGHT)).toBe("2026-09-27");
    expect(formatWib(nextResetMs(MIDNIGHT))).toBe("2026-09-28T00:00:00+07:00");
  });
});

describe("quotaKey", () => {
  it("holds the WIB date and an HMAC, never the IP itself", () => {
    const key = quotaKey("secret-a", "203.0.113.7", LAST_SECOND_OF_DAY);

    expect(key).toMatch(/^quota:v1:2026-09-26:[0-9a-f]{64}$/);
    expect(key).not.toContain("203.0.113.7");
    expect(quotaKey("secret-a", "203.0.113.7", LAST_SECOND_OF_DAY)).toBe(key);
    expect(quotaKey("secret-b", "203.0.113.7", LAST_SECOND_OF_DAY)).not.toBe(key);
    expect(quotaKey("secret-a", "203.0.113.8", LAST_SECOND_OF_DAY)).not.toBe(key);
  });
});

describe("clientNetwork (rules.md §4.3.4)", () => {
  it.each([
    ["203.0.113.7", "203.0.113.7"],
    [" 203.0.113.7:51000 ", "203.0.113.7"],
    ["2001:db8:85a3::8a2e:370:7334", "2001:db8:85a3:0::/64"],
    ["2001:0DB8:85A3:0000:0000:8A2E:0370:7334", "2001:db8:85a3:0::/64"],
    ["2001:db8:85a3:0:ffff:ffff:ffff:ffff", "2001:db8:85a3:0::/64"],
    ["2001:db8:85a3:1::1", "2001:db8:85a3:1::/64"],
    ["[2001:db8::1]:443", "2001:db8:0:0::/64"],
    ["fe80::1%eth0", "fe80:0:0:0::/64"],
    ["::ffff:198.51.100.7", "198.51.100.7"],
    ["::FFFF:C633:6407", "198.51.100.7"],
    ["unknown", "unknown"],
  ])("maps %s to %s", (input, expected) => {
    expect(clientNetwork(input)).toBe(expected);
  });

  it("gives a whole IPv6 /64 one key, and an IPv4 address the same key in both notations", () => {
    const at = LAST_SECOND_OF_DAY;

    expect(quotaKey("s", "2001:db8:85a3::1", at)).toBe(quotaKey("s", "2001:db8:85a3:0:abcd::99", at));
    expect(quotaKey("s", "2001:db8:85a3:1::1", at)).not.toBe(quotaKey("s", "2001:db8:85a3::1", at));
    expect(requestKey("s", "::ffff:198.51.100.7", at)).toBe(requestKey("s", "198.51.100.7", at));
  });
});

describe("memory store", () => {
  it("counts until the expiry and then starts again from zero", async () => {
    let clock = LAST_SECOND_OF_DAY;
    const store = createMemoryStore(() => clock);
    const key = quotaKey("secret", "198.51.100.1", clock);

    expect(await readQuota(store, key, 10, clock)).toEqual({
      limit: 10,
      used: 0,
      remaining: 10,
      resetsAt: "2026-09-27T00:00:00+07:00",
    });
    await recordAnalysis(store, key, 10, clock);
    expect(await recordAnalysis(store, key, 10, clock)).toMatchObject({ used: 2, remaining: 8 });

    clock = nextResetMs(LAST_SECOND_OF_DAY) + 3600 * 1000;
    expect(await store.read(key)).toBe(0);
  });

  it("never reports a negative remaining count", async () => {
    const store = createMemoryStore(() => MIDNIGHT);
    for (let i = 0; i < 3; i++) await recordAnalysis(store, "k", 2, MIDNIGHT);
    expect(await readQuota(store, "k", 2, MIDNIGHT)).toMatchObject({ used: 3, remaining: 0 });
  });
});

describe("hourly request window (rules.md §4.3.6)", () => {
  const TEN_PAST_TWO = Date.parse("2026-09-26T07:10:00Z"); // 14:10 WIB

  it("keys the counter by WIB hour and HMAC, never by the IP", () => {
    const key = requestKey("secret-a", "203.0.113.7", TEN_PAST_TWO);

    expect(key).toMatch(/^requests:v1:2026-09-26T14:[0-9a-f]{64}$/);
    expect(key).not.toContain("203.0.113.7");
    expect(key.split(":").at(-1)).toBe(quotaKey("secret-a", "203.0.113.7", TEN_PAST_TWO).split(":").at(-1));
    expect(requestKey("secret-a", "203.0.113.7", TEN_PAST_TWO + 50 * 60 * 1000)).not.toBe(key);
  });

  it("allows the limit, refuses the next request, and resets at the start of the next hour", async () => {
    let clock = TEN_PAST_TWO;
    const store = createMemoryStore(() => clock);
    const key = requestKey("secret", "198.51.100.1", clock);

    expect(formatWib(nextHourMs(clock))).toBe("2026-09-26T15:00:00+07:00");
    for (let i = 0; i < 2; i++) {
      expect(await recordRequest(store, key, 2, clock)).toEqual({ allowed: true, resetsAt: "2026-09-26T15:00:00+07:00" });
    }
    expect((await recordRequest(store, key, 2, clock)).allowed).toBe(false);

    clock = nextHourMs(TEN_PAST_TWO);
    expect((await recordRequest(store, requestKey("secret", "198.51.100.1", clock), 2, clock)).allowed).toBe(true);
  });
});

describe("Upstash store", () => {
  const CONFIG = { url: "https://example-db.upstash.io", token: "upstash-test-token" };

  function upstash(...replies: Array<Response | Error>) {
    const calls: Array<{ url: string; body: unknown; authorization: string }> = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        body: JSON.parse(String(init?.body)),
        authorization: (init?.headers as Record<string, string>).Authorization,
      });
      const reply = replies.shift() ?? Response.json({ error: "no reply" }, { status: 500 });
      if (reply instanceof Error) throw reply;
      return reply;
    });
    return { calls, store: createUpstashStore(CONFIG, fetchMock as unknown as typeof fetch) };
  }

  it("reads a counter with GET and treats a missing key as zero", async () => {
    const { calls, store } = upstash(Response.json({ result: "3" }), Response.json({ result: null }));

    expect(await store.read("quota:v1:2026-09-26:abc")).toBe(3);
    expect(await store.read("quota:v1:2026-09-26:def")).toBe(0);
    expect(calls[0]).toEqual({
      url: CONFIG.url,
      body: ["GET", "quota:v1:2026-09-26:abc"],
      authorization: "Bearer upstash-test-token",
    });
  });

  it("increments and sets the expiry once in one pipeline", async () => {
    const { calls, store } = upstash(Response.json([{ result: 4 }, { result: 1 }]));
    const expiresAt = Math.floor(nextResetMs(MIDNIGHT) / 1000) + 3600;

    expect((await recordAnalysis(store, "k", 10, MIDNIGHT)).used).toBe(4);
    expect(calls[0]).toMatchObject({
      url: `${CONFIG.url}/pipeline`,
      body: [
        ["INCR", "k"],
        ["EXPIREAT", "k", String(expiresAt), "NX"],
      ],
    });
  });

  it("lets an hourly counter expire an hour after its window ends", async () => {
    const { calls, store } = upstash(Response.json([{ result: 21 }, { result: 0 }]));
    const expiresAt = Math.floor(nextHourMs(MIDNIGHT) / 1000) + 3600;

    expect((await recordRequest(store, "r", 20, MIDNIGHT)).allowed).toBe(false);
    expect(calls[0].body).toEqual([
      ["INCR", "r"],
      ["EXPIREAT", "r", String(expiresAt), "NX"],
    ]);
  });

  it.each<[string, Response | Error]>([
    ["an HTTP error", Response.json({ error: "WRONGPASS" }, { status: 401 })],
    ["a command error", Response.json({ error: "ERR max requests limit exceeded" })],
    ["a network error", new TypeError("fetch failed")],
    ["a body that is not JSON", new Response("oops")],
    ["a value that is not a count", Response.json({ result: "abc" })],
  ])("raises QuotaStoreError on %s without leaking the URL or token", async (_label, reply) => {
    const { store } = upstash(reply);
    const error = await store.read("k").then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(QuotaStoreError);
    expect(String((error as Error).message)).not.toMatch(/example-db|upstash-test-token/);
  });

  it("rejects a pipeline answer with the wrong shape", async () => {
    const { store } = upstash(Response.json({ result: 1 }));
    await expect(store.increment("k", 1)).rejects.toBeInstanceOf(QuotaStoreError);
  });
});
