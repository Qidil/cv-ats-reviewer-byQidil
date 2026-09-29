// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, screen } from "@testing-library/react";
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

describe("Landing Page Components (FEAT-13, BR-14)", () => {
  it("renders full landing page in English", () => {
    renderWithI18n(<LandingPage />, "en");

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Audit your CV against real ATS criteria with precision",
    );
    expect(screen.getByText("How the Engine Works")).toBeInTheDocument();
    expect(screen.getByText("Evaluation Rubric & AI Constraints")).toBeInTheDocument();
    expect(screen.getByText("Simulation Notice & Disclaimer")).toBeInTheDocument();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
  });

  it("renders full landing page in Indonesian", () => {
    renderWithI18n(<LandingPage />, "id");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Audit CV Anda dengan standar ATS nyata secara presisi",
    );
    expect(screen.getByText("Bagaimana Mesin Ini Bekerja")).toBeInTheDocument();
    expect(screen.getByText("Aspek Penilaian & Batasan Ketat AI")).toBeInTheDocument();
    expect(screen.getByText("Pemberitahuan Simulasi & Penafian Resmi")).toBeInTheDocument();
    expect(screen.getByText("Pertanyaan yang Sering Diajukan")).toBeInTheDocument();
  });

  it("contains direct CTA links to the analysis workspace", () => {
    renderWithI18n(<LandingPage />, "en");

    const ctas = screen.getAllByRole("link", { name: /Start Free Review|Open Reviewer/i });
    expect(ctas.length).toBeGreaterThan(0);
    expect(ctas.some((link) => link.getAttribute("href") === "/en/app")).toBe(true);
  });

  it("toggles FAQ accordion questions and answers", () => {
    renderWithI18n(<LandingPage />, "en");

    const firstQuestion = screen.getByRole("button", {
      name: /Is CV ATS Reviewer completely free\?/i,
    });
    expect(firstQuestion).toHaveAttribute("aria-expanded", "true");

    // Click to collapse
    fireEvent.click(firstQuestion);
    expect(firstQuestion).toHaveAttribute("aria-expanded", "false");

    // Click to expand again
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
