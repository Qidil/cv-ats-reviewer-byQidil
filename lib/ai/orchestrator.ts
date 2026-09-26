import { ApiError } from "@/lib/api/errors";
import type { ApiErrorCode } from "@/types/api";
import type { ChatMessage } from "./prompts";

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Values the old engine used: a low temperature for stable scores and room for Mode B's longer JSON. */
const REQUEST_SETTINGS = { temperature: 0.2, max_tokens: 8192, reasoning: { enabled: false } } as const;
/** rules.md §4.2.2: one stalled model may use half of the default budget, so the next model still gets a turn. */
const MAX_CALL_MS = 60_000;

export interface ModelChainOptions<T> {
  apiKey: string;
  /** A rejected server key is the owner's problem, a rejected personal key is the user's. */
  keyOwner: "user" | "server";
  models: readonly string[];
  budgetMs: number;
  /** Receives the last cut-off output, or null for a normal request. */
  buildMessages: (partialOutput: string | null) => ChatMessage[];
  /** Throws when the content is not a usable report. */
  parse: (content: string) => T;
  fetch?: typeof fetch;
  now?: () => number;
}

export interface ModelChainResult<T> {
  result: T;
  modelUsed: string;
  failoverOccurred: boolean;
}

type Outcome =
  | { kind: "content"; content: string }
  | { kind: "rate-limited" }
  | { kind: "rejected" }
  | { kind: "unavailable" }
  | { kind: "truncated"; partial: string }
  | { kind: "stop"; code: ApiErrorCode };

interface OpenRouterBody {
  error?: { code?: unknown };
  choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown }; error?: { code?: unknown } }>;
}

/** rules.md §4.2.4: another model with the same key would fail the same way. */
function stopCode(status: number, keyOwner: "user" | "server"): ApiErrorCode | null {
  switch (status) {
    case 401:
      return keyOwner === "user" ? "AUTH_INVALID_KEY" : "SERVICE_NOT_CONFIGURED";
    case 402:
      return "CREDITS_EXHAUSTED";
    case 403:
      return "CONTENT_BLOCKED";
    default:
      return null;
  }
}

/** OpenRouter answers 200 once a provider accepts the request, so failures can also arrive in the body. */
async function readOutcome(response: Response, keyOwner: "user" | "server"): Promise<Outcome> {
  if (response.status === 429) {
    return { kind: "rate-limited" };
  }
  // A 400 can be specific to one model (context size, unsupported parameter, unknown custom model ID).
  if (response.status === 400) {
    return { kind: "rejected" };
  }
  const stop = stopCode(response.status, keyOwner);
  if (stop !== null) {
    return { kind: "stop", code: stop };
  }
  if (!response.ok) {
    return { kind: "unavailable" };
  }
  let body: OpenRouterBody;
  try {
    body = (await response.json()) as OpenRouterBody;
  } catch {
    return { kind: "unavailable" };
  }
  const choice = body.choices?.[0];
  const errorCode = body.error?.code ?? choice?.error?.code;
  if (errorCode !== undefined) {
    return Number(errorCode) === 429 ? { kind: "rate-limited" } : { kind: "unavailable" };
  }
  const content = typeof choice?.message?.content === "string" ? choice.message.content : "";
  if (choice?.finish_reason === "length") {
    return { kind: "truncated", partial: content };
  }
  if (choice?.finish_reason === "error" || choice?.finish_reason === "content_filter" || content.trim() === "") {
    return { kind: "unavailable" };
  }
  return { kind: "content", content };
}

/**
 * Tries each model in order inside one time budget, each call capped at 60 s (rules.md §4.2). A
 * cut-off answer is passed to the next model as reference; the error after the last model follows §4.2.6.
 */
export async function runModelChain<T>(options: ModelChainOptions<T>): Promise<ModelChainResult<T>> {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const deadline = now() + options.budgetMs;
  let partialOutput: string | null = null;
  let lastFailure: "MODEL_UNAVAILABLE" | "JSON_PARSE_FAILED" | "TOKEN_LENGTH_EXCEEDED" | null = null;
  let onlyRateLimited = true;
  let rejectedCount = 0;

  for (const [index, model] of options.models.entries()) {
    const remaining = deadline - now();
    if (remaining <= 0) {
      throw new ApiError("NETWORK_TIMEOUT");
    }
    const callMs = Math.min(remaining, MAX_CALL_MS);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), callMs);
    let outcome: Outcome;
    try {
      const response = await fetchImpl(OPENROUTER_CHAT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: options.buildMessages(partialOutput), ...REQUEST_SETTINGS }),
        signal: controller.signal,
      });
      outcome = await readOutcome(response, options.keyOwner);
    } catch {
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
        throw new ApiError(outcome.code);
      case "rejected":
        rejectedCount += 1;
        continue;
      case "rate-limited":
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
          return { result: options.parse(outcome.content), modelUsed: model, failoverOccurred: index > 0 };
        } catch {
          lastFailure = "JSON_PARSE_FAILED";
        }
    }
  }

  if (options.models.length > 0 && rejectedCount === options.models.length) {
    throw new ApiError("INVALID_INPUT");
  }
  if (options.models.length > 0 && onlyRateLimited) {
    throw new ApiError("RATE_LIMITED_429");
  }
  throw new ApiError(lastFailure ?? "MODEL_UNAVAILABLE");
}
