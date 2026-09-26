// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithI18n } from "@/components/test-utils/render";
import type { SuggestedJob } from "@/types/ats";
import { JobList } from "./job-card";

const job = (title: string, matchScore: number): SuggestedJob => ({
  title,
  matchScore,
  reason: `${title} work.`,
  keyStrengths: ["Excel"],
  missingSkills: ["SQL"],
});

describe("JobList (AC-03.1)", () => {
  it("shows at most 5 roles, the best match first, even for a result stored with more", () => {
    renderWithI18n(
      <JobList
        jobs={[job("Analyst", 61), job("Engineer", 90), job("Designer", 40), job("Manager", 75), job("Writer", 55), job("Tester", 70), job("Clerk", 30)]}
      />,
    );
    const list = within(screen.getByRole("region", { name: "Roles that fit this CV best" }));
    expect(list.getAllByText(/% match$/).map((item) => item.textContent)).toEqual([
      "90% match",
      "75% match",
      "70% match",
      "61% match",
      "55% match",
    ]);
  });
});
