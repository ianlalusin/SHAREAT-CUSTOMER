"use client";

import { CheckCircle2, ChefHat, Loader2, ReceiptText, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RunningBill, SessionOrder } from "@/hooks/use-session-orders";
import { CardCornerDecor } from "@/components/christmas/CardCornerDecor";

/**
 * What this TABLE has ordered, on every phone at it, plus the running bill.
 *
 * Shared rather than per-phone on purpose: seeing that seat 2 already sent the
 * Kimbap is what stops seat 3 sending it again.
 *
 * Refills are not listed here — they are included in the package and a table
 * gets through many, so they would bury the items the diner actually chose.
 */

function peso(n: number) {
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n || 0);
  } catch {
    return `₱${Number(n || 0)}`;
  }
}

const STATUS: Record<string, { label: string; className: string; Icon: typeof ChefHat }> = {
  preparing: { label: "Preparing", className: "bg-amber-100 text-amber-900", Icon: ChefHat },
  partially_served: { label: "Partly served", className: "bg-sky-100 text-sky-900", Icon: ChefHat },
  served: { label: "Served", className: "bg-emerald-100 text-emerald-900", Icon: CheckCircle2 },
  cancelled: { label: "Cancelled", className: "bg-zinc-200 text-zinc-600", Icon: XCircle },
};

function whoOrdered(order: SessionOrder): string | null {
  if (order.orderedByMe) return "You";
  if (order.orderedBySlot != null) return `Seat ${order.orderedBySlot}`;
  return null;
}

/**
 * How much of an order arrived, when that differs from what was ordered — a
 * 2-ordered / 1-served line is the case where the price shown would otherwise
 * look wrong.
 */
function servedNote(order: SessionOrder): string | null {
  if (order.status === "partially_served") return `${order.qtyServed} of ${order.qty} served`;
  if (order.status === "served" && order.qtyServed > 0 && order.qtyServed < order.qty) {
    return `${order.qtyServed} of ${order.qty} served · rest cancelled`;
  }
  return null;
}

/**
 * The running bill, deliberately understated.
 *
 * The amount is kept small and the caveat large: this figure is the line
 * subtotal only (see lib/catalog/running-bill.ts), so a diner who reads it as
 * their final total would be misled. Making the number the loudest thing on the
 * card would invite exactly that.
 */
function RunningBillCard({ bill }: { bill: RunningBill }) {
  return (
    <div className="mb-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
          <ReceiptText className="h-3.5 w-3.5" />
          Running total so far
        </span>
        <span className="text-base font-bold text-amber-950">{peso(bill.runningTotal)}</span>
      </div>
      <p className="mt-2 text-sm font-bold leading-snug text-amber-950">
        This is an estimate, not your final bill. Please confirm with our cashier before paying.
      </p>
    </div>
  );
}

export function SessionOrdersPanel({
  orders,
  bill,
  isLoading,
  error,
}: {
  orders: SessionOrder[];
  bill: RunningBill | null;
  isLoading: boolean;
  error: string | null;
}) {
  const heading = <h2 className="text-lg sm:text-xl font-black text-zinc-900">Your table&apos;s orders</h2>;

  if (isLoading) {
    return (
      <section className="mt-8">
        {heading}
        <div className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-8">
        {heading}
        <p className="mt-3 text-sm text-destructive">{error}</p>
      </section>
    );
  }

  const hasBill = !!bill && bill.lineCount > 0;
  if (orders.length === 0 && !hasBill) return null;

  return (
    <section className="mt-8">
      <div className="flex items-end justify-between gap-4 mb-3">
        {heading}
        <p className="text-xs sm:text-sm text-zinc-500">Everyone at this table</p>
      </div>

      {hasBill ? <RunningBillCard bill={bill!} /> : null}

      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing ordered from the menu yet.</p>
      ) : (
        <ul className="space-y-2">
          {orders.map((order) => {
            const status = STATUS[order.status] ?? STATUS.preparing;
            const who = whoOrdered(order);
            const served = servedNote(order);
            return (
              <li key={order.id} className="relative overflow-hidden flex items-start gap-3 rounded-2xl border bg-white p-3 shadow-sm">
                <CardCornerDecor
                  seed={order.itemName + order.id}
                  className="pointer-events-none absolute -right-2 -bottom-2 h-11 w-11 opacity-30"
                />
                <div className="relative min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold">{order.qty}×</span>
                    <span className="text-sm font-semibold leading-tight">{order.itemName}</span>
                  </div>
                  {order.detail ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">{order.detail}</div>
                  ) : null}
                  {order.note ? (
                    <div className="mt-0.5 text-xs italic text-muted-foreground">&ldquo;{order.note}&rdquo;</div>
                  ) : null}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
                        status.className
                      )}
                    >
                      <status.Icon className="h-3 w-3" />
                      {status.label}
                    </span>
                    {served ? <span className="text-[11px] text-zinc-500">{served}</span> : null}
                    {who ? <span className="text-[11px] text-zinc-500">{who}</span> : null}
                  </div>
                </div>

                {order.lineTotal != null ? (
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-black">{peso(order.lineTotal)}</div>
                    {!order.billed && order.status !== "cancelled" ? (
                      <div className="text-[10px] text-muted-foreground">when served</div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        Items are added to your bill once the kitchen serves them.
      </p>
    </section>
  );
}
