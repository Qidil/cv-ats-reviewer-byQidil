// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLogo } from "./brand-logo";

const read = (...segments: string[]) => readFileSync(path.join(process.cwd(), ...segments), "utf8");

describe("BrandLogo", () => {
  it("is a decorative image, because the product name sits next to it as text", () => {
    const { container } = render(<BrandLogo />);
    const image = container.querySelector("img");

    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toContain("doctorcv-logo.svg");
    expect(image?.getAttribute("alt")).toBe("");
    expect(image?.getAttribute("loading")).toBe("eager");
  });

  it("accepts a size class from the place that uses it", () => {
    const { container } = render(<BrandLogo className="h-9" />);

    expect(container.querySelector("img")?.className).toContain("h-9");
  });
});

describe.each([
  ["page logo", ["public", "doctorcv-logo.svg"]],
  ["favicon", ["app", "icon.svg"]],
])("%s SVG file", (_label, segments) => {
  const svg = read(...segments);

  it("is a standalone vector with a viewBox", () => {
    expect(svg).toMatch(/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
  });

  it("draws the letters as paths, so no font is needed", () => {
    expect(svg).not.toMatch(/<text[\s>]/i);
  });

  it("carries no script, raster image, or external reference", () => {
    expect(svg).not.toMatch(/<script|<foreignObject|<image|<use|<style/i);
    expect(svg).not.toMatch(/\bhref=|xlink:|url\(|\bon[a-z]+=/i);
  });
});
