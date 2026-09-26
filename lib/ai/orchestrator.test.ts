import { describe, expect, it, vi } from "vitest";
import type { ApiError } from "@/lib/api/errors";
import { OPENROUTER_CHAT_URL, runModelChain, type ModelChainOptions } from "./orchestrator";
import type { ChatMessage } from "./prompts";

const MODELS = ["openrouter/free", "model-2", "model-3", "model-4", "model-5"];
type Reply = Response | Error | ((init: RequestInit) => Promise<Response>);

function completion(content: string | null, finishReason: string | null = "stop"): Response {
  return Response.json({ choices: [{ finish_reason: finishReason, message: { content } }] });
}

function httpError(status: number): Response {
  return Response.json({ error: { code: status, message: "upstream" } }, { status });
}

/** A call that only ends when its signal aborts. */
function hanging(init: RequestInit): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });
}

interface Call {
  url: string;
  model: string;
  messages: ChatMessage[];
  body: Record<string, unknown>;
  authorization: string;
}

function chain(replies: Reply[], overrides: Partial<ModelChainOptions<{ ok: true }>> = {}) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const headers = init?.headers as Record<string, string>;
    calls.push({
      url: String(url),
      model: String(body.model),
      messages: body.messages as ChatMessage[],
      body,
      authorization: headers.Authorization,
    });
    const reply = replies.shift() ?? httpError(503);
    if (reply instanceof Error) throw reply;
    return typeof reply === "function" ? reply(init ?? {}) : reply;
  });
  const promise = runModelChain<{ ok: true }>({
    apiKey: "server-key",
    keyOwner: "server",
    models: MODELS,
    budgetMs: 120_000,
    buildMessages: (partial) => [
      { role: "system", content: "rubrik" },
      { role: "user", content: partial === null ? "cv" : `lanjutkan:${partial}` },
    ],
    parse: (content) => {
      const parsed = JSON.parse(content) as { ok?: unknown };
      if (parsed.ok !== true) throw new Error("not a report");
      return { ok: true };
    },
    fetch: fetchMock as unknown as typeof fetch,
    ...overrides,
  });
  return { calls, promise };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => "resolved",
    (error: ApiError) => error.code,
  );
}

const VALID = '{"ok": true}';

describe("runModelChain success paths", () => {
  it("starts with openrouter/free and returns the first valid answer (AC-04.3)", async () => {
    const { calls, promise } = chain([completion(VALID)]);

    await expect(promise).resolves.toEqual({ result: { ok: true }, modelUsed: "openrouter/free", failoverOccurred: false });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: OPENROUTER_CHAT_URL, model: "openrouter/free", authorization: "Bearer server-key" });
    expect(calls[0].body).toMatchObject({ temperature: 0.2, max_tokens: 8192, reasoning: { enabled: false } });
    expect(calls[0].body).not.toHaveProperty("response_format");
  });

  it("moves to the next model after a 429 (AC-04.1)", async () => {
    const { calls, promise } = chain([httpError(429), completion(VALID)]);

    await expect(promise).resolves.toMatchObject({ modelUsed: "model-2", failoverOccurred: true });
    expect(calls.map((call) => call.model)).toEqual(["openrouter/free", "model-2"]);
  });

  it.each<[string, Reply]>([
    ["a 503", httpError(503)],
    ["a 404 for a removed model", httpError(404)],
    ["a 400 that only this model gives (rules.md §4.2.4)", httpError(400)],
    ["a network error", new TypeError("fetch failed")],
    ["an error inside a 200", Response.json({ error: { code: 502, message: "provider down" } })],
    ["finish_reason error", completion("{", "error")],
    ["finish_reason content_filter", completion("", "content_filter")],
    ["empty content", completion(null)],
    ["invalid JSON", completion("Maaf, tidak bisa.")],
    ["a body that is not JSON", new Response("<html>502</html>", { status: 200 })],
  ])("moves to the next model after %s", async (_label, reply) => {
    const { promise } = chain([reply, completion(VALID)]);
    await expect(promise).resolves.toMatchObject({ modelUsed: "model-2" });
  });

  it("gives the next model the cut-off answer as reference (AC-04.2)", async () => {
    const partial = '{"ok": tr';
    const { calls, promise } = chain([completion(partial, "length"), completion(VALID)]);

    await expect(promise).resolves.toMatchObject({ modelUsed: "model-2" });
    expect(calls[0].messages[1].content).toBe("cv");
    expect(calls[1].messages[1].content).toBe(`lanjutkan:${partial}`);
  });

  it("keeps the cut-off answer across a rate-limited model", async () => {
    const { calls, promise } = chain([completion("{", "length"), httpError(429), completion(VALID)]);

    await expect(promise).resolves.toMatchObject({ modelUsed: "model-3" });
    expect(calls[2].messages[1].content).toBe("lanjutkan:{");
  });

  it("does not continue from an empty cut-off answer", async () => {
    const { calls, promise } = chain([completion("", "length"), completion(VALID)]);

    await promise;
    expect(calls[1].messages[1].content).toBe("cv");
  });
});

