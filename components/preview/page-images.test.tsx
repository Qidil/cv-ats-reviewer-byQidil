// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/components/test-utils/render";
import type { CvPageImage } from "@/types/db";
import { PageImages } from "./page-images";

const BOX = { x0: 0, y0: 0, x1: 612, y1: 792 };

const pages: CvPageImage[] = [
  { pageNumber: 1, box: BOX, image: { blob: new Blob(["webp"], { type: "image/webp" }), width: 1240, height: 1605 } },
  { pageNumber: 2, box: BOX, image: null },
];

describe("PageImages (FEAT-07, T11)", () => {
  it("shows stored page images and a notice for a page the server sent no image for", () => {
    renderWithI18n(<PageImages pages={pages} />);
    const image = screen.getByRole("img", { name: "Page 1 of your CV" });
    expect(image).toHaveAttribute("src", "blob:test");
    expect(image).toHaveAttribute("width", "1240");
    expect(screen.getByText("No image for this page.")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  it("can be scrolled from the keyboard", () => {
    renderWithI18n(<PageImages pages={pages} />);
    expect(screen.getByRole("region", { name: "Pages" })).toHaveAttribute("tabindex", "0");
  });

  it("revokes the object URL when the image goes away", () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const { unmount } = renderWithI18n(<PageImages pages={pages} />);
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:test");
    revoke.mockRestore();
  });
});
