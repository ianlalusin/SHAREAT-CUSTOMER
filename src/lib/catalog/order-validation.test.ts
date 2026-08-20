import { describe, it, expect } from "vitest";
import {
  buildLineId,
  orderTotal,
  resolveOrderLines,
  MAX_QTY_PER_LINE,
  type ResolvedOrderLine,
} from "@/lib/catalog/order-validation";

/** A snapshot shaped like what POS's rebuildCustomerCatalog writes. */
function snapshot(over: { orderingEnabled?: boolean; items?: any[] } = {}) {
  return {
    orderingEnabled: over.orderingEnabled ?? true,
    categories: [{ name: "Sides", items: over.items ?? [single()] }],
  };
}

const single = (over: Record<string, any> = {}) => ({
  productId: "coke",
  name: "Coke",
  displayName: "Coke",
  subCategory: "Sides",
  kind: "single",
  price: 60,
  orderable: true,
  kitchenLocationId: "kds_bar",
  kitchenLocationName: "Bar",
  ...over,
});

const kimbap = (over: Record<string, any> = {}) => ({
  productId: "grp",
  name: "Kimbap",
  displayName: "Kimbap",
  subCategory: "Sides",
  kind: "group",
  price: 150,
  orderable: true,
  variants: [
    {
      productId: "v_veg",
      variantLabel: "Veggies",
      displayName: "Kimbap (Veggies)",
      price: 150,
      orderable: true,
      kitchenLocationId: "kds_main",
      kitchenLocationName: "Main Kitchen",
    },
    {
      productId: "v_sig",
      variantLabel: "Signature",
      displayName: "Kimbap (Signature)",
      price: 180,
      orderable: true,
      kitchenLocationId: "kds_main",
      kitchenLocationName: "Main Kitchen",
    },
  ],
  ...over,
});

const dipGroup = (over: Record<string, any> = {}) => ({
  id: "og_dip",
  name: "Dip",
  selectionMode: "single",
  required: false,
  values: [
    { id: "cheese", name: "Cheese", priceDelta: 20 },
    { id: "soy", name: "Soy", priceDelta: 0 },
  ],
  ...over,
});

const line = (over: Record<string, any> = {}) => ({ productId: "coke", qty: 1, ...over });

/** Narrows the union so tests can read `.lines` without repeating the guard. */
function ok(result: ReturnType<typeof resolveOrderLines>): ResolvedOrderLine[] {
  if (!result.ok) throw new Error(`expected success, got: ${result.error}`);
  return result.lines;
}

