export const DEFAULT_PRIMARY_MODEL = "openrouter/free";
/** rules.md §4.2, tried in order after the primary model. */
export const DEFAULT_FREE_MODELS: readonly string[] = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "google/gemma-4-31b-it:free",
];
const DEFAULT_BUDGET_MS = 120_000;
const DEFAULT_DAILY_LIMIT = 10;
const DEFAULT_HOURLY_REQUEST_LIMIT = 20;

export interface AnalyzeConfig {
  serverApiKey: string | null;
  primaryModel: string;
  fallbackModels: string[];
  budgetMs: number;
  dailyLimit: number;
  /** Requests per network per clock hour, with any key (rules.md §4.3.6). */
  hourlyRequestLimit: number;
  quotaSecret: string | null;
  upstash: { url: string; token: string } | null;
  production: boolean;
}

type Env = Readonly<Record<string, string | undefined>>;

function text(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Server environment, read per request. The Vercel Marketplace names are accepted for Upstash. */
export function readConfig(env: Env = process.env): AnalyzeConfig {
  const url = text(env, "UPSTASH_REDIS_REST_URL") ?? text(env, "KV_REST_API_URL");
  const token = text(env, "UPSTASH_REDIS_REST_TOKEN") ?? text(env, "KV_REST_API_TOKEN");
  const fallbackModels = (text(env, "OPENROUTER_FREE_MODELS") ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return {
    serverApiKey: text(env, "OPENROUTER_API_KEY"),
    primaryModel: text(env, "OPENROUTER_MODEL") ?? DEFAULT_PRIMARY_MODEL,
    fallbackModels: fallbackModels.length > 0 ? fallbackModels : [...DEFAULT_FREE_MODELS],
    budgetMs: positiveInteger(env.OPENROUTER_TIMEOUT_MS, DEFAULT_BUDGET_MS),
    dailyLimit: positiveInteger(env.DAILY_ANALYSIS_LIMIT, DEFAULT_DAILY_LIMIT),
    hourlyRequestLimit: positiveInteger(env.HOURLY_REQUEST_LIMIT, DEFAULT_HOURLY_REQUEST_LIMIT),
    quotaSecret: text(env, "QUOTA_HASH_SECRET"),
    upstash: url && token ? { url: url.replace(/\/+$/, ""), token } : null,
    production: env.NODE_ENV === "production",
  };
}
