import { describe, it, expect } from "vitest";
import { fitCaption, wrapToWidth, type Measure } from "./caption";

/** Every character is 0.6 em wide — close enough to bold Arial for layout logic. */
const measure: Measure = (text, px) => text.length * px * 0.6;
const SIZES = [60, 54, 48, 42, 36];

describe("fitCaption", () => {
  it("keeps a short caption on one line at full size", () => {
    expect(fitCaption(measure, "I spotted Boo at SharEat!", 1100, SIZES)).toEqual({
      px: 60,
      lines: ["I spotted Boo at SharEat!"],
    });
  });

  it("never lets the prize run off the edge (the reported bug)", () => {
    const text = "I caught Coca-Boo and won 1 serving Enoki Rolls!";
    const r = fitCaption(measure, text, 900, SIZES);
    for (const line of r.lines) expect(measure(line, r.px)).toBeLessThanOrEqual(900);
    expect(r.lines.join(" ")).toBe(text);
  });

  it("wraps to two lines before shrinking below the smallest size", () => {
    const text = "I caught Melona Multo and won 2 Melona ice cream for my table!";
    const r = fitCaption(measure, text, 700, SIZES);
    expect(r.lines).toHaveLength(2);
    expect(r.lines.join(" ")).toBe(text);
  });

  it("cuts with an ellipsis only when even two small lines cannot hold it", () => {
    const r = fitCaption(measure, "word ".repeat(80).trim(), 400, SIZES);
    expect(r.px).toBe(36);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[1].endsWith("…")).toBe(true);
    for (const line of r.lines) expect(measure(line, r.px)).toBeLessThanOrEqual(400);
  });
});

describe("wrapToWidth", () => {
  it("refuses a single word wider than the line", () => {
    expect(wrapToWidth(measure, "Supercalifragilistic", 60, 100, 2)).toBeNull();
  });
});
