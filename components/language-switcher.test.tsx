// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { getDictionary } from "@/lib/i18n/dictionaries";
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
  it("shows the current tag and opens a sketched listbox with EN and ID", () => {
    renderWithI18n(<LanguageSwitcher locked={false} />);
    const trigger = screen.getByRole("button", { name: "Language" });
    expect(trigger).toHaveTextContent("EN");
    fireEvent.click(trigger);
    const listbox = screen.getByRole("listbox", { name: "Language" });
    expect(within(listbox).getAllByRole("option").map((option) => option.textContent)).toEqual(["EN", "ID"]);
    expect(within(listbox).getByRole("option", { name: "EN" })).toHaveAttribute("aria-selected", "true");
  });

  it("remembers the choice in the cookie proxy.ts reads and navigates", () => {
    renderWithI18n(<LanguageSwitcher locked={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    fireEvent.click(screen.getByRole("option", { name: "ID" }));
    expect(document.cookie).toContain("lang=id");
    expect(push).toHaveBeenCalledWith("/id");
  });

  it("preserves subpaths like /app when switching language", () => {
    mockPathname = "/en/app";
    renderWithI18n(<LanguageSwitcher locked={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    fireEvent.click(screen.getByRole("option", { name: "ID" }));
    expect(push).toHaveBeenCalledWith("/id/app");
  });

  it("names the control in Indonesian on the Indonesian page", () => {
    mockPathname = "/id";
    renderWithI18n(<LanguageSwitcher locked={false} />, "id");
    expect(screen.getByRole("button", { name: "Bahasa" })).toHaveTextContent("ID");
  });

  it("closes on Escape and returns focus to the trigger", () => {
    renderWithI18n(<LanguageSwitcher locked={false} />);
    const trigger = screen.getByRole("button", { name: "Language" });
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("cycles focus through the options with the arrow keys", () => {
    renderWithI18n(<LanguageSwitcher locked={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    const listbox = screen.getByRole("listbox");
    const en = screen.getByRole("option", { name: "EN" });
    const id = screen.getByRole("option", { name: "ID" });
    expect(en).toHaveFocus();
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(id).toHaveFocus();
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(en).toHaveFocus();
    fireEvent.keyDown(listbox, { key: "ArrowUp" });
    expect(id).toHaveFocus();
  });

  it("keeps focus on the trigger when re-selecting the current language", () => {
    renderWithI18n(<LanguageSwitcher locked={false} />);
    const trigger = screen.getByRole("button", { name: "Language" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: "EN" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(push).not.toHaveBeenCalled();
  });

  it("locks the dropdown during an analysis and says why", () => {
    renderWithI18n(<LanguageSwitcher locked />);
    expect(screen.getByRole("button", { name: "Language" })).toBeDisabled();
    const group = screen.getByRole("group");
    expect(group).toHaveAttribute("tabindex", "0");
    expect(group).toHaveAccessibleDescription(
      "Wait for the analysis to finish or cancel it before switching language.",
    );
  });

  it("closes an open menu when the analysis locks the control", () => {
    const { rerender } = renderWithI18n(<LanguageSwitcher locked={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    rerender(
      <I18nProvider language="en" dictionary={getDictionary("en")}>
        <LanguageSwitcher locked />
      </I18nProvider>,
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
