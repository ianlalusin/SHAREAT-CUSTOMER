import { describe, expect, it } from "vitest";
import { LAYOUTS, captionLine, coverCrop, outerSize } from "./layouts";

const inside = (a: { x: number; y: number; w: number; h: number }, W: number, H: number) =>
  a.x >= 0 && a.y >= 0 && a.x + a.w <= W && a.y + a.h <= H;

describe("capture-share layouts", () => {
  it("every slot and footer fits inside its card, one slot per shot", () => {
    for (const l of LAYOUTS) {
      expect(l.slots.length, l.id).toBe(l.shots);
      for (const s of l.slots) expect(inside(s, l.w, l.h), l.id).toBe(true);
      expect(inside(l.footer, l.w, l.h), l.id).toBe(true);
    }
  });

  it("footer never overlaps a photo", () => {
    for (const l of LAYOUTS) {
      const lowest = Math.max(...l.slots.map((s) => s.y + s.h));
      expect(l.footer.y, l.id).toBeGreaterThanOrEqual(lowest);
    }
  });

  it("57/58mm paper drops only the 2-photo and 2x2 layouts", () => {
    expect(LAYOUTS.filter((l) => !l.paper58).map((l) => l.id).sort()).toEqual(["duo", "grid"]);
  });

  it("tilted card backdrop is larger than the card", () => {
    const t = LAYOUTS.find((l) => l.tiltDeg)!;
    const o = outerSize(t);
    expect(o.w).toBeGreaterThan(t.w);
    expect(o.h).toBeGreaterThan(t.h);
  });

  it("coverCrop keeps aspect and centres", () => {
    const c = coverCrop(1280, 720, { w: 100, h: 100 });
    expect(c.sw).toBeCloseTo(720);
    expect(c.sh).toBeCloseTo(720);
    expect(c.sx).toBeCloseTo(280);
    expect(c.sy).toBeCloseTo(0);
  });

  it("caption uses the store name", () => {
    expect(captionLine("SharEat Davao")).toBe("We sharelebrated at SharEat Davao");
    expect(captionLine("  ")).toBe("We sharelebrated at SharEat");
  });
});
