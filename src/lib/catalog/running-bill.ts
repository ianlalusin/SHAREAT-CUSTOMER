/**
 * The diner's running bill — what has actually landed on their tab so far.
 *
 * ## Why this is deliberately only PART of the total
 *
 * POS owns the authoritative total (`POS/src/lib/tax.ts` → `calculateBillTotals`),
 * which layers VAT handling, bill-wide discounts, loyalty redemptions, service
 * charges and custom adjustments on top of the lines. Reimplementing all of
 * that here would guarantee drift: two copies of tax and discount logic in two
 * separately-deployed apps eventually disagree, and a number on the diner's
 * phone that contradicts the cashier's screen is worse than no number.
 *
 * So this computes only the part that is unambiguous — the line subtotal, using
 * the same per-line rule POS uses:
 *
 *     billableQty = qtyOrdered − voidedQty − freeQty
 *     unitPrice   = unitPrice + modifiersTotal
 *
 * ...plus line-level discounts and charges, which are attached to the line
 * itself. Anything applied to the whole bill is reported as `hasBillAdjustments`
 * so the UI can say the final figure is settled at the counter, instead of
 * quietly showing a number that is about to change.
 */

export type RunningBill = {
  /** Line subtotal after line-level discounts/charges. Never negative. */
  runningTotal: number;
  /** How many billable lines it covers, so the UI can hide an empty bill. */
  lineCount: number;
  /**
   * True when the session carries a bill-wide discount, a loyalty redemption or
   * a custom adjustment — i.e. the final total is NOT just `runningTotal`.
   */
  hasBillAdjustments: boolean;
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Sums one line the way POS does, including its own adjustments.
 *
 * Line adjustments are applied in creation order and consume quantity, matching
 * `calculateBillTotals` — a discount for 1 of 3 covers one unit, not all three.
 */
function lineSubtotal(line: any): number {
  const qtyOrdered = num(line?.qtyOrdered);
  const voided = num(line?.voidedQty);
  const free = num(line?.freeQty);

  const billableQty = qtyOrdered - voided - free;
  if (billableQty <= 0) return 0;

  const unitPrice = Math.max(0, num(line?.unitPrice)) + num(line?.modifiersTotal);
  let total = billableQty * unitPrice;

  const adjustments = Object.values(line?.lineAdjustments ?? {}) as any[];
  adjustments.sort((a, b) => num(a?.createdAtClientMs) - num(b?.createdAtClientMs));

  let remaining = billableQty;
  for (const adj of adjustments) {
    const qty = Math.min(num(adj?.qty), adj?.kind === "discount" ? remaining : billableQty);
    if (qty <= 0) continue;

    if (adj.kind === "discount") {
      total -= adj.type === "percent"
        ? qty * unitPrice * (num(adj.value) / 100)
        : Math.min(unitPrice, num(adj.value)) * qty;
      remaining -= qty;
    } else if (adj.kind === "charge") {
      total += num(adj.value) * qty;
    }
  }

  return Math.max(0, total);
}

export function computeRunningBill(billLines: any[], session: any): RunningBill {
  let runningTotal = 0;
  let lineCount = 0;

  for (const line of billLines ?? []) {
    const subtotal = lineSubtotal(line);
    if (subtotal <= 0) continue;
    runningTotal += subtotal;
    lineCount += 1;
  }

  const loyalty = session?.loyaltyRedemptions;
  const adjustments = session?.customAdjustments;
  const hasBillAdjustments =
    !!session?.billDiscount ||
    (Array.isArray(adjustments) && adjustments.length > 0) ||
    (Array.isArray(loyalty) && loyalty.length > 0);

  return { runningTotal: round(runningTotal), lineCount, hasBillAdjustments };
}
