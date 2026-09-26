// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/components/test-utils/render";
import { LOCAL_STORAGE_KEYS } from "@/types/db";
import { ByokModal } from "./byok-modal";

/** Fake keys shaped like each provider's; tests never use a real one. */
const OPENROUTER_KEY = "sk-or-v1-test-0000";

function renderModal() {
  const onKeyChanged = vi.fn();
  renderWithI18n(<ByokModal open onClose={vi.fn()} onKeyChanged={onKeyChanged} />);
  return { onKeyChanged };
}

const typeKey = (value: string) => fireEvent.change(screen.getByLabelText("API key"), { target: { value } });
const typeModel = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ByokModal (FEAT-05, StyleGuide §7.3)", () => {
  it("asks for no model before a key is typed (G-09)", () => {
    renderModal();
    expect(screen.getByLabelText("Model (optional)")).not.toHaveAttribute("aria-required", "true");
    expect(screen.queryByLabelText("Model (required)")).not.toBeInTheDocument();
    typeKey("gsk_test-0000");
    expect(screen.getByLabelText("Model (required)")).toHaveAttribute("aria-required", "true");
  });

  it("refuses a key with a character a request header cannot carry (G-03)", () => {
    const { onKeyChanged } = renderModal();
    typeKey(`${OPENROUTER_KEY}\u200b`);
    save();
    expect(screen.getByRole("alert")).toHaveTextContent("The key contains characters that cannot be sent");
    expect(screen.getByLabelText("API key")).toHaveFocus();
    expect(screen.getByLabelText("API key")).toHaveAttribute("aria-invalid", "true");
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.byokKey)).toBeNull();
    expect(onKeyChanged).not.toHaveBeenCalled();
  });

  it("takes only the key and model, and names the provider it recognizes", () => {
    const { onKeyChanged } = renderModal();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("Using the app's free quota")).toBeInTheDocument();
    typeKey(` ${OPENROUTER_KEY} `);
    expect(screen.getByText("Provider: OpenRouter")).toBeInTheDocument();
    typeModel("Model (optional)", "openrouter/free");
    save();
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.byokKey)).toBe(OPENROUTER_KEY);
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.byokModel)).toBe("openrouter/free");
    expect(screen.getByText("Saved.")).toBeInTheDocument();
    expect(screen.getByText("Using your OpenRouter API key, stored in this browser only")).toBeInTheDocument();
    expect(onKeyChanged).toHaveBeenCalledTimes(1);
  });

  it("recognizes a generic key by its model", () => {
    renderModal();
    typeKey("sk-test-0000");
    expect(screen.getByText(/does not recognize this key/)).toBeInTheDocument();
    typeModel("Model (required)", "deepseek-chat");
    expect(screen.getByText("Provider: DeepSeek")).toBeInTheDocument();
  });

  it("keeps the key masked until it is shown", () => {
    renderModal();
    const field = screen.getByLabelText("API key");
    expect(field).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(field).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
  });

  it("cannot test or save an empty key", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Test key" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("requires a model for every key except OpenRouter's (BR-10)", () => {
    const { onKeyChanged } = renderModal();
    typeKey("gsk_test-0000");
    expect(screen.getByText("Provider: Groq")).toBeInTheDocument();
    save();
    const model = screen.getByLabelText("Model (required)");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the model to use with this key.");
    expect(model).toHaveAttribute("aria-invalid", "true");
    expect(model).toHaveFocus();
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.byokKey)).toBeNull();
    expect(onKeyChanged).not.toHaveBeenCalled();
  });

  it("asks for the address instead of guessing when it does not recognize the key (AC-05.8)", () => {
    renderModal();
    typeKey("mystery-key-0000");
    typeModel("Model (required)", "llama3");
    save();
    const address = screen.getByLabelText("Endpoint address (optional)");
    expect(screen.getByRole("alert")).toHaveTextContent("The app does not recognize this key with this model.");
    expect(address).toHaveFocus();
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.byokKey)).toBeNull();

    fireEvent.change(address, { target: { value: "http://localhost:11434/v1" } });
    expect(screen.getByText("Provider: the endpoint address below")).toBeInTheDocument();
    save();
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.byokBaseUrl)).toBe("http://localhost:11434/v1");
    expect(screen.getByText("Using your API key for a custom endpoint, stored in this browser only")).toBeInTheDocument();
  });

  it("refuses an address with a login or a query", () => {
    renderModal();
    typeKey("mystery-key-0000");
    typeModel("Model (required)", "llama3");
    fireEvent.change(screen.getByLabelText("Endpoint address (optional)"), { target: { value: "https://user:pass@api.example.com/v1" } });
    save();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter an http or https address without a login or query");
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.byokKey)).toBeNull();
  });

  it("tests the typed key with the recognized provider from the browser (T6)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: { is_free_tier: true } }) }));
    vi.stubGlobal("fetch", fetchMock);
    renderModal();
    typeKey(OPENROUTER_KEY);
    fireEvent.click(screen.getByRole("button", { name: "Test key" }));
    expect(await screen.findByText("The provider accepted this key. It is on the free tier.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/key",
      expect.objectContaining({ headers: { Authorization: `Bearer ${OPENROUTER_KEY}` } }),
    );
  });

  it("offers the models a successful test returns (T22)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: "llama-test" }, { id: "mixtral-test" }] }) })),
    );
    renderModal();
    typeKey("gsk_test-0000");
    fireEvent.click(screen.getByRole("button", { name: "Test key" }));
    expect(await screen.findByText("The provider accepted this key.")).toBeInTheDocument();
    const model = screen.getByLabelText("Model (required)");
    const options = [...(document.getElementById(model.getAttribute("list") ?? "")?.querySelectorAll("option") ?? [])];
    expect(options.map((option) => option.value)).toEqual(["llama-test", "mixtral-test"]);
  });

  it("reports a key the provider rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401 })));
    renderModal();
    typeKey(OPENROUTER_KEY);
    fireEvent.click(screen.getByRole("button", { name: "Test key" }));
    expect(await screen.findByText("The provider rejected this key.")).toBeInTheDocument();
  });

  it("removes a saved key and says the free quota is back", () => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.byokKey, "MistralKey0000");
    localStorage.setItem(LOCAL_STORAGE_KEYS.byokModel, "mistral-small-latest");
    const { onKeyChanged } = renderModal();
    expect(screen.getByText("Using your Mistral API key, stored in this browser only")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove key" }));
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.byokKey)).toBeNull();
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.byokModel)).toBeNull();
    expect(screen.getByText("Key removed. Analyses now use the free quota.")).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toHaveValue("");
    expect(onKeyChanged).toHaveBeenCalledTimes(1);
  });
});
