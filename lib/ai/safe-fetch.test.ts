import { EventEmitter } from "node:events";
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type request as httpRequest } from "node:http";
import type { RequestOptions, request as httpsRequest } from "node:https";
import type { LookupAddress } from "node:dns";
import type { AddressInfo } from "node:net";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { MAX_BASE_URL_CHARS, MAX_RESPONSE_BYTES, classifyAddress, parseCustomBaseUrl, safeFetch } from "./safe-fetch";

const PUBLIC: LookupAddress = { address: "93.184.216.34", family: 4 };
const PUBLIC_V6: LookupAddress = { address: "2606:4700:4700::1111", family: 6 };
const LOOPBACK: LookupAddress = { address: "127.0.0.1", family: 4 };

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

async function shutDown(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function fakeRequest(reply: { status: number; body?: string | Buffer; headers?: IncomingHttpHeaders }) {
  const captured: { options: RequestOptions | null; written: string[] } = { options: null, written: [] };
  const request = vi.fn((options: RequestOptions, callback: (incoming: IncomingMessage) => void) => {
    captured.options = options;
    return Object.assign(new EventEmitter(), {
      write: (chunk: string) => captured.written.push(chunk),
      destroy: () => undefined,
      end: () => {
        const incoming = Object.assign(new PassThrough(), {
          statusCode: reply.status,
          headers: reply.headers ?? { "content-type": "application/json" },
        });
        callback(incoming as unknown as IncomingMessage);
        incoming.end(reply.body ?? "");
      },
    });
  });
  return { calls: request, captured, https: request as unknown as typeof httpsRequest, http: request as unknown as typeof httpRequest };
}

const resolveTo = (...addresses: LookupAddress[]) => async () => addresses;

describe("parseCustomBaseUrl (rules.md §5.4)", () => {
  it.each(["https://api.example.com/v1", "https://api.example.com:8443/v1", "http://localhost:11434/v1", "http://192.168.1.20:8000/v1"])(
    "accepts the format of %s",
    (value) => {
      expect(parseCustomBaseUrl(value)).not.toBeNull();
    },
  );

  it.each([
    "https://user:secret@api.example.com/v1",
    "https://api.example.com/v1?key=1",
    "https://api.example.com/v1?",
    "https://api.example.com/v1#models",
    "ftp://api.example.com",
    "not an address",
    "",
    `https://${"a".repeat(MAX_BASE_URL_CHARS)}.example.com`,
  ])("refuses %s", (value) => {
    expect(parseCustomBaseUrl(value)).toBeNull();
  });
});

describe("classifyAddress", () => {
  it.each(["93.184.216.34", "8.8.8.8", "172.15.255.255", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8", "64:ff9b::808:808"])(
    "treats %s as public",
    (address) => {
      expect(classifyAddress(address)).toBe("public");
    },
  );

  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.5",
    "100.64.0.1",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "64:ff9b::a00:1",
    "100.100.100.201",
    "fd00:ec2::253",
  ])("treats %s as a private network", (address) => {
    expect(classifyAddress(address)).toBe("private");
  });

  it.each([
    "169.254.169.254",
    "::ffff:a9fe:a9fe",
    "100.100.100.200",
    "::ffff:100.100.100.200",
    "64:ff9b::6464:64c8",
    "fd00:ec2::254",
    "fd20:ce::254",
    "0.0.0.0",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "fe80::1",
    "ff02::1",
    "2001::1",
    "2001:db8::1",
    "2002:c000:201::1",
    "localhost",
    "not-an-ip",
  ])("blocks %s", (address) => {
    expect(classifyAddress(address)).toBe("blocked");
  });
});

