import { describe, it, expect } from "vitest";
import {
  FIRST_SERVING_BLOCK_MAX_MS,
  hasPendingFirstServing,
  inFlightQty,
  type SessionOrder,
} from "@/lib/session-orders";

const T0 = 1_700_000_000_000;

const order = (over: Partial<SessionOrder> = {}): SessionOrder => ({
  id: "t1",
  itemId: "unli-set-a",
  itemName: "Unli Set A",
  qty: 1,
  qtyServed: 0,
  status: "preparing",
  type: "package",
  createdAtMs: T0,
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
    expect(hasPendingFirstServing([order()], T0)).toBe(true);
  });

  it("stays true on a partial serve — the rest has not arrived", () => {
    expect(hasPendingFirstServing([order({ status: "partially_served", qtyServed: 1 })], T0)).toBe(true);
  });

  it("is false once the opening order is served", () => {
    expect(hasPendingFirstServing([order({ status: "served", qtyServed: 1 })], T0)).toBe(false);
  });

  it("is false when the opening order was cancelled", () => {
    // Nothing is coming, so there is nothing to wait for.
    expect(hasPendingFirstServing([order({ status: "cancelled" })], T0)).toBe(false);
  });

  it("ignores add-ons the table ordered themselves", () => {
    // Waiting on a side the table chose must not gate refills — only the
    // cashier's opening package does.
    expect(hasPendingFirstServing([order({ type: "addon" })], T0)).toBe(false);
  });

  it("is false for a table with no package ticket at all", () => {
    // A store not using package tickets must never be locked out of refills.
    expect(hasPendingFirstServing([], T0)).toBe(false);
    expect(hasPendingFirstServing([order({ type: "addon", status: "served" })], T0)).toBe(false);
  });

  it("is true if ANY package ticket is still out, even beside a served one", () => {
    expect(
      hasPendingFirstServing(
        [order({ id: "a", status: "served", qtyServed: 1 }), order({ id: "b", status: "preparing" })],
        T0
      )
    ).toBe(true);
  });

  it("releases the diner once the valve expires — a ticket the kitchen lost", () => {
    // Without this a package ticket nobody ever closes would block refills for
    // the whole meal. Blocking a paying diner is worse than letting them order
    // early, so the gate gives up rather than holding them hostage.
    expect(hasPendingFirstServing([order()], T0 + FIRST_SERVING_BLOCK_MAX_MS - 1)).toBe(true);
    expect(hasPendingFirstServing([order()], T0 + FIRST_SERVING_BLOCK_MAX_MS)).toBe(false);
    expect(hasPendingFirstServing([order()], T0 + 3 * 60 * 60 * 1000)).toBe(false);
  });

  it("never blocks on a ticket with no usable timestamp", () => {
    // Cannot be aged out, so it could never expire. Fail open.
    expect(hasPendingFirstServing([order({ createdAtMs: 0 })], T0)).toBe(false);
    expect(hasPendingFirstServing([order({ createdAtMs: NaN })], T0)).toBe(false);
  });

  it("defaults to now when no clock is passed", () => {
    expect(hasPendingFirstServing([order({ createdAtMs: Date.now() })])).toBe(true);
    expect(hasPendingFirstServing([order({ createdAtMs: 1 })])).toBe(false);
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
