import { describe, it, expect } from "vitest";
import { smoothPath, areaPath, toPoints } from "../chart";

describe("toPoints", () => {
  it("spreads values across the width and puts zero on the baseline", () => {
    expect(toPoints([0, 5, 10], 100, 50, 10)).toEqual([
      { x: 0, y: 50 },
      { x: 50, y: 25 },
      { x: 100, y: 0 },
    ]);
  });
  it("offsets the plot so the peak keeps headroom", () => {
    const pts = toPoints([0, 10], 100, 50, 10, 5, 20);
    expect(pts).toEqual([
      { x: 5, y: 70 }, // baseline = offsetY + height
      { x: 105, y: 20 }, // peak sits offsetY below the top of the drawing
    ]);
  });

  it("never divides by a zero max and clamps negatives", () => {
    expect(toPoints([0, 0], 10, 10, 0).every((p) => p.y === 10)).toBe(true);
    expect(toPoints([-3], 10, 10, 5)).toEqual([{ x: 5, y: 10 }]);
  });
});

describe("smoothPath", () => {
  it("is empty for no points and a lone move for one", () => {
    expect(smoothPath([])).toBe("");
    expect(smoothPath([{ x: 1, y: 2 }])).toBe("M1,2");
  });

  it("is a cubic curve through every point", () => {
    const pts = toPoints([1, 4, 2, 8], 300, 100, 8);
    const d = smoothPath(pts);
    expect(d.startsWith("M0,")).toBe(true);
    expect((d.match(/C/g) || []).length).toBe(3);
    expect(d.endsWith(`${pts[3].x},${pts[3].y}`)).toBe(true);
  });

  it("does not overshoot: a spike's curve stays within the data's own range", () => {
    // 0 -> 10 -> 0 : control points must never leave [0,10] (y in px: 100..0).
    const pts = toPoints([0, 10, 0, 0, 10, 0], 500, 100, 10);
    const nums = smoothPath(pts).match(/-?\d+(\.\d+)?/g)!.map(Number);
    // y values are every second number.
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(100);
  });

  it("flat data stays flat", () => {
    const d = smoothPath(toPoints([3, 3, 3], 100, 30, 6));
    const ys = d.match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, i) => i % 2 === 1);
    expect(new Set(ys).size).toBe(1);
  });
});

describe("areaPath", () => {
  it("closes the curve down to the baseline", () => {
    const pts = toPoints([1, 2, 3], 100, 40, 3);
    const d = areaPath(pts, 40);
    expect(d).toContain("L100,40 L0,40 Z");
    expect(d.startsWith(smoothPath(pts))).toBe(true);
  });
  it("needs at least two points", () => {
    expect(areaPath([{ x: 0, y: 0 }], 10)).toBe("");
  });
});
