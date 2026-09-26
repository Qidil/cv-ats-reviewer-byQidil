// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/components/test-utils/render";
import type { Language } from "@/lib/i18n/language";
import type { AnalysisMode } from "@/types/ats";
import { JOB_DESCRIPTION_MAX, JOB_TITLE_MAX, ModeSelector } from "./mode-selector";

function renderSelector(mode: AnalysisMode, options: { language?: Language; missing?: boolean; description?: string } = {}) {
  const onModeChange = vi.fn();
  renderWithI18n(
    <ModeSelector
      mode={mode}
      onModeChange={onModeChange}
      jobTitle=""
      onJobTitleChange={vi.fn()}
      jobDescription={options.description ?? ""}
      onJobDescriptionChange={vi.fn()}
      disabled={false}
      missingDescription={options.missing ?? false}
    />,
    options.language,
  );
  return { onModeChange };
}

describe("ModeSelector", () => {
  it("asks for nothing more in a general review", () => {
    renderSelector("mode-b");
    expect(screen.getByRole("radio", { name: /General review/ })).toBeChecked();
    expect(screen.queryByLabelText("Job description")).not.toBeInTheDocument();
  });

  it("switches type through the radio cards", () => {
    const { onModeChange } = renderSelector("mode-b");
    fireEvent.click(screen.getByRole("radio", { name: /Match a job posting/ }));
    expect(onModeChange).toHaveBeenCalledWith("mode-a");
  });

  it("shows the job fields with the api.md limits when matching a posting", () => {
    renderSelector("mode-a", { description: "Budi Santoso" });
    expect(screen.getByLabelText("Job title (optional)")).toHaveAttribute("maxLength", String(JOB_TITLE_MAX));
    expect(screen.getByLabelText("Job description")).toHaveAttribute("maxLength", String(JOB_DESCRIPTION_MAX));
    expect(screen.getByText("12 / 20,000")).toBeInTheDocument();
  });

  it("writes the counter the Indonesian way", () => {
    renderSelector("mode-a", { language: "id" });
    expect(screen.getByText("0 / 20.000")).toBeInTheDocument();
  });

  it("marks a missing job description", () => {
    renderSelector("mode-a", { missing: true });
    const field = screen.getByLabelText("Job description");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Paste the job description to match against.");
    expect(field.getAttribute("aria-describedby")).toContain(screen.getByRole("alert").id);
  });
});