describe("runModelChain stops and final errors", () => {
  it.each([
    [401, "server", "SERVICE_NOT_CONFIGURED"],
    [401, "user", "AUTH_INVALID_KEY"],
    [402, "server", "CREDITS_EXHAUSTED"],
    [403, "user", "CONTENT_BLOCKED"],
  ] as const)("stops the chain on %i with a %s key as %s", async (status, keyOwner, code) => {
    const { calls, promise } = chain([httpError(status), completion(VALID)], { keyOwner });

    expect(await codeOf(promise)).toBe(code);
    expect(calls).toHaveLength(1);
  });

  it.each<[string, Reply[], string]>([
    ["every model answered 429", MODELS.map(() => httpError(429)), "RATE_LIMITED_429"],
    ["every model answered 400", MODELS.map(() => httpError(400)), "INVALID_INPUT"],
    ["one model answered 400 and the rest 429", [httpError(400), ...MODELS.slice(1).map(() => httpError(429))], "RATE_LIMITED_429"],
    ["every model was down", MODELS.map(() => httpError(503)), "MODEL_UNAVAILABLE"],
    ["one model was down and the rest answered 429", [httpError(429), httpError(503), httpError(429), httpError(429), httpError(429)], "MODEL_UNAVAILABLE"],
    ["the last real failure was invalid JSON", [httpError(503), ...MODELS.slice(1).map(() => completion("bukan json"))], "JSON_PARSE_FAILED"],
    ["the last model was still cut off", MODELS.map(() => completion("{", "length")), "TOKEN_LENGTH_EXCEEDED"],
  ])("ends with the right code when %s (rules.md §4.2.6)", async (_label, replies, code) => {
    const { calls, promise } = chain(replies);

    expect(await codeOf(promise)).toBe(code);
    expect(calls).toHaveLength(MODELS.length);
  });

  it("stops with NETWORK_TIMEOUT once the shared budget is used up, before calling the next model", async () => {
    let clock = 0;
    const { calls, promise } = chain(
      [
        async () => {
          clock += 120_001;
          return httpError(503);
        },
      ],
      { now: () => clock },
    );

    expect(await codeOf(promise)).toBe("NETWORK_TIMEOUT");
    expect(calls).toHaveLength(1);
  });

  it("aborts a call that is still running when the budget ends", async () => {
    const { promise } = chain([hanging], { budgetMs: 30 });

    expect(await codeOf(promise)).toBe("NETWORK_TIMEOUT");
  });
});

describe("runModelChain per-call cap (rules.md §4.2.2)", () => {
  it("gives one call at most 60 s by default, then tries the next model", async () => {
    vi.useFakeTimers();
    try {
      const { calls, promise } = chain([hanging, completion(VALID)]);

      await vi.advanceTimersByTimeAsync(59_999);
      expect(calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(promise).resolves.toMatchObject({ modelUsed: "model-2", failoverOccurred: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it("still ends with NETWORK_TIMEOUT when the budget runs out on a later call", async () => {
    vi.useFakeTimers();
    try {
      const { calls, promise } = chain([hanging, hanging, completion(VALID)], { budgetMs: 100_000 });
      const code = codeOf(promise);

      await vi.advanceTimersByTimeAsync(100_000);
      expect(await code).toBe("NETWORK_TIMEOUT");
      expect(calls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
