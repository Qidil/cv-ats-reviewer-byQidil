// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/components/test-utils/render";
import { LanguageSwitcher } from "./language-switcher";

let mockPathname = "/en";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push }),
}));

afterEach(() => {
  document.cookie = "lang=; path=/; max-age=0";
  mockPathname = "/en";
  push.mockClear();
});

describe("LanguageSwitcher dropdown (StyleGuide §8.4)", () => {
  it("shows only the EN and ID tags with the current one selected", () => {
    renderWithI18n(<LanguageSwitcher locked={false} />);
    const select = screen.getByRole("combobox", { name: "Language" });
    expect(select).toHaveValue("en");
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["EN", "ID"]);
  });

  it("remembers the choice in the cookie proxy.ts reads and navigates", () => {
    renderWithI18n(<LanguageSwitcher locked={false} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), { target: { value: "id" } });
    expect(document.cookie).toContain("lang=id");
    expect(push).toHaveBeenCalledWith("/id");
  });

  it("preserves subpaths like /app when switching language", () => {
    mockPathname = "/en/app";
    renderWithI18n(<LanguageSwitcher locked={false} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), { target: { value: "id" } });
    expect(push).toHaveBeenCalledWith("/id/app");
  });

  it("names the group in Indonesian on the Indonesian page", () => {
    mockPathname = "/id";
    renderWithI18n(<LanguageSwitcher locked={false} />, "id");
    expect(screen.getByRole("combobox", { name: "Bahasa" })).toHaveValue("id");
  });

  it("locks the dropdown during an analysis and says why", () => {
    renderWithI18n(<LanguageSwitcher locked />);
    const select = screen.getByRole("combobox", { name: "Language" });
    expect(select).toBeDisabled();
    expect(select).toHaveAccessibleDescription(
      "Wait for the analysis to finish or cancel it before switching language.",
    );
  });
});
