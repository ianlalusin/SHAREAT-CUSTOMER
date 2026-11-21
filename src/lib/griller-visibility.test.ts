import { describe, expect, it } from "vitest";
import { canRequestGriller } from "./griller-visibility";

describe("canRequestGriller", () => {
  it("shows at exactly 4 and 8 guests, and from 12 up", () => {
    const shown = Array.from({ length: 16 }, (_, i) => i + 1).filter(canRequestGriller);
    expect(shown).toEqual([4, 8, 12, 13, 14, 15, 16]);
  });
  it("hides for missing or junk counts", () => {
    expect(canRequestGriller(0)).toBe(false);
    expect(canRequestGriller(NaN)).toBe(false);
  });
});
