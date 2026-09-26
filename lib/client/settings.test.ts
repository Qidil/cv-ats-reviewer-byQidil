import { describe, expect, it, vi } from "vitest";
import { LOCAL_STORAGE_KEYS } from "@/types/db";
import {
  clearPersonalKey,
  isSendableKey,
  keyTestRequest,
  personalKeyProvider,
  readPersonalKey,
  savePersonalKey,
  testPersonalKey,
  type PersonalKeySettings,
} from "./settings";

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

const EMPTY: PersonalKeySettings = { apiKey: "", model: "", baseUrl: "" };
const key = (apiKey: string, model = "", baseUrl = ""): PersonalKeySettings => ({ apiKey, model, baseUrl });

describe("personal key storage (BR-10, schema.md §5)", () => {
  it("saves, reads, and clears the key, model, and address", () => {
    const storage = memoryStorage();

    expect(readPersonalKey(storage)).toEqual(EMPTY);
    expect(savePersonalKey(key(" test-key ", " vendor/model ", " http://localhost:11434/v1 "), storage)).toBe(true);
    expect(readPersonalKey(storage)).toEqual(key("test-key", "vendor/model", "http://localhost:11434/v1"));

    savePersonalKey(key("sk-or-v1-test"), storage);
    expect(storage.getItem(LOCAL_STORAGE_KEYS.byokModel)).toBeNull();
    expect(storage.getItem(LOCAL_STORAGE_KEYS.byokBaseUrl)).toBeNull();

    clearPersonalKey(storage);
    expect(readPersonalKey(storage)).toEqual(EMPTY);
  });

  it("reports a browser that refuses to store and reads nothing from one that throws", () => {
    const refusing = { ...memoryStorage(), setItem: () => { throw new DOMException("full", "QuotaExceededError"); } };
    const throwing = { ...memoryStorage(), getItem: () => { throw new DOMException("blocked", "SecurityError"); } };

    expect(savePersonalKey(key("sk-or-v1-test"), refusing as Storage)).toBe(false);
    expect(savePersonalKey(key("sk-or-v1-test"), null)).toBe(false);
    expect(readPersonalKey(throwing as Storage)).toEqual(EMPTY);
  });
});

describe("personalKeyProvider", () => {
  it("follows the server's rules, with an entered address first", () => {
    expect(personalKeyProvider(key("sk-ant-test"))).toBe("anthropic");
    expect(personalKeyProvider(key("sk-test", "deepseek-chat"))).toBe("deepseek");
    expect(personalKeyProvider(key("sk-ant-test", "m", "https://api.example.com/v1"))).toBe("custom");
    expect(personalKeyProvider(key("mystery-key", "llama3"))).toBeNull();
    expect(personalKeyProvider(EMPTY)).toBeNull();
  });
});

describe("isSendableKey (G-03)", () => {
  it("accepts visible ASCII only, since the key travels in a request header", () => {
    expect(isSendableKey(" sk-or-v1-abc_DEF.123 ")).toBe(true);
    expect(isSendableKey("sk-or-v1-abc\u200b")).toBe(false);
    expect(isSendableKey("\u201csk-or-v1-abc\u201d")).toBe(false);
    expect(isSendableKey("sk-or v1")).toBe(false);
    expect(isSendableKey("")).toBe(false);
  });
});

describe("keyTestRequest (api.md § Personal-Key Providers)", () => {
  it.each([
    ["sk-or-v1-test", "", "https://openrouter.ai/api/v1/key"],
    ["sk-proj-test", "", "https://api.openai.com/v1/models"],
    ["AIzaTest", "", "https://generativelanguage.googleapis.com/v1beta/openai/models"],
    ["gsk_test", "", "https://api.groq.com/openai/v1/models"],
    ["MistralKey0123", "mistral-small-latest", "https://api.mistral.ai/v1/models"],
    ["sk-test", "deepseek-chat", "https://api.deepseek.com/models"],
    ["xai-test", "", "https://api.x.ai/v1/models"],
    ["fw_test", "", "https://api.fireworks.ai/inference/v1/models"],
    ["csk-test", "", "https://api.cerebras.ai/v1/models"],
    ["hf_test", "", "https://huggingface.co/api/whoami-v2"],
  ])("asks for %s at %s with the bearer key", (apiKey, model, url) => {
    expect(keyTestRequest(key(` ${apiKey} `, model))).toEqual({ url, headers: { Authorization: `Bearer ${apiKey}` } });
  });

  it("asks Anthropic with its own headers, browser access included", () => {
    expect(keyTestRequest(key("sk-ant-test"))).toEqual({
      url: "https://api.anthropic.com/v1/models",
      headers: { "x-api-key": "sk-ant-test", "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    });
  });

  it("asks an entered address at its models path", () => {
    expect(keyTestRequest(key("local-key", "llama3", "http://localhost:11434/v1/"))?.url).toBe("http://localhost:11434/v1/models");
  });

  it("has nothing to ask for Perplexity, NVIDIA, or a key the app does not recognize", () => {
    expect(keyTestRequest(key("pplx-test"))).toBeNull();
    expect(keyTestRequest(key("nvapi-test"))).toBeNull();
    expect(keyTestRequest(key("mystery-key", "llama3"))).toBeNull();
  });
});

describe("testPersonalKey (T6, T22)", () => {
  it("reads OpenRouter's free tier flag", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: { label: "sk-or-v1-abc...xyz", is_free_tier: true } }));
    expect(await testPersonalKey(key(" sk-or-v1-test "), fetchMock as unknown as typeof fetch)).toEqual({
      ok: true,
      freeTier: true,
      models: [],
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-v1-test");
  });

  it("returns the models a key can use, without duplicates or Google's prefix", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ data: [{ id: "models/gemini-test" }, { id: "gemini-test" }, { id: "gemini-other" }, { name: "no id" }] }),
    );
    expect(await testPersonalKey(key("AIzaTest"), fetchMock as unknown as typeof fetch)).toEqual({
      ok: true,
      freeTier: null,
      models: ["gemini-test", "gemini-other"],
    });
  });

  it.each([
    [async () => new Response("", { status: 401 }), { ok: false, reason: "rejected" }],
    [async () => new Response('{"code":"invalid-argument","error":"Incorrect API key provided."}', { status: 400 }), { ok: false, reason: "rejected" }],
    [async () => new Response("", { status: 500 }), { ok: false, reason: "unavailable" }],
    [
      async () => {
        throw new TypeError("Failed to fetch");
      },
      { ok: false, reason: "unavailable" },
    ],
  ])("maps failures (%#)", async (reply, expected) => {
    expect(await testPersonalKey(key("xai-test"), vi.fn(reply) as unknown as typeof fetch)).toEqual(expected);
  });

  it("calls nothing when there is no way to check the key", async () => {
    const fetchMock = vi.fn();
    expect(await testPersonalKey(key("pplx-test"), fetchMock as unknown as typeof fetch)).toEqual({ ok: false, reason: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
