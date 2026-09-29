// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/components/test-utils/render";
import { LandingPage } from "./landing-page";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en",
  useRouter: () => ({ push: vi.fn() }),
}));

describe("Landing Page Components (FEAT-13, BR-14)", () => {
  it("renders full landing page in English", () => {
    renderWithI18n(<LandingPage />, "en");

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Audit your CV against real ATS criteria with precision",
    );
    expect(screen.getByRole("heading", { name: /How the Engine Works/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Evaluation Rubric & AI Constraints/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Simulation Notice & Disclaimer/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Frequently Asked Questions/ })).toBeInTheDocument();
  });

  it("renders full landing page in Indonesian", () => {
    renderWithI18n(<LandingPage />, "id");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Audit CV Anda dengan standar ATS nyata secara presisi",
    );
    expect(screen.getByRole("heading", { name: /Bagaimana Mesin Ini Bekerja/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Aspek Penilaian & Batasan Ketat AI/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Pemberitahuan Simulasi & Penafian Resmi/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Pertanyaan yang Sering Diajukan/ })).toBeInTheDocument();
  });

  it("keeps the workspace CTA in the hero pointing at /app", () => {
    renderWithI18n(<LandingPage />, "en");

    const cta = screen.getByRole("link", { name: "Start Free Review" });
    expect(cta).toHaveAttribute("href", "/en/app");
  });

  it("opens the burger drawer with the section links and the workspace action", () => {
    renderWithI18n(<LandingPage />, "en");

    // Closed: the section links live only inside the drawer.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const drawer = within(screen.getByRole("dialog"));
    expect(drawer.getByRole("link", { name: "How It Works" })).toHaveAttribute("href", "#how-it-works");
    expect(drawer.getByRole("link", { name: "Scoring Rubric" })).toHaveAttribute("href", "#rubric");
    expect(drawer.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "#privacy");
    expect(drawer.getByRole("link", { name: "FAQ" })).toHaveAttribute("href", "#faq");
    expect(drawer.getByRole("button", { name: "Open Reviewer" })).toBeInTheDocument();
  });

  it("closes the drawer when a section link is clicked", () => {
    renderWithI18n(<LandingPage />, "en");

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const link = within(screen.getByRole("dialog")).getByRole("link", { name: "Privacy" });
    // jsdom cannot scroll to the anchor; the drawer still closes on the click.
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("toggles FAQ accordion questions and answers", () => {
    renderWithI18n(<LandingPage />, "en");

    const firstQuestion = screen.getByRole("button", {
      name: /Is CV ATS Reviewer completely free\?/i,
    });
    expect(firstQuestion).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(firstQuestion);
    expect(firstQuestion).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(firstQuestion);
    expect(firstQuestion).toHaveAttribute("aria-expanded", "true");
  });

  it("prominently renders the simulation disclaimer text", () => {
    renderWithI18n(<LandingPage />, "en");

    expect(
      screen.getByText(/is an independent educational audit and simulation tool/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Workday, Taleo, Greenhouse, or Lever/i)).toBeInTheDocument();
  });
});
