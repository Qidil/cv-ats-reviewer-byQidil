// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { pdfFile } from "@/components/test-utils/fixtures";
import { renderWithI18n } from "@/components/test-utils/render";
import { MAX_PDF_BYTES } from "@/lib/pdf/types";
import { Dropzone, checkPdf } from "./dropzone";

function renderDropzone(props: Partial<Parameters<typeof Dropzone>[0]> = {}) {
  const onPick = vi.fn();
  const onRemove = vi.fn();
  const view = renderWithI18n(
    <Dropzone file={null} problem={null} disabled={false} onPick={onPick} onRemove={onRemove} {...props} />,
  );
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) {
    throw new Error("The file input is missing.");
  }
  return { onPick, onRemove, input };
}

describe("checkPdf (BR-01)", () => {
  it("accepts a PDF by type or by extension", () => {
    expect(checkPdf(pdfFile())).toBeNull();
    expect(checkPdf(new File(["x"], "CV.PDF", { type: "" }))).toBeNull();
  });

  it("rejects other files and files over 4 MB before any upload", () => {
    expect(checkPdf(new File(["x"], "cv.png", { type: "image/png" }))).toBe("notPdf");
    expect(checkPdf(pdfFile("big.pdf", MAX_PDF_BYTES + 1))).toBe("tooLarge");
  });
});

describe("Dropzone", () => {
  it("hands a picked file to the dashboard", () => {
    const { onPick, input } = renderDropzone();
    const file = pdfFile();
    fireEvent.change(input, { target: { files: [file] } });
    expect(onPick).toHaveBeenCalledWith(file);
  });

  it("accepts a dropped file", () => {
    const { onPick } = renderDropzone();
    const file = pdfFile();
    fireEvent.drop(screen.getByText("Drop a PDF here"), { dataTransfer: { files: [file] } });
    expect(onPick).toHaveBeenCalledWith(file);
  });

  it("shows the chosen file as a card with its size and source", () => {
    const { onRemove } = renderDropzone({ file: { name: "cv-budi-santoso.pdf", size: 2048, stored: true } });
    expect(screen.getByText("cv-budi-santoso.pdf")).toBeInTheDocument();
    expect(screen.getByText("2 KB · From your history")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove file" }));
    expect(onRemove).toHaveBeenCalled();
  });

  it("announces a problem and links it to the picker", () => {
    renderDropzone({ problem: "This file is not a PDF. Choose a PDF file." });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("This file is not a PDF.");
    expect(screen.getByRole("button", { name: "Choose a file" }).getAttribute("aria-describedby")).toContain(alert.id);
  });
});
