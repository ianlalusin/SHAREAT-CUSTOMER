"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuth } from "firebase/auth";

/**
 * The table's shared order history.
 *
 * Owned by the dashboard and passed down, so the menu and the history panel
 * read one list: the menu needs it to warn about a repeat order, the panel
 * needs it to show progress, and fetching it twice would let the two disagree.
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
};

/** Still on its way from the kitchen — the states worth warning a diner about. */
export const IN_FLIGHT: ReadonlySet<string> = new Set(["preparing", "partially_served"]);

export function useSessionOrders(enabled: boolean) {
  const [orders, setOrders] = useState<SessionOrder[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const user = getAuth().currentUser;
      if (!user) return;
      const idToken = await user.getIdToken();
      const res = await fetch("/api/customer/session-orders", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load your orders.");
      setOrders(Array.isArray(json.orders) ? json.orders : []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Could not load your orders.");
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    // Poll rather than open a Firestore listener: the client SDK cannot read
    // kitchentickets (rules deny it), so this goes through the API route. 20s is
    // frequent enough to watch an order progress without hammering the route.
    const timer = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(timer);
  }, [enabled, refresh]);

  return { orders, isLoading, error, refresh };
}

/** Quantity of `itemId` the table has in flight right now. */
export function inFlightQty(orders: SessionOrder[], itemId: string): number {
  if (!itemId) return 0;
  return orders
    .filter((o) => o.itemId === itemId && IN_FLIGHT.has(o.status))
    .reduce((sum, o) => sum + Math.max(0, o.qty - o.qtyServed), 0);
}
