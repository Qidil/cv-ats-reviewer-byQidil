// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/components/test-utils/render";
import { LanguageSwitcher } from "./language-switcher";

// next/link needs the App Router; a plain anchor keeps the props that matter here.
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  document.cookie = "lang=; path=/; max-age=0";
});

describe("LanguageSwitcher (StyleGuide §7.6)", () => {
  it("marks the current language and links the other one in its own language", () => {
    renderWithI18n(<LanguageSwitcher locked={false} />);
    expect(screen.getByRole("navigation", { name: "Language" })).toBeInTheDocument();
    expect(screen.getByText("English").closest("[aria-current]")).toHaveAttribute("lang", "en");
    const other = screen.getByRole("link", { name: "Bahasa Indonesia" });
    expect(other).toHaveAttribute("href", "/id");
    expect(other).toHaveAttribute("hreflang", "id");
    expect(other).toHaveAttribute("lang", "id");
  });

  it("remembers the choice in the cookie proxy.ts reads", () => {
    renderWithI18n(<LanguageSwitcher locked={false} />);
    const link = screen.getByRole("link", { name: "Bahasa Indonesia" });
    // jsdom cannot follow the link; the cookie is written before navigation either way.
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(document.cookie).toContain("lang=id");
  });

  it("names the group in Indonesian on the Indonesian page", () => {
    renderWithI18n(<LanguageSwitcher locked={false} />, "id");
    expect(screen.getByRole("navigation", { name: "Bahasa" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "English" })).toHaveAttribute("href", "/en");
  });

  it("locks the other language during an analysis and says why", () => {
    renderWithI18n(<LanguageSwitcher locked />);
    const other = screen.getByRole("link", { name: "Bahasa Indonesia" });
    expect(other).toHaveAttribute("aria-disabled", "true");
    expect(other).not.toHaveAttribute("href");
    expect(other).toHaveAttribute("tabindex", "0");
    expect(other).toHaveAccessibleDescription(
      "Wait for the analysis to finish or cancel it before switching language.",
    );
  });
});
