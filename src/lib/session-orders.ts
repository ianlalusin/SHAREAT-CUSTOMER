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
 * How long an unserved opening order may keep refills gated.
 *
 * THE SAFETY VALVE, and the reason it is generous. Without it a package ticket
 * nobody ever closes would block refills for the entire meal, with no recourse
 * but staff intervention. The two failures are not symmetric: letting a diner
 * order refills early is what the app did until now and costs little, whereas
 * refusing a paying diner their refills is the bad outcome. So the gate gives
 * up rather than holding anyone hostage.
 *
 * 20 minutes is well past a normal first serving without firing during an
 * ordinary rush. Tune here — client and server both read this one constant, and
 * they must not disagree or the UI would refuse what the API would allow.
 */
export const FIRST_SERVING_BLOCK_MAX_MS = 20 * 60 * 1000;

/**
 * Is the cashier's opening order still with the kitchen?
 *
 * `package` is the check-in ticket POS writes for the unli set itself, so this
 * asks about the table's FIRST serving, not anything ordered from a phone.
 * Refills are excluded from `orders` server-side, so one still cooking can
 * never be mistaken for the initial order.
 *
 * Every uncertain case answers false, because this gates a courtesy message
 * about waiting for your food rather than anything that needs protecting: a
 * cancelled opening order (nothing is coming), a store that writes no package
 * ticket, a ticket with no usable timestamp (it could never age out), and
 * anything past FIRST_SERVING_BLOCK_MAX_MS.
 */
export function hasPendingFirstServing(
  orders: SessionOrder[],
  nowMs: number = Date.now()
): boolean {
  return orders.some((o) => {
    if (o.type !== "package" || !IN_FLIGHT.has(o.status)) return false;
    const createdAtMs = Number(o.createdAtMs);
    if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return false;
    return nowMs - createdAtMs < FIRST_SERVING_BLOCK_MAX_MS;
  });
}