describe("resolveOrderLines — gates", () => {
  it("refuses everything when the store has self-ordering switched off", () => {
    const r = resolveOrderLines(snapshot({ orderingEnabled: false }), [line()]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it("refuses an empty order", () => {
    expect(resolveOrderLines(snapshot(), []).ok).toBe(false);
  });

  it("refuses an item that is on the menu but not orderable from the phone", () => {
    const r = resolveOrderLines(snapshot({ items: [single({ orderable: false })] }), [line()]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ask our staff/i);
  });

  it("refuses an item that has vanished from the menu since the page loaded", () => {
    const r = resolveOrderLines(snapshot(), [line({ productId: "ghost" })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);
  });

  it("refuses an orderable item with no kitchen station, rather than losing the order", () => {
    const r = resolveOrderLines(snapshot({ items: [single({ kitchenLocationId: null })] }), [line()]);
    expect(r.ok).toBe(false);
  });

  it("refuses nonsense quantities", () => {
    expect(resolveOrderLines(snapshot(), [line({ qty: 0 })]).ok).toBe(false);
    expect(resolveOrderLines(snapshot(), [line({ qty: -3 })]).ok).toBe(false);
    expect(resolveOrderLines(snapshot(), [line({ qty: MAX_QTY_PER_LINE + 1 })]).ok).toBe(false);
  });
});

describe("resolveOrderLines — pricing is server-authoritative", () => {
  it("prices from the snapshot and ignores any price the client sends", () => {
    const lines = ok(resolveOrderLines(snapshot(), [line({ qty: 2, unitPrice: 1, price: 1 } as any)]));
    expect(lines[0].unitPrice).toBe(60);
    expect(orderTotal(lines)).toBe(120);
  });

  it("prices a family from the CHOSEN variant, not the family's 'from' price", () => {
    const lines = ok(
      resolveOrderLines(snapshot({ items: [kimbap()] }), [{ productId: "grp", variantId: "v_sig", qty: 1 }])
    );
    expect(lines[0].itemId).toBe("v_sig");
    expect(lines[0].itemName).toBe("Kimbap (Signature)");
    expect(lines[0].unitPrice).toBe(180);
  });

  it("adds modifier deltas to the order total but keeps unitPrice as the base", () => {
    const items = [single({ optionGroups: [dipGroup()] })];
    const lines = ok(
      resolveOrderLines(snapshot({ items }), [
        line({ qty: 2, modifiers: [{ groupId: "og_dip", valueId: "cheese" }] }),
      ])
    );
    expect(lines[0].unitPrice).toBe(60);
    expect(lines[0].modifiersTotal).toBe(20);
    expect(orderTotal(lines)).toBe(160); // (60 + 20) * 2
  });
});

describe("resolveOrderLines — families", () => {
  it("requires a variant choice for a family", () => {
    const r = resolveOrderLines(snapshot({ items: [kimbap()] }), [{ productId: "grp", qty: 1 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/choose a version/i);
  });

  it("refuses a variant that is not part of that family", () => {
    const r = resolveOrderLines(snapshot({ items: [kimbap()] }), [
      { productId: "grp", variantId: "not_mine", qty: 1 },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);
  });

  it("refuses a variant the store has not opened for self-ordering", () => {
    const family = kimbap();
    family.variants[1].orderable = false;
    const r = resolveOrderLines(snapshot({ items: [family] }), [
      { productId: "grp", variantId: "v_sig", qty: 1 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("routes to the variant's own kitchen station", () => {
    const lines = ok(
      resolveOrderLines(snapshot({ items: [kimbap()] }), [{ productId: "grp", variantId: "v_veg", qty: 1 }])
    );
    expect(lines[0].kitchenLocationId).toBe("kds_main");
  });
});

describe("resolveOrderLines — modifiers", () => {
  const items = [single({ optionGroups: [dipGroup()] })];

  it("resolves names and deltas from the catalog, not from the client", () => {
    const lines = ok(
      resolveOrderLines(snapshot({ items }), [
        line({ modifiers: [{ groupId: "og_dip", valueId: "cheese", valueName: "FREE", priceDelta: -999 } as any] }),
      ])
    );
    expect(lines[0].modifiers).toEqual([
      { groupId: "og_dip", groupName: "Dip", valueId: "cheese", valueName: "Cheese", priceDelta: 20 },
    ]);
    expect(lines[0].modifiersText).toBe("Cheese");
  });

  it("refuses an option value that is not offered here", () => {
    const r = resolveOrderLines(snapshot({ items }), [
      line({ modifiers: [{ groupId: "og_dip", valueId: "truffle" }] }),
    ]);
    expect(r.ok).toBe(false);
  });

  it("refuses two picks in a single-select group", () => {
    const r = resolveOrderLines(snapshot({ items }), [
      line({
        modifiers: [
          { groupId: "og_dip", valueId: "cheese" },
          { groupId: "og_dip", valueId: "soy" },
        ],
      }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/only one/i);
  });

  it("allows two picks in a multi-select group", () => {
    const multi = [single({ optionGroups: [dipGroup({ selectionMode: "multi" })] })];
    const lines = ok(
      resolveOrderLines(snapshot({ items: multi }), [
        line({
          modifiers: [
            { groupId: "og_dip", valueId: "cheese" },
            { groupId: "og_dip", valueId: "soy" },
          ],
        }),
      ])
    );
    expect(lines[0].modifiers).toHaveLength(2);
  });

  it("refuses to send an order that skips a required group", () => {
    const required = [single({ optionGroups: [dipGroup({ required: true })] })];
    const r = resolveOrderLines(snapshot({ items: required }), [line()]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/choose dip/i);
  });

  it("leaves modifier fields null when the diner picked none", () => {
    const lines = ok(resolveOrderLines(snapshot({ items }), [line()]));
    expect(lines[0].modifiers).toBeNull();
    expect(lines[0].modifiersText).toBeNull();
    expect(lines[0].modifiersTotal).toBeNull();
  });
});

describe("buildLineId", () => {
  it("matches POS's scheme so a customer order merges with a staff-placed one", () => {
    expect(buildLineId("coke", 60, null)).toBe("addon_coke_60");
  });

  it("separates the same item ordered with different modifiers", () => {
    const cheese = buildLineId("coke", 60, [
      { groupId: "og_dip", groupName: "Dip", valueId: "cheese", valueName: "Cheese", priceDelta: 20 },
    ]);
    const soy = buildLineId("coke", 60, [
      { groupId: "og_dip", groupName: "Dip", valueId: "soy", valueName: "Soy", priceDelta: 0 },
    ]);
    expect(cheese).not.toBe(soy);
  });

  it("is order-independent, so the same picks always land on the same line", () => {
    const a = buildLineId("coke", 60, [
      { groupId: "g", groupName: "G", valueId: "b", valueName: "B", priceDelta: 0 },
      { groupId: "g", groupName: "G", valueId: "a", valueName: "A", priceDelta: 0 },
    ]);
    const b = buildLineId("coke", 60, [
      { groupId: "g", groupName: "G", valueId: "a", valueName: "A", priceDelta: 0 },
      { groupId: "g", groupName: "G", valueId: "b", valueName: "B", priceDelta: 0 },
    ]);
    expect(a).toBe(b);
  });
});
