import { useSyncExternalStore } from "react";
import { detectKeyProvider, parseCustomBaseUrl, type KeyProvider } from "@/types/api";
import { LOCAL_STORAGE_KEYS } from "@/types/db";

export interface PersonalKeySettings {
  apiKey: string;
  /** Optional for an OpenRouter key, required for every other key (BR-10). */
  model: string;
  /** An OpenAI-compatible endpoint address, for a local or private server or an unrecognized provider. */
  baseUrl: string;
}

const EMPTY: PersonalKeySettings = { apiKey: "", model: "", baseUrl: "" };
/** Same-tab writes do not fire the storage event, so the hook listens for this one too. */
const CHANGE_EVENT = "cv-ats-settings-change";

/** Where the analysis goes, by the same rules the server applies (ADR-009); null when the app cannot tell. */
export function personalKeyProvider(settings: PersonalKeySettings): KeyProvider | null {
  if (settings.baseUrl.trim() !== "") {
    return "custom";
  }
  return settings.apiKey.trim() === "" ? null : detectKeyProvider(settings.apiKey, settings.model);
}

/**
 * G-03: a key travels in an HTTP header, which takes only visible ASCII. A pasted key can carry a
 * zero-width space or a curly quote that trim() keeps, and the browser would refuse the whole request.
 */
export function isSendableKey(apiKey: string): boolean {
  return /^[\x21-\x7e]+$/.test(apiKey.trim());
}

/** Private modes can make localStorage throw on access; the settings then simply stay empty. */
function localStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readPersonalKey(storage: Storage | null = localStore()): PersonalKeySettings {
  if (storage === null) {
    return EMPTY;
  }
  try {
    return {
      apiKey: storage.getItem(LOCAL_STORAGE_KEYS.byokKey)?.trim() ?? "",
      model: storage.getItem(LOCAL_STORAGE_KEYS.byokModel)?.trim() ?? "",
      baseUrl: storage.getItem(LOCAL_STORAGE_KEYS.byokBaseUrl)?.trim() ?? "",
    };
  } catch {
    return EMPTY;
  }
}

function announce() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

function setOrRemove(storage: Storage, key: string, value: string) {
  if (value === "") {
    storage.removeItem(key);
  } else {
    storage.setItem(key, value);
  }
}

/** Returns false when the browser refuses to store it (private mode, full storage). */
export function savePersonalKey(settings: PersonalKeySettings, storage: Storage | null = localStore()): boolean {
  if (storage === null) {
    return false;
  }
  try {
    storage.setItem(LOCAL_STORAGE_KEYS.byokKey, settings.apiKey.trim());
    setOrRemove(storage, LOCAL_STORAGE_KEYS.byokModel, settings.model.trim());
    setOrRemove(storage, LOCAL_STORAGE_KEYS.byokBaseUrl, settings.baseUrl.trim());
    announce();
    return true;
  } catch {
    return false;
  }
}

export function clearPersonalKey(storage: Storage | null = localStore()): void {
  try {
    storage?.removeItem(LOCAL_STORAGE_KEYS.byokKey);
    storage?.removeItem(LOCAL_STORAGE_KEYS.byokModel);
    storage?.removeItem(LOCAL_STORAGE_KEYS.byokBaseUrl);
  } catch {
    // Nothing stored means nothing to clear.
  }
  announce();
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

let cachedKey = "";
let cachedSettings: PersonalKeySettings = EMPTY;

/** useSyncExternalStore needs the same object back while nothing changed. */
function snapshot(): PersonalKeySettings {
  const current = readPersonalKey();
  const key = [current.apiKey, current.model, current.baseUrl].join("\n");
  if (key !== cachedKey) {
    cachedKey = key;
    cachedSettings = current;
  }
  return cachedSettings;
}

export function usePersonalKey(): PersonalKeySettings {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

export type KeyTestResult =
  | { ok: true; freeTier: boolean | null; models: string[] }
  | { ok: false; reason: "rejected" | "unavailable" };

/**
 * api.md § Personal-Key Providers: each provider's key or model-list endpoint. Perplexity has no
 * model list and NVIDIA's is public, so neither can say whether a key works.
 */
const KEY_TEST_URLS: Readonly<Partial<Record<KeyProvider, string>>> = {
  openrouter: "https://openrouter.ai/api/v1/key",
  openai: "https://api.openai.com/v1/models",
  anthropic: "https://api.anthropic.com/v1/models",
  google: "https://generativelanguage.googleapis.com/v1beta/openai/models",
  groq: "https://api.groq.com/openai/v1/models",
  mistral: "https://api.mistral.ai/v1/models",
  deepseek: "https://api.deepseek.com/models",
  xai: "https://api.x.ai/v1/models",
  fireworks: "https://api.fireworks.ai/inference/v1/models",
  cerebras: "https://api.cerebras.ai/v1/models",
  huggingface: "https://huggingface.co/api/whoami-v2",
};

/** Enough for a datalist; some providers list hundreds of models. */
const MAX_MODEL_SUGGESTIONS = 200;

export function keyTestRequest(settings: PersonalKeySettings): { url: string; headers: Record<string, string> } | null {
  const apiKey = settings.apiKey.trim();
  const provider = personalKeyProvider(settings);
  if (provider === "custom") {
    const base = parseCustomBaseUrl(settings.baseUrl);
    return base === null ? null : { url: `${base.href.replace(/\/+$/, "")}/models`, headers: { Authorization: `Bearer ${apiKey}` } };
  }
  const url = provider === null ? undefined : KEY_TEST_URLS[provider];
  if (url === undefined) {
    return null;
  }
  if (provider === "anthropic") {
    // Anthropic answers browser requests only when they say so explicitly.
    return {
      url,
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    };
  }
  return { url, headers: { Authorization: `Bearer ${apiKey}` } };
}

function modelIds(body: unknown): string[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) {
    return [];
  }
  const ids = data
    .map((item) => (item !== null && typeof item === "object" ? (item as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === "string" && id !== "")
    // Google lists "models/<id>", while its chat endpoint takes the bare ID.
    .map((id) => id.replace(/^models\//, ""));
  return [...new Set(ids)].slice(0, MAX_MODEL_SUGGESTIONS);
}

/**
 * T6/T22: asks the provider directly from the browser, so this app never offers an endpoint that
 * checks arbitrary keys. A provider without a usable endpoint reads as "could not be checked".
 */
export async function testPersonalKey(settings: PersonalKeySettings, fetchImpl: typeof fetch = fetch): Promise<KeyTestResult> {
  const request = keyTestRequest(settings);
  if (request === null) {
    return { ok: false, reason: "unavailable" };
  }
  let response: Response;
  try {
    response = await fetchImpl(request.url, { headers: request.headers, signal: AbortSignal.timeout(15_000) });
  } catch {
    // Offline, or a host that refuses browser requests (CORS).
    return { ok: false, reason: "unavailable" };
  }
  // These GET requests carry nothing but the key, so a 400 can only be about the key (Google, xAI).
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    return { ok: false, reason: "rejected" };
  }
  if (!response.ok) {
    return { ok: false, reason: "unavailable" };
  }
  try {
    const body = (await response.json()) as { data?: { is_free_tier?: unknown } } | null;
    if (personalKeyProvider(settings) === "openrouter") {
      const freeTier = body?.data?.is_free_tier;
      return { ok: true, freeTier: typeof freeTier === "boolean" ? freeTier : null, models: [] };
    }
    return { ok: true, freeTier: null, models: modelIds(body) };
  } catch {
    return { ok: true, freeTier: null, models: [] };
  }
}
