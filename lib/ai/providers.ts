import type { ApiErrorCode, KeyProvider } from "@/types/api";
import type { ChatMessage } from "./prompts";

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

/** ADR-009: fixed chat endpoints, each checked with a fake key; only `custom` takes an address from the user. */
export const CHAT_URLS: Readonly<Record<Exclude<KeyProvider, "anthropic" | "custom">, string>> = {
  openrouter: OPENROUTER_CHAT_URL,
  openai: "https://api.openai.com/v1/chat/completions",
  google: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  mistral: "https://api.mistral.ai/v1/chat/completions",
  deepseek: "https://api.deepseek.com/chat/completions",
  xai: "https://api.x.ai/v1/chat/completions",
  perplexity: "https://api.perplexity.ai/chat/completions",
  fireworks: "https://api.fireworks.ai/inference/v1/chat/completions",
  cerebras: "https://api.cerebras.ai/v1/chat/completions",
  huggingface: "https://router.huggingface.co/v1/chat/completions",
  nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
};

/** A low temperature keeps scores stable; the token cap leaves room for Mode B's longer JSON. */
const TEMPERATURE = 0.2;
const MAX_OUTPUT_TOKENS = 8192;

/** What one model call ended with; the orchestrator decides what happens next (rules.md §4.2). */
export type CallOutcome =
  | { kind: "content"; content: string }
  | { kind: "rate-limited" }
  | { kind: "rejected" }
  | { kind: "unavailable" }
  | { kind: "truncated"; partial: string }
  | { kind: "stop"; code: ApiErrorCode };

export interface ProviderCall {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface ProviderAdapter {
  id: KeyProvider;
  buildCall(input: { apiKey: string; model: string; messages: ChatMessage[]; baseUrl: string | null }): ProviderCall;
  readOutcome(response: Response, keyOwner: "user" | "server"): Promise<CallOutcome>;
}

/** Google and xAI answer a bad key with 400, so only the body tells it from a bad request. */
const INVALID_KEY_PATTERN =
  /API_KEY_INVALID|(invalid|incorrect|not valid|pass a valid)[^"]{0,40}api[ _-]?key|api[ _-]?key[^"]{0,40}(invalid|incorrect|not valid)/i;
/** OpenAI's 429 `insufficient_quota`, Anthropic's 400 about the credit balance, and the like. */
const NO_CREDIT_PATTERN =
  /insufficient_quota|insufficient balance|credit balance|out of credits|no credits|doesn't have any credits/i;

async function bodyText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

/** Maps a failed status; null for a 2xx answer, whose body the caller reads. */
async function readFailure(
  response: Response,
  provider: KeyProvider,
  keyOwner: "user" | "server",
): Promise<CallOutcome | null> {
  const { status } = response;
  if (status >= 200 && status < 300) {
    return null;
  }
  const rejectedKey: CallOutcome = { kind: "stop", code: keyOwner === "user" ? "AUTH_INVALID_KEY" : "SERVICE_NOT_CONFIGURED" };
  if (provider === "openrouter") {
    // OpenRouter status mapping (rules.md §4.2.3 and §4.2.4).
    if (status === 401) return rejectedKey;
    if (status === 402) return { kind: "stop", code: "CREDITS_EXHAUSTED" };
    if (status === 403) return { kind: "stop", code: "CONTENT_BLOCKED" };
    if (status === 429) return { kind: "rate-limited" };
    if (status === 400) return { kind: "rejected" };
    return { kind: "unavailable" };
  }
  const text = status === 400 || status === 403 || status === 429 ? await bodyText(response) : "";
  if (status === 402 || NO_CREDIT_PATTERN.test(text)) return { kind: "stop", code: "CREDITS_EXHAUSTED" };
  if (status === 401 || status === 403 || (status === 400 && INVALID_KEY_PATTERN.test(text))) return rejectedKey;
  if (status === 429) return { kind: "rate-limited" };
  // With one model, a 404 is usually an unknown model ID and a redirect a wrong custom address:
  // both point the user at Settings (INVALID_INPUT), like a 400.
  if (status === 400 || status === 404 || (status >= 300 && status < 400)) return { kind: "rejected" };
  return { kind: "unavailable" };
}

function textOf(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : ""))
      .join("");
  }
  return "";
}

interface ChatCompletionBody {
  error?: { code?: unknown };
  choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown }; error?: { code?: unknown } }>;
}

