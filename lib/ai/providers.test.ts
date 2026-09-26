import { describe, expect, it } from "vitest";
import { KEY_PROVIDERS, type KeyProvider } from "@/types/api";
import type { ChatMessage } from "./prompts";
import { ANTHROPIC_MESSAGES_URL, ANTHROPIC_VERSION, CHAT_URLS, OPENROUTER_CHAT_URL, PROVIDERS } from "./providers";

const MESSAGES: ChatMessage[] = [
  { role: "system", content: "rubric" },
  { role: "user", content: "cv" },
];

function call(provider: KeyProvider, baseUrl: string | null = null) {
  const built = PROVIDERS[provider].buildCall({ apiKey: "test-key", model: "test-model", messages: MESSAGES, baseUrl });
  return { ...built, body: JSON.parse(built.body) as Record<string, unknown> };
}

function outcome(provider: KeyProvider, response: Response, keyOwner: "user" | "server" = "user") {
  return PROVIDERS[provider].readOutcome(response, keyOwner);
}

const completion = (content: unknown, finishReason = "stop") =>
  Response.json({ choices: [{ finish_reason: finishReason, message: { content } }] });

describe("provider requests (ADR-009)", () => {
  it("has an adapter for every provider a key can come from", () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual([...KEY_PROVIDERS].sort());
  });

  it("keeps the OpenRouter request of Phase 3", () => {
    const { url, headers, body } = call("openrouter");
    expect(url).toBe(OPENROUTER_CHAT_URL);
    expect(headers.Authorization).toBe("Bearer test-key");
    expect(body).toEqual({
      model: "test-model",
      messages: MESSAGES,
      temperature: 0.2,
      max_tokens: 8192,
      reasoning: { enabled: false },
    });
  });

  it.each(["google", "groq", "mistral", "deepseek", "xai", "perplexity", "fireworks", "cerebras", "huggingface", "nvidia"] as const)(
    "sends %s the standard parameters at its fixed URL",
    (provider) => {
      const { url, headers, body } = call(provider);
      expect(url).toBe(CHAT_URLS[provider]);
      expect(headers.Authorization).toBe("Bearer test-key");
      expect(body).toEqual({ model: "test-model", messages: MESSAGES, temperature: 0.2, max_tokens: 8192 });
    },
  );

  it("gives OpenAI the output limit its reasoning models accept, and no temperature", () => {
    const { url, body } = call("openai");
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(body).toEqual({ model: "test-model", messages: MESSAGES, max_completion_tokens: 8192 });
  });

  it("uses Anthropic's Messages API with the system prompt at the top level", () => {
    const { url, headers, body } = call("anthropic");
    expect(url).toBe(ANTHROPIC_MESSAGES_URL);
    expect(headers).toMatchObject({ "x-api-key": "test-key", "anthropic-version": ANTHROPIC_VERSION });
    expect(headers).not.toHaveProperty("Authorization");
    expect(body).toEqual({
      model: "test-model",
      max_tokens: 8192,
      system: "rubric",
      messages: [{ role: "user", content: "cv" }],
    });
  });

  it("appends the chat path to a custom base URL, with or without a trailing slash", () => {
    expect(call("custom", "https://api.example.com/v1").url).toBe("https://api.example.com/v1/chat/completions");
    expect(call("custom", "https://api.example.com/v1/").url).toBe("https://api.example.com/v1/chat/completions");
    expect(() => call("custom")).toThrow();
  });
});

describe("provider answers", () => {
  it("reads content, string or parts, and a cut-off answer", async () => {
    await expect(outcome("openai", completion('{"ok":true}'))).resolves.toEqual({ kind: "content", content: '{"ok":true}' });
    await expect(outcome("mistral", completion([{ type: "text", text: "{" }, { type: "text", text: "}" }]))).resolves.toEqual({
      kind: "content",
      content: "{}",
    });
    await expect(outcome("groq", completion("{", "length"))).resolves.toEqual({ kind: "truncated", partial: "{" });
  });

  it("keeps OpenRouter's Phase 3 mapping, 403 included", async () => {
    await expect(outcome("openrouter", new Response("", { status: 401 }), "server")).resolves.toEqual({
      kind: "stop",
      code: "SERVICE_NOT_CONFIGURED",
    });
    await expect(outcome("openrouter", new Response("", { status: 403 }))).resolves.toEqual({ kind: "stop", code: "CONTENT_BLOCKED" });
    await expect(outcome("openrouter", new Response("", { status: 404 }))).resolves.toEqual({ kind: "unavailable" });
  });

  it.each([
    // Bodies as the providers sent them for a fake key on 2026-09-26.
    ["google", 400, '[{"error":{"code":400,"message":"Please pass a valid API key","status":"INVALID_ARGUMENT"}}]'],
    ["google", 400, '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}'],
    ["xai", 400, '{"code":"invalid-argument","error":"Incorrect API key provided. You can obtain an API key from https://console.x.ai."}'],
    ["openai", 401, '{"error":{"message":"Incorrect API key provided"}}'],
    ["anthropic", 401, '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'],
    ["anthropic", 403, '{"type":"error","error":{"type":"permission_error","message":"not allowed"}}'],
  ] as const)("treats %s %i with a key complaint as a rejected key", async (provider, status, body) => {
    await expect(outcome(provider, new Response(body, { status }))).resolves.toEqual({ kind: "stop", code: "AUTH_INVALID_KEY" });
  });

  it.each([
    ["openai", 429, '{"error":{"message":"You exceeded your current quota","type":"insufficient_quota","code":"insufficient_quota"}}'],
    ["anthropic", 400, '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'],
    ["deepseek", 402, '{"error":{"message":"Insufficient Balance"}}'],
  ] as const)("treats %s %i about credit as used-up credit", async (provider, status, body) => {
    await expect(outcome(provider, new Response(body, { status }))).resolves.toEqual({ kind: "stop", code: "CREDITS_EXHAUSTED" });
  });

  it("tells a rate limit, an unknown model, and a redirect apart outside OpenRouter", async () => {
    await expect(outcome("groq", new Response('{"error":{"message":"Rate limit reached"}}', { status: 429 }))).resolves.toEqual({
      kind: "rate-limited",
    });
    await expect(outcome("openai", new Response('{"error":{"message":"The model does not exist"}}', { status: 404 }))).resolves.toEqual({
      kind: "rejected",
    });
    await expect(outcome("custom", new Response(null, { status: 302 }))).resolves.toEqual({ kind: "rejected" });
    await expect(outcome("google", new Response('{"error":{"message":"Invalid value at contents"}}', { status: 400 }))).resolves.toEqual({
      kind: "rejected",
    });
    await expect(outcome("anthropic", new Response("", { status: 529 }))).resolves.toEqual({ kind: "unavailable" });
  });

  it("reads Anthropic's text blocks and its cut-off answer", async () => {
    const text = (stopReason: string) =>
      Response.json({
        content: [
          { type: "thinking", thinking: "..." },
          { type: "text", text: '{"ok":' },
          { type: "text", text: "true}" },
        ],
        stop_reason: stopReason,
      });
    await expect(outcome("anthropic", text("end_turn"))).resolves.toEqual({ kind: "content", content: '{"ok":true}' });
    await expect(outcome("anthropic", text("max_tokens"))).resolves.toEqual({ kind: "truncated", partial: '{"ok":true}' });
    await expect(outcome("anthropic", Response.json({ content: [], stop_reason: "refusal" }))).resolves.toEqual({ kind: "unavailable" });
  });
});
