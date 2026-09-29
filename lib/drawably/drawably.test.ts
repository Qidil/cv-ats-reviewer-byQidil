import { describe, expect, it } from "vitest";
import {
  mulberry32,
  randomSeed,
  roughArrow,
  roughCheckmark,
  roughCircle,
  roughEllipse,
  roughLine,
  roughRoundedRect,
  scribbleFill,
  variants,
} from "./index";

describe("Drawably Core Utilities", () => {
  it("mulberry32 generates deterministic pseudorandom numbers for a given seed", () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);
    const seq1 = [rng1(), rng1(), rng1()];
    const seq2 = [rng2(), rng2(), rng2()];
    expect(seq1).toEqual(seq2);
    expect(seq1[0]).toBeGreaterThanOrEqual(0);
    expect(seq1[0]).toBeLessThan(1);
  });

  it("randomSeed returns an integer within 32-bit unsigned range", () => {
    const seed = randomSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(0x100000000);
  });

  it("roughLine returns an SVG path starting with M", () => {
    const path = roughLine(0, 0, 100, 100, { seed: 1, roughness: 1 });
    expect(path).toContain("M");
    expect(path).toContain("Q");
  });

  it("roughCircle and roughEllipse generate closed SVG paths", () => {
    const circle = roughCircle(50, 50, 20, { seed: 2, roughness: 1 });
    const ellipse = roughEllipse(50, 50, 30, 15, { seed: 3, roughness: 1 });
    expect(circle).toContain("Z");
    expect(ellipse).toContain("Z");
  });

  it("roughRoundedRect generates a closed rounded rectangle path", () => {
    const rect = roughRoundedRect(10, 10, 80, 40, 6, { seed: 4, roughness: 1 });
    expect(rect).toContain("M");
    expect(rect).toContain("Z");
  });

  it("roughCheckmark generates checkmark strokes", () => {
    const check = roughCheckmark(5, 5, 20, 20, { seed: 5, roughness: 1 });
    expect(check).toContain("M");
    expect(check).toContain("Q");
  });

  it("roughArrow includes line and arrowhead strokes", () => {
    const arrow = roughArrow(0, 0, 100, 50, { seed: 6, roughness: 1 });
    expect(arrow.length).toBeGreaterThan(20);
    expect(arrow).toContain("M");
  });

  it("scribbleFill generates multi-stroke fill lines", () => {
    const fill = scribbleFill(0, 0, 50, 50, { seed: 7, roughness: 1 });
    expect(fill).toContain("M");
    expect(fill.length).toBeGreaterThan(30);
  });

  it("variants generates multiple boil frames for animations", () => {
    const frames = variants(
      (o) => roughRoundedRect(0, 0, 50, 20, 4, o),
      { seed: 10, roughness: 1, boil: 0.3 },
      3,
    );
    expect(frames).toHaveLength(3);
    expect(frames[0]).not.toEqual(frames[1]);
  });
});
