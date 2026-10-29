import { describe, it, expect } from "vitest";
import { validateRefillLine, MAX_SIDE_QTY } from "@/lib/refill-validate";
import type { RefillOptionsMenu } from "@/lib/server/refill-options-cache";

const sr = (refillId: string, refillName: string, station: string, extra: Partial<RefillOptionsMenu["storeRefills"][0]> = {}) => ({
  id: refillId,
  refillId,
  refillName,
  isOther: false,
  kitchenLocationId: station,
  kitchenLocationName: station === "grill" ? "Grill" : "Cold Bar",
  isEnabled: true,
  sortOrder: 0,
  ...extra,
});

const menu: RefillOptionsMenu = {
  storeRefills: [
    sr("pork", "Pork Belly", "grill"),
    sr("beef", "Beef", "grill"),
    sr("rice", "Rice", "cold", { isOther: true }),
    sr("lettuce", "Lettuce", "cold", { isOther: true }),
    sr("off", "Disabled Item", "grill", { isEnabled: false }),
  ],
  refills: [{ id: "pork", isActive: true, requiresFlavor: true, allowedFlavorIds: ["garlic"] }],
  storeFlavors: [
    { id: "garlic", flavorId: "garlic", flavorName: "Garlic", isEnabled: true },
    { id: "spicy", flavorId: "spicy", flavorName: "Spicy", isEnabled: true },
  ],
};

/** Exactly what CustomerRefillModal sends for a meat. */
const meat = (over: Record<string, unknown> = {}) => ({
  itemId: "pork",
  itemName: "Pork Belly",
  refillId: "pork",
  refillName: "Pork Belly",
  kitchenLocationId: "grill",
  kitchenLocationName: "Grill",
  qty: 1,
  notes: "",
  flavorIds: ["garlic"],
  ...over,
});

/** Exactly what CustomerRefillModal sends for "Other Refills". */
const sides = (request: Record<string, unknown>, ids: string[], station = "cold") => ({
  itemId: "OTHER_REFILLS",
  itemName: "OTHER REFILLS",
  refillId: "OTHER_REFILLS",
  refillName: "OTHER REFILLS",
  kitchenLocationId: station,
  kitchenLocationName: "Cold Bar",
  qty: 1,
  notes: "",
  refillRequest: request,
  refillIds: ids,
});

describe("validateRefillLine — real orders still go through", () => {
  it("accepts a meat with an allowed flavor, naming it from the menu", () => {
    const r = validateRefillLine(meat({ itemName: "anything" }), menu);
    expect(r).toMatchObject({ ok: true, line: { itemId: "pork", itemName: "Pork Belly", kitchenLocationId: "grill", qty: 1 } });
  });

  it("accepts a meat with no flavor", () => {
    expect(validateRefillLine(meat({ itemId: "beef", flavorIds: [] }), menu).ok).toBe(true);
  });

  it("accepts a sides bundle and rebuilds its request from the menu", () => {
    const r = validateRefillLine(sides({ Rice: 3, Lettuce: 1 }, ["rice", "lettuce"]), menu);
    expect(r).toMatchObject({ ok: true, line: { refillRequest: { Rice: 3, Lettuce: 1 }, cooldownIds: ["rice", "lettuce"] } });
  });

  it("allows a big table's side order up to the cap", () => {
    expect(validateRefillLine(sides({ Rice: MAX_SIDE_QTY }, ["rice"]), menu).ok).toBe(true);
    expect(validateRefillLine(sides({ Rice: MAX_SIDE_QTY + 1 }, ["rice"]), menu).ok).toBe(false);
  });
});

describe("validateRefillLine — audit: invented or bent orders are refused", () => {
  it("refuses an item the branch does not offer", () => {
    expect(validateRefillLine(meat({ itemId: "invented", itemName: "Invented free item" }), menu).ok).toBe(false);
    expect(validateRefillLine(meat({ itemId: "off" }), menu).ok).toBe(false);
  });

  it("refuses negative, zero, fractional and huge quantities", () => {
    for (const qty of [-5, 0, 1.5, 99, "abc"]) expect(validateRefillLine(meat({ qty }), menu).ok).toBe(false);
  });

  it("ignores a made-up station and uses the menu's", () => {
    const r = validateRefillLine(meat({ kitchenLocationId: "invented-station" }), menu);
    expect(r).toMatchObject({ ok: true, line: { kitchenLocationId: "grill" } });
  });

  it("refuses a flavor that is not allowed for that meat", () => {
    expect(validateRefillLine(meat({ flavorIds: ["spicy"] }), menu).ok).toBe(false);
    expect(validateRefillLine(meat({ flavorIds: ["garlic", "spicy"] }), menu).ok).toBe(false);
  });

  it("refuses a sides bundle with an invented side, a meat sneaked in, or the wrong station", () => {
    expect(validateRefillLine(sides({ Rice: 1, Wagyu: 5 }, ["rice"]), menu).ok).toBe(false);
    expect(validateRefillLine(sides({ Rice: 1 }, ["rice", "invented"]), menu).ok).toBe(false);
    expect(validateRefillLine(sides({ "Pork Belly": 1 }, ["pork"]), menu).ok).toBe(false);
    expect(validateRefillLine(sides({ Rice: 1 }, ["rice"], "grill"), menu).ok).toBe(false);
    expect(validateRefillLine(sides({ Rice: -2 }, ["rice"]), menu).ok).toBe(false);
  });
});
