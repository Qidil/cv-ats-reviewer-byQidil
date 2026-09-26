import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("keeps a StyleGuide font size next to a text color", () => {
    expect(cn("text-body", "text-primary")).toBe("text-body text-primary");
  });

  it("lets a later class of the same group win", () => {
    expect(cn("text-body", "text-small")).toBe("text-small");
    expect(cn("bg-surface", false, "bg-surface-elevated")).toBe("bg-surface-elevated");
  });
});
