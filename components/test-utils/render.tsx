import "@testing-library/jest-dom/vitest";
import { cleanup, render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Language } from "@/lib/i18n/language";

/**
 * Browser APIs jsdom lacks. The dialog stand-ins copy only what ui/dialog.tsx uses: the open
 * attribute and the close event.
 */
function installBrowserGaps() {
  const dialog = window.HTMLDialogElement.prototype as HTMLDialogElement;
  if (typeof dialog.showModal !== "function") {
    dialog.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    dialog.close = function close(this: HTMLDialogElement) {
      if (this.hasAttribute("open")) {
        this.removeAttribute("open");
        this.dispatchEvent(new Event("close"));
      }
    };
  }
  // Reduced motion keeps Motion transitions at zero duration, so tests never wait on an animation.
  window.matchMedia ??= (query: string) =>
    ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
  // Vitest's jsdom environment keeps Node's URL, whose createObjectURL refuses jsdom's Blob.
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => undefined;
  // jsdom's own scrollTo only logs "not implemented".
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
}

installBrowserGaps();

// Vitest runs without globals, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
});

export function renderWithI18n(ui: ReactElement, language: Language = "en"): RenderResult {
  return render(
    <I18nProvider language={language} dictionary={getDictionary(language)}>
      {ui}
    </I18nProvider>,
  );
}