async function readChatCompletion(response: Response, provider: KeyProvider, keyOwner: "user" | "server"): Promise<CallOutcome> {
  const failure = await readFailure(response, provider, keyOwner);
  if (failure !== null) {
    return failure;
  }
  let body: ChatCompletionBody;
  try {
    body = (await response.json()) as ChatCompletionBody;
  } catch {
    return { kind: "unavailable" };
  }
  // OpenRouter answers 200 once a provider accepts the request, so failures can also arrive in the body.
  const choice = body.choices?.[0];
  const errorCode = body.error?.code ?? choice?.error?.code;
  if (errorCode !== undefined) {
    return Number(errorCode) === 429 ? { kind: "rate-limited" } : { kind: "unavailable" };
  }
  const content = textOf(choice?.message?.content);
  if (choice?.finish_reason === "length") {
    return { kind: "truncated", partial: content };
  }
  if (choice?.finish_reason === "error" || choice?.finish_reason === "content_filter" || content.trim() === "") {
    return { kind: "unavailable" };
  }
  return { kind: "content", content };
}

function jsonHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

function chatCompletions(id: KeyProvider, url: (baseUrl: string | null) => string, extra: (model: string) => object): ProviderAdapter {
  return {
    id,
    buildCall: ({ apiKey, model, messages, baseUrl }) => ({
      url: url(baseUrl),
      headers: jsonHeaders(apiKey),
      body: JSON.stringify({ model, messages, ...extra(model) }),
    }),
    readOutcome: (response, keyOwner) => readChatCompletion(response, id, keyOwner),
  };
}

const standardParameters = () => ({ temperature: TEMPERATURE, max_tokens: MAX_OUTPUT_TOKENS });

interface AnthropicBody {
  content?: Array<{ type?: unknown; text?: unknown }>;
  stop_reason?: unknown;
}

/** Anthropic calls its OpenAI-compatible layer a testing aid, not for production, so this uses the Messages API. */
const anthropic: ProviderAdapter = {
  id: "anthropic",
  buildCall: ({ apiKey, model, messages }) => ({
    url: ANTHROPIC_MESSAGES_URL,
    headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      // No temperature: extended thinking, on by default for newer Claude models, refuses a custom one.
      max_tokens: MAX_OUTPUT_TOKENS,
      system: messages
        .filter((message) => message.role === "system")
        .map((message) => message.content)
        .join("\n\n"),
      messages: messages
        .filter((message) => message.role !== "system")
        .map((message) => ({ role: message.role, content: message.content })),
    }),
  }),
  readOutcome: async (response, keyOwner) => {
    const failure = await readFailure(response, "anthropic", keyOwner);
    if (failure !== null) {
      return failure;
    }
    let body: AnthropicBody;
    try {
      body = (await response.json()) as AnthropicBody;
    } catch {
      return { kind: "unavailable" };
    }
    const content = (body.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("");
    if (body.stop_reason === "max_tokens") {
      return { kind: "truncated", partial: content };
    }
    if (body.stop_reason === "refusal" || content.trim() === "") {
      return { kind: "unavailable" };
    }
    return { kind: "content", content };
  },
};

export const PROVIDERS: Readonly<Record<KeyProvider, ProviderAdapter>> = {
  openrouter: chatCompletions("openrouter", () => CHAT_URLS.openrouter, () => ({
    ...standardParameters(),
    reasoning: { enabled: false },
  })),
  // tradeoff: no temperature and max_completion_tokens, because OpenAI's reasoning models accept only
  // the default temperature and refuse max_tokens; scores vary a little more between runs.
  openai: chatCompletions("openai", () => CHAT_URLS.openai, () => ({ max_completion_tokens: MAX_OUTPUT_TOKENS })),
  anthropic,
  google: chatCompletions("google", () => CHAT_URLS.google, standardParameters),
  groq: chatCompletions("groq", () => CHAT_URLS.groq, standardParameters),
  mistral: chatCompletions("mistral", () => CHAT_URLS.mistral, standardParameters),
  deepseek: chatCompletions("deepseek", () => CHAT_URLS.deepseek, standardParameters),
  xai: chatCompletions("xai", () => CHAT_URLS.xai, standardParameters),
  perplexity: chatCompletions("perplexity", () => CHAT_URLS.perplexity, standardParameters),
  fireworks: chatCompletions("fireworks", () => CHAT_URLS.fireworks, standardParameters),
  cerebras: chatCompletions("cerebras", () => CHAT_URLS.cerebras, standardParameters),
  huggingface: chatCompletions("huggingface", () => CHAT_URLS.huggingface, standardParameters),
  nvidia: chatCompletions("nvidia", () => CHAT_URLS.nvidia, standardParameters),
  custom: chatCompletions(
    "custom",
    (baseUrl) => {
      if (baseUrl === null) {
        throw new Error("A custom provider needs its checked base URL.");
      }
      return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
    },
    standardParameters,
  ),
};
