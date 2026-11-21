import { describe, expect, it } from "vitest";
import { LAYOUTS, TEMPLATES, captionLine, coverCrop, defaultFields, footerBox, keepClear, outerSize, rotatedExtents } from "./layouts";

const inside = (a: { x: number; y: number; w: number; h: number }, W: number, H: number) =>
  a.x >= 0 && a.y >= 0 && a.x + a.w <= W && a.y + a.h <= H;

describe("capture-share layouts", () => {
  it("every slot and footer fits inside its card, one slot per shot", () => {
    for (const l of [...LAYOUTS, ...TEMPLATES]) {
      expect(l.slots.length, l.id).toBe(l.shots);
      for (const s of l.slots) expect(inside(s, l.w, l.h), l.id).toBe(true);
      expect(inside(l.footer, l.w, l.h), l.id).toBe(true);
    }
  });

  it("footer never overlaps a photo", () => {
    for (const l of [...LAYOUTS, ...TEMPLATES]) {
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

const ALL = LAYOUTS;

describe("stickers stay off the logo + caption", () => {
  const instax = ALL.find((l) => l.id === "instax")!;
  const canvas = { w: instax.w, h: instax.h };
  const block = footerBox(instax);

  it("a sticker dropped on the caption is pushed up above it", () => {
    const p = keepClear(540, 1150, 60, 60, canvas, block);
    expect(p.y + 60).toBeLessThanOrEqual(block.y);
    expect(p.x).toBe(540);
  });

  it("a sticker clear of the caption does not move", () => {
    expect(keepClear(400, 400, 60, 60, canvas, block)).toEqual({ x: 400, y: 400 });
  });

  it("stays inside the canvas", () => {
    const p = keepClear(-50, -50, 60, 60, canvas, block);
    expect(p).toEqual({ x: 60, y: 60 });
  });

  it("tilted card's caption box covers the rotated strip", () => {
    const t = ALL.find((l) => l.tiltDeg)!;
    const b = footerBox(t, 0);
    expect(b.w).toBeGreaterThan(t.footer.w);
    expect(b.h).toBeGreaterThan(t.footer.h);
  });

  it("rotated extents grow to the box around the turned sticker", () => {
    const e = rotatedExtents(100, 20, Math.PI / 2);
    expect(e.ex).toBeCloseTo(20);
    expect(e.ey).toBeCloseTo(100);
  });
});

describe("templates", () => {
  it("are one photo each, with capped editable fields", () => {
    for (const t of TEMPLATES) {
      expect(t.shots).toBe(1);
      for (const f of t.fields ?? []) expect(f.defaultValue.replace("{name}", "").length).toBeLessThanOrEqual(f.maxLength);
    }
  });
  it("fills the guest's name into the ID card and caps it", () => {
    const id = TEMPLATES.find((t) => t.id === "idcard")!;
    expect(defaultFields(id, "Shaira").name).toBe("Shaira");
    expect(defaultFields(id, "").name).toBe("Your Name");
    expect(defaultFields(id, "A".repeat(40)).name.length).toBe(24);
  });
});

import { airportCode } from "./templates";

describe("boarding pass airport code", () => {
  it("takes the first letter then consonants", () => {
    expect(airportCode("Busog City")).toBe("BSG");
    expect(airportCode("Gutom")).toBe("GTM");
    expect(airportCode("Ua")).toBe("UAX");
    expect(airportCode("")).toBe("BSG");
  });
});

import { printTone } from "./layouts";

describe("printTone (lighter photos on the thermal print)", () => {
  it("keeps white white and lifts black off solid", () => {
    expect(printTone(255)).toBe(255);
    expect(printTone(0)).toBeGreaterThan(25);
  });
  it("brightens mid-tones and never darkens or reorders a tone", () => {
    expect(printTone(128)).toBeGreaterThan(150);
    for (let v = 0; v < 255; v++) {
      expect(printTone(v)).toBeGreaterThanOrEqual(v);
      expect(printTone(v + 1)).toBeGreaterThanOrEqual(printTone(v));
    }
  });
});
