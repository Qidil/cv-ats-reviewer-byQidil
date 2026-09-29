// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DrawablyBadge,
  DrawablyButton,
  DrawablyCard,
  DrawablyUnderline,
} from "./index";

describe("Drawably React Components", () => {
  it("renders DrawablyButton with semantic button and children", () => {
    render(<DrawablyButton>Click Me</DrawablyButton>);
    const button = screen.getByRole("button", { name: "Click Me" });
    expect(button).toBeInTheDocument();
    expect(button.classList.contains("drawably-button")).toBe(true);
    expect(button.querySelector("svg.drawably-svg")).toBeInTheDocument();
  });

  it("renders DrawablyCard with children and sketched svg frame", () => {
    render(<DrawablyCard data-testid="card">Card Content</DrawablyCard>);
    const card = screen.getByTestId("card");
    expect(card).toBeInTheDocument();
    expect(card.classList.contains("drawably-card")).toBe(true);
    expect(card.querySelector("svg.drawably-svg")).toBeInTheDocument();
  });

  it("renders DrawablyBadge with proper text and class", () => {
    render(<DrawablyBadge data-testid="badge">PRO</DrawablyBadge>);
    const badge = screen.getByTestId("badge");
    expect(badge).toBeInTheDocument();
    expect(badge.classList.contains("drawably-badge")).toBe(true);
  });

  it("renders DrawablyUnderline wrapping text content", () => {
    render(<DrawablyUnderline data-testid="underline">Handcrafted</DrawablyUnderline>);
    const span = screen.getByTestId("underline");
    expect(span).toBeInTheDocument();
    expect(span.textContent).toBe("Handcrafted");
  });
});