describe("safeFetch (T21, T27)", () => {
  it("refuses a host with any non-public address before connecting", async () => {
    const fake = fakeRequest({ status: 200 });
    const promise = safeFetch("https://api.example.com/v1/chat/completions", {}, {
      resolve: resolveTo(PUBLIC, { address: "10.0.0.5", family: 4 }),
      request: fake.https,
    });
    await expect(promise).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fake.calls).not.toHaveBeenCalled();
  });

  it("refuses plain HTTP unless private endpoints are allowed", async () => {
    const fake = fakeRequest({ status: 200 });
    await expect(
      safeFetch("http://api.example.com/v1/models", {}, { resolve: resolveTo(PUBLIC), httpRequest: fake.http }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fake.calls).not.toHaveBeenCalled();
  });

  it("reaches a local server over HTTP on its own port when private endpoints are allowed", async () => {
    const fake = fakeRequest({ status: 200, body: '{"ok":true}' });
    const response = await safeFetch(
      "http://localhost:11434/v1/chat/completions",
      { method: "POST", body: "{}" },
      { allowPrivate: true, resolve: resolveTo(LOOPBACK), httpRequest: fake.http },
    );
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(fake.captured.options).toMatchObject({ hostname: "localhost", port: 11434, path: "/v1/chat/completions" });
    expect(fake.captured.options?.servername).toBeUndefined();
  });

  it("keeps link-local addresses (cloud metadata) out even when private endpoints are allowed", async () => {
    const fake = fakeRequest({ status: 200 });
    await expect(
      safeFetch("http://metadata.example/latest", {}, {
        allowPrivate: true,
        resolve: resolveTo({ address: "169.254.169.254", family: 4 }),
        httpRequest: fake.http,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fake.calls).not.toHaveBeenCalled();
  });

  it.each([
    { address: "100.100.100.200", family: 4 },
    { address: "fd00:ec2::254", family: 6 },
    { address: "fd20:ce::254", family: 6 },
  ])("keeps the metadata service at $address out even when private endpoints are allowed (G-22)", async (entry) => {
    const fake = fakeRequest({ status: 200 });
    await expect(
      safeFetch("http://metadata.example/latest", {}, { allowPrivate: true, resolve: resolveTo(entry), httpRequest: fake.http }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fake.calls).not.toHaveBeenCalled();
  });

  it("refuses a host that does not exist, and an address with a login", async () => {
    const missing = Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
    await expect(
      safeFetch("https://missing.example.com/v1", {}, { resolve: async () => Promise.reject(missing) }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(safeFetch("https://user:secret@api.example.com/v1")).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("connects only to the checked address, however Node asks for it", async () => {
    const fake = fakeRequest({ status: 200, body: '{"ok":true}' });
    await safeFetch(
      "https://api.example.com:8443/v1/chat/completions",
      { method: "POST", headers: { Authorization: "Bearer test-key" }, body: '{"model":"m"}' },
      { resolve: resolveTo(PUBLIC), request: fake.https },
    );
    const options = fake.captured.options;
    expect(options).toMatchObject({ hostname: "api.example.com", port: 8443, path: "/v1/chat/completions", method: "POST" });
    expect(options?.servername).toBe("api.example.com");
    expect(options?.headers).toMatchObject({ authorization: "Bearer test-key", "content-length": "13" });
    expect(fake.captured.written).toEqual(['{"model":"m"}']);

    const single = vi.fn();
    const all = vi.fn();
    options?.lookup?.("rebound.example.com", {}, single);
    options?.lookup?.("rebound.example.com", { all: true }, all);
    expect(single).toHaveBeenCalledWith(null, PUBLIC.address, PUBLIC.family);
    expect(all).toHaveBeenCalledWith(null, [PUBLIC]);
  });

  it("offers every checked address when Node asks for all of them", async () => {
    const fake = fakeRequest({ status: 200, body: "{}" });
    await safeFetch("https://api.example.com/v1/models", {}, { resolve: resolveTo(PUBLIC, PUBLIC_V6), request: fake.https });
    const all = vi.fn();
    fake.captured.options?.lookup?.("api.example.com", { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [PUBLIC, PUBLIC_V6]);
  });

  it("rejects at once when the call was already aborted, before any lookup", async () => {
    const controller = new AbortController();
    controller.abort();
    const resolve = vi.fn(resolveTo(PUBLIC));
    await expect(safeFetch("https://api.example.com/v1", { signal: controller.signal }, { resolve })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("stops waiting for a host lookup that never answers once the call is aborted", async () => {
    const controller = new AbortController();
    const fake = fakeRequest({ status: 200 });
    const promise = safeFetch(
      "https://api.example.com/v1",
      { signal: controller.signal },
      { resolve: () => new Promise<LookupAddress[]>(() => undefined), request: fake.https },
    );
    controller.abort();
    // An abort is an unavailable model to the orchestrator, never the guard's INVALID_INPUT.
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    await expect(promise).rejects.not.toHaveProperty("code", "INVALID_INPUT");
    expect(fake.calls).not.toHaveBeenCalled();
  });

  it("reads a normal answer from a real local server", async () => {
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end('{"ok":true}');
    });
    const port = await listen(server);
    try {
      const response = await safeFetch(`http://127.0.0.1:${port}/v1/models`, {}, { allowPrivate: true });
      await expect(response.json()).resolves.toEqual({ ok: true });
    } finally {
      await shutDown(server);
    }
  });

  it("gives up when the endpoint closes the connection without an answer, as after a 101 reply", { timeout: 5000 }, async () => {
    const server = createServer((request) => {
      request.socket.write("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n");
    });
    const port = await listen(server);
    try {
      await expect(
        safeFetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: "POST", body: "{}" }, { allowPrivate: true }),
      ).rejects.toThrow("closed the connection");
    } finally {
      await shutDown(server);
    }
  });

  it("returns a redirect as it is instead of following it", async () => {
    const fake = fakeRequest({ status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
    const response = await safeFetch("https://api.example.com/v1/models", {}, { resolve: resolveTo(PUBLIC), request: fake.https });
    expect(response.status).toBe(302);
    expect(fake.calls).toHaveBeenCalledTimes(1);
  });

  it("stops reading a body past the response limit", async () => {
    const fake = fakeRequest({ status: 200, body: Buffer.alloc(MAX_RESPONSE_BYTES + 1) });
    await expect(
      safeFetch("https://api.example.com/v1/chat/completions", {}, { resolve: resolveTo(PUBLIC), request: fake.https }),
    ).rejects.toThrow("response limit");
  });
});
