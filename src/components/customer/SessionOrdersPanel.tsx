"use client";

import { CheckCircle2, ChefHat, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionOrder } from "@/hooks/use-session-orders";

/**
 * What this TABLE has ordered, on every phone at it.
 *
 * Shared rather than per-phone on purpose: seeing that seat 2 already sent the
 * Kimbap is what stops seat 3 sending it again.
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

export function SessionOrdersPanel({
  orders,
  isLoading,
  error,
}: {
  orders: SessionOrder[];
  isLoading: boolean;
  error: string | null;
}) {
  if (isLoading) {
    return (
      <section className="mt-8">
        <h2 className="text-lg sm:text-xl font-black text-zinc-900 mb-3">Your table&apos;s orders</h2>
        <div className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-8">
        <h2 className="text-lg sm:text-xl font-black text-zinc-900 mb-3">Your table&apos;s orders</h2>
        <p className="text-sm text-destructive">{error}</p>
      </section>
    );
  }

  if (orders.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="flex items-end justify-between gap-4 mb-3">
        <h2 className="text-lg sm:text-xl font-black text-zinc-900">Your table&apos;s orders</h2>
        <p className="text-xs sm:text-sm text-zinc-500">Everyone at this table</p>
      </div>

      <ul className="space-y-2">
        {orders.map((order) => {
          const status = STATUS[order.status] ?? STATUS.preparing;
          const who = whoOrdered(order);
          return (
            <li key={order.id} className="flex items-start gap-3 rounded-2xl border bg-white p-3 shadow-sm">
              <div className="min-w-0 flex-1">
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
                    {order.status === "partially_served" ? ` (${order.qtyServed}/${order.qty})` : null}
                  </span>
                  {who ? <span className="text-[11px] text-zinc-500">{who}</span> : null}
                </div>
              </div>

              {order.lineTotal != null ? (
                <div className="shrink-0 text-sm font-black">{peso(order.lineTotal)}</div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-xs text-muted-foreground">
        Items are added to your bill once the kitchen serves them.
      </p>
    </section>
  );
}
