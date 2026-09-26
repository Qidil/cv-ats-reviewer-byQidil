import { describe, expect, it } from "vitest";
import { en } from "./en";
import { id } from "./id";

type Leaves = Map<string, string>;

function leaves(value: unknown, path = "", out: Leaves = new Map()): Leaves {
  if (typeof value === "string") {
    out.set(path, value);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      leaves(child, path ? `${path}.${key}` : key, out);
    }
  }
  return out;
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

const english = leaves(en);
const indonesian = leaves(id);

describe("interface dictionaries (FEAT-11)", () => {
  it("has the same keys in both languages", () => {
    expect([...indonesian.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it("uses the same placeholders for every key", () => {
    for (const [key, text] of english) {
      expect(placeholders(indonesian.get(key) ?? ""), key).toEqual(placeholders(text));
    }
  });

  it("has no empty strings", () => {
    for (const [key, text] of [...english, ...indonesian]) {
      expect(text.trim(), key).not.toBe("");
    }
  });

  it("follows the copy rules: no em dash, no internal mode names or old check names", () => {
    for (const [key, text] of [...english, ...indonesian]) {
      expect(text, key).not.toContain("\u2014");
      expect(text, key).not.toMatch(/\bMode [AB]\b|Keamanan Parsing|kunci bawaan|built-in key/i);
    }
  });
});
