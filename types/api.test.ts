import { describe, expect, it } from "vitest";
import { detectKeyProvider } from "./api";

describe("detectKeyProvider (ADR-009, api.md § Personal-Key Providers)", () => {
  it.each([
    ["sk-or-v1-abc", "", "openrouter"],
    ["sk-ant-api03-abc", "claude-sonnet-4-6", "anthropic"],
    ["sk-proj-abc", "", "openai"],
    ["sk-svcacct-abc", "", "openai"],
    ["AIzaSyAbc", "gemini-2.5-flash", "google"],
    ["gsk_abc", "", "groq"],
    ["xai-abc", "", "xai"],
    ["pplx-abc", "", "perplexity"],
    ["fw_abc", "", "fireworks"],
    ["csk-abc", "", "cerebras"],
    ["hf_abc", "", "huggingface"],
    ["nvapi-abc", "", "nvidia"],
  ] as const)("reads %s as %s's key by its prefix", (key, model, provider) => {
    expect(detectKeyProvider(key, model)).toBe(provider);
  });

  it("tells OpenAI and DeepSeek apart by the model, since both issue plain sk- keys", () => {
    expect(detectKeyProvider("sk-abc", "gpt-4.1-mini")).toBe("openai");
    expect(detectKeyProvider("sk-abc", "o4-mini")).toBe("openai");
    expect(detectKeyProvider("sk-abc", "deepseek-chat")).toBe("deepseek");
    expect(detectKeyProvider(" sk-abc ", " DeepSeek-Reasoner ")).toBe("deepseek");
  });

  it("reads a key without a prefix as Mistral's only with a Mistral model", () => {
    expect(detectKeyProvider("AbCdEf0123456789", "mistral-small-latest")).toBe("mistral");
    expect(detectKeyProvider("AbCdEf0123456789", "codestral-latest")).toBe("mistral");
    expect(detectKeyProvider("AbCdEf0123456789", "open-mixtral-8x22b")).toBe("mistral");
  });

  it("answers null instead of guessing", () => {
    expect(detectKeyProvider("sk-abc", "")).toBeNull();
    expect(detectKeyProvider("sk-abc", "kimi-k2")).toBeNull();
    expect(detectKeyProvider("mystery-key", "llama3")).toBeNull();
    expect(detectKeyProvider("", "")).toBeNull();
  });

  it("never places a key by an aggregator's org/model ID, which says nothing about the key (G-04)", () => {
    expect(detectKeyProvider("sk-siliconflow-key", "deepseek-ai/DeepSeek-V3")).toBeNull();
    expect(detectKeyProvider("sk-abc", "openai/gpt-4o")).toBeNull();
    expect(detectKeyProvider("0123456789abcdef0123456789abcdef", "mistralai/Mixtral-8x7B-Instruct-v0.1")).toBeNull();
    // A prefix still decides on its own.
    expect(detectKeyProvider("sk-or-v1-abc", "deepseek/deepseek-chat")).toBe("openrouter");
  });
});
