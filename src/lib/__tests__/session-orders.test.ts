import { describe, it, expect } from "vitest";
import { hasPendingFirstServing, inFlightQty, type SessionOrder } from "@/lib/session-orders";

const order = (over: Partial<SessionOrder> = {}): SessionOrder => ({
  id: "t1",
  itemId: "unli-set-a",
  itemName: "Unli Set A",
  qty: 1,
  qtyServed: 0,
  status: "preparing",
  type: "package",
  createdAtMs: 1_700_000_000_000,
  note: null,
  detail: null,
  orderedBySlot: null,
  orderedByMe: false,
  lineTotal: null,
  billed: false,
  ...over,
});

describe("hasPendingFirstServing", () => {
  it("is true while the cashier's opening order sits in the kitchen", () => {
    expect(hasPendingFirstServing([order()])).toBe(true);
  });

  it("stays true on a partial serve — the rest has not arrived", () => {
    expect(hasPendingFirstServing([order({ status: "partially_served", qtyServed: 1 })])).toBe(true);
  });

  it("is false once the opening order is served", () => {
    expect(hasPendingFirstServing([order({ status: "served", qtyServed: 1 })])).toBe(false);
  });

  it("is false when the opening order was cancelled", () => {
    // Nothing is coming, so there is nothing to wait for.
    expect(hasPendingFirstServing([order({ status: "cancelled" })])).toBe(false);
  });

  it("ignores add-ons the table ordered themselves", () => {
    // Waiting on a side the table chose must not gate refills — only the
    // cashier's opening package does.
    expect(hasPendingFirstServing([order({ type: "addon" })])).toBe(false);
  });

  it("is false for a table with no package ticket at all", () => {
    // A store not using package tickets must never be locked out of refills.
    expect(hasPendingFirstServing([])).toBe(false);
    expect(hasPendingFirstServing([order({ type: "addon", status: "served" })])).toBe(false);
  });

  it("is true if ANY package ticket is still out, even beside a served one", () => {
    expect(
      hasPendingFirstServing([
        order({ id: "a", status: "served", qtyServed: 1 }),
        order({ id: "b", status: "preparing" }),
      ])
    ).toBe(true);
  });
});

describe("inFlightQty", () => {
  it("counts only the unserved remainder of matching items", () => {
    const orders = [
      order({ itemId: "kimbap", type: "addon", qty: 3, qtyServed: 1 }),
      order({ id: "b", itemId: "kimbap", type: "addon", qty: 2, status: "served", qtyServed: 2 }),
    ];
    expect(inFlightQty(orders, "kimbap")).toBe(2);
  });

  it("is zero for an unknown or empty sku", () => {
    expect(inFlightQty([order()], "nope")).toBe(0);
    expect(inFlightQty([order()], "")).toBe(0);
  });
});
