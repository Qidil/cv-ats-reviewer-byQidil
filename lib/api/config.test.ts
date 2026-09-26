import { describe, expect, it } from "vitest";
import { DEFAULT_FREE_MODELS, readConfig } from "./config";

describe("readConfig", () => {
  it("falls back to the documented defaults", () => {
    expect(readConfig({})).toEqual({
      serverApiKey: null,
      primaryModel: "openrouter/free",
      fallbackModels: [...DEFAULT_FREE_MODELS],
      budgetMs: 120_000,
      dailyLimit: 10,
      hourlyRequestLimit: 20,
      quotaSecret: null,
      upstash: null,
      allowPrivateEndpoints: false,
      production: false,
    });
  });

  it("reads and trims every value", () => {
    const config = readConfig({
      OPENROUTER_API_KEY: " key ",
      OPENROUTER_MODEL: "google/gemma-4-31b-it:free",
      OPENROUTER_FREE_MODELS: " a:free , ,b:free ",
      OPENROUTER_TIMEOUT_MS: "90000",
      DAILY_ANALYSIS_LIMIT: "5",
      HOURLY_REQUEST_LIMIT: "30",
      QUOTA_HASH_SECRET: "secret",
      UPSTASH_REDIS_REST_URL: "https://db.upstash.io/",
      UPSTASH_REDIS_REST_TOKEN: "token",
      ALLOW_PRIVATE_ENDPOINTS: " TRUE ",
      NODE_ENV: "production",
    });

    expect(config).toEqual({
      serverApiKey: "key",
      primaryModel: "google/gemma-4-31b-it:free",
      fallbackModels: ["a:free", "b:free"],
      budgetMs: 90_000,
      dailyLimit: 5,
      hourlyRequestLimit: 30,
      quotaSecret: "secret",
      upstash: { url: "https://db.upstash.io", token: "token" },
      allowPrivateEndpoints: true,
      production: true,
    });
  });

  it("keeps private endpoints off for anything but an explicit yes", () => {
    for (const value of ["", "false", "0", "yes please"]) {
      expect(readConfig({ ALLOW_PRIVATE_ENDPOINTS: value }).allowPrivateEndpoints).toBe(false);
    }
    expect(readConfig({ ALLOW_PRIVATE_ENDPOINTS: "1" }).allowPrivateEndpoints).toBe(true);
  });

  it("ignores numbers that are not positive integers", () => {
    const config = readConfig({ OPENROUTER_TIMEOUT_MS: "-1", DAILY_ANALYSIS_LIMIT: "sepuluh", HOURLY_REQUEST_LIMIT: "0" });

    expect(config.budgetMs).toBe(120_000);
    expect(config.dailyLimit).toBe(10);
    expect(config.hourlyRequestLimit).toBe(20);
  });

  it("accepts the Vercel Marketplace names for Upstash and needs both values", () => {
    expect(readConfig({ KV_REST_API_URL: "https://kv.upstash.io", KV_REST_API_TOKEN: "kv-token" }).upstash).toEqual({
      url: "https://kv.upstash.io",
      token: "kv-token",
    });
    expect(readConfig({ UPSTASH_REDIS_REST_URL: "https://db.upstash.io" }).upstash).toBeNull();
  });
});
