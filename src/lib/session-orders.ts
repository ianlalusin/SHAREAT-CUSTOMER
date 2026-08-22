/**
 * Pure reads over the table's shared order history.
 *
 * Lives here rather than beside the hook so it is covered by the test runner,
 * which collects `src/lib/**` only. `use-session-orders.ts` re-exports all of
 * it, so components keep importing from the hook.
 */

export type SessionOrder = {
  id: string;
  itemId: string;
  itemName: string;
  qty: number;
  qtyServed: number;
  status: "preparing" | "partially_served" | "served" | "cancelled";
  type: string;
  createdAtMs: number;
  note: string | null;
  detail: string | null;
  orderedBySlot: number | null;
  orderedByMe: boolean;
  lineTotal: number | null;
  /** True once `lineTotal` is on the bill rather than an expectation. */
  billed: boolean;
};

/** The line subtotal on the tab so far — see lib/catalog/running-bill.ts. */
export type RunningBill = {
  runningTotal: number;
  lineCount: number;
  hasBillAdjustments: boolean;
};

/** Still on its way from the kitchen — the states worth warning a diner about. */
export const IN_FLIGHT: ReadonlySet<string> = new Set(["preparing", "partially_served"]);

/** Quantity of `itemId` the table has in flight right now. */
export function inFlightQty(orders: SessionOrder[], itemId: string): number {
  if (!itemId) return 0;
  return orders
    .filter((o) => o.itemId === itemId && IN_FLIGHT.has(o.status))
    .reduce((sum, o) => sum + Math.max(0, o.qty - o.qtyServed), 0);
}

/**
 * Is the cashier's opening order still with the kitchen?
 *
 * `package` is the check-in ticket POS writes for the unli set itself, so this
 * asks about the table's FIRST serving, not anything ordered from a phone.
 * Refills are excluded from `orders` server-side, so one still cooking can
 * never be mistaken for the initial order.
 *
 * A cancelled opening order reads as false: nothing is coming, so there is
 * nothing to wait for. A store that writes no package ticket has none either,
 * and the answer is false — fail-open is right, because this gates a courtesy
 * message about waiting for your food, not anything that needs protecting.
 */
export function hasPendingFirstServing(orders: SessionOrder[]): boolean {
  return orders.some((o) => o.type === "package" && IN_FLIGHT.has(o.status));
}
