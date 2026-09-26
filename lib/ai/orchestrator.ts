import { ApiError } from "@/lib/api/errors";
import type { ChatMessage } from "./prompts";
import { PROVIDERS, type CallOutcome, type ProviderAdapter } from "./providers";

export { OPENROUTER_CHAT_URL } from "./providers";

/** rules.md §4.2.2: one stalled model may use half of the default budget, so the next model still gets a turn. */
const MAX_CALL_MS = 60_000;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ModelChainOptions<T> {
  apiKey: string;
  /** A rejected server key is the owner's problem, a rejected personal key is the user's. */
  keyOwner: "user" | "server";
  /** Defaults to OpenRouter, the only provider with the app's free-model chain (ADR-009). */
  provider?: ProviderAdapter;
  /** The checked base URL of a custom endpoint. */
  baseUrl?: string | null;
  models: readonly string[];
  /** rules.md §4.2.1: one model called twice would answer a 400 or a 429 the same way, so either ends the run. */
  stopOnModelError?: boolean;
  budgetMs: number;
  /** Receives the last cut-off output, or null for a normal request. */
  buildMessages: (partialOutput: string | null) => ChatMessage[];
  /** Throws when the content is not a usable report. */
  parse: (content: string) => T;
  fetch?: FetchLike;
  now?: () => number;
}

export interface ModelChainResult<T> {
  result: T;
  modelUsed: string;
  /** DELTA-51: a model other than the first wrote the result; a second call to the same model is not a switch. */
  failoverOccurred: boolean;
  /** DELTA-51: the result continued a cut-off answer. */
  continuationOccurred: boolean;
}

/**
 * Tries each model in order inside one time budget, each call capped at 60 s (rules.md §4.2). A
 * cut-off answer is passed to the next model as reference; the error after the last model follows §4.2.6.
 */
export async function runModelChain<T>(options: ModelChainOptions<T>): Promise<ModelChainResult<T>> {
  const fetchImpl: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const provider = options.provider ?? PROVIDERS.openrouter;
  const now = options.now ?? Date.now;
  const deadline = now() + options.budgetMs;
  let partialOutput: string | null = null;
  let lastFailure: "MODEL_UNAVAILABLE" | "JSON_PARSE_FAILED" | "TOKEN_LENGTH_EXCEEDED" | null = null;
  let onlyRateLimited = true;
  let rejectedCount = 0;

  for (const model of options.models) {
    const remaining = deadline - now();
    if (remaining <= 0) {
      throw new ApiError("NETWORK_TIMEOUT");
    }
    const callMs = Math.min(remaining, MAX_CALL_MS);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), callMs);
    let outcome: CallOutcome;
    try {
      const call = provider.buildCall({
        apiKey: options.apiKey,
        model,
        messages: options.buildMessages(partialOutput),
        baseUrl: options.baseUrl ?? null,
      });
      const response = await fetchImpl(call.url, {
        method: "POST",
        headers: call.headers,
        body: call.body,
        signal: controller.signal,
        // A followed redirect would carry the key header to another host (rules.md §4.2.7); the 3xx is read as a failed call.
        redirect: "manual",
      });
      outcome = await provider.readOutcome(response, options.keyOwner);
    } catch (error) {
      // The custom endpoint guard refuses an address with the catalog error itself.
      if (error instanceof ApiError) {
        throw error;
      }
      outcome = { kind: "unavailable" };
    } finally {
      clearTimeout(timer);
    }
    // An abort shows up as a failed fetch or an unreadable body. Only the end of the whole budget
    // stops the chain; a model that used up its own 60 s makes way for the next one.
    if (outcome.kind === "unavailable" && controller.signal.aborted && callMs === remaining) {
      throw new ApiError("NETWORK_TIMEOUT");
    }

    switch (outcome.kind) {
      case "stop":
        throw new ApiError(outcome.code, { keyOwner: options.keyOwner });
      case "rejected":
        if (options.stopOnModelError) {
          throw new ApiError("INVALID_INPUT", { keyOwner: options.keyOwner });
        }
        rejectedCount += 1;
        continue;
      case "rate-limited":
        if (options.stopOnModelError) {
          throw new ApiError("RATE_LIMITED_429", { keyOwner: options.keyOwner });
        }
        continue;
      case "unavailable":
        onlyRateLimited = false;
        lastFailure = "MODEL_UNAVAILABLE";
        continue;
      case "truncated":
        onlyRateLimited = false;
        lastFailure = "TOKEN_LENGTH_EXCEEDED";
        if (outcome.partial.trim() !== "") partialOutput = outcome.partial;
        continue;
      case "content":
        onlyRateLimited = false;
        try {
          return {
            result: options.parse(outcome.content),
            modelUsed: model,
            failoverOccurred: model !== options.models[0],
            continuationOccurred: partialOutput !== null,
          };
        } catch {
          lastFailure = "JSON_PARSE_FAILED";
        }
    }
  }

  if (options.models.length > 0 && rejectedCount === options.models.length) {
    throw new ApiError("INVALID_INPUT", { keyOwner: options.keyOwner });
  }
  if (options.models.length > 0 && onlyRateLimited) {
    throw new ApiError("RATE_LIMITED_429", { keyOwner: options.keyOwner });
  }
  throw new ApiError(lastFailure ?? "MODEL_UNAVAILABLE");
}
