import { describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE, isLanguage, negotiateLanguage } from "./language";

describe("negotiateLanguage (BR-13)", () => {
  it.each([
    [null, "en"],
    ["", "en"],
    ["id", "id"],
    ["en", "en"],
    ["id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7", "id"],
    ["en-US,en;q=0.9,id;q=0.8", "en"],
    ["fr-FR,fr;q=0.9,id;q=0.5", "id"],
    ["en;q=0.2, id;q=0.9", "id"],
    ["id;q=0, en;q=0.1", "en"],
    ["fr, de", "en"],
    ["*", "en"],
    [" ID ", "id"],
  ])("maps %j to %s", (header, expected) => {
    expect(negotiateLanguage(header)).toBe(expected);
  });

  it("defaults to English and knows only the two languages", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
    expect(isLanguage("id")).toBe(true);
    expect(isLanguage("fr")).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
  });
});
