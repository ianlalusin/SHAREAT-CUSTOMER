"use client";

import { createContext, useContext } from "react";

import type { StaffStore } from "./useStaffSession";

/**
 * The branch every manager screen is looking at, resolved once by the shell.
 *
 * Each screen reads `storeId` from here rather than re-running the sign-in →
 * my-stores → localStorage dance for itself. That duplication is what let three
 * admin pages drift apart, and it is also how a screen ends up rendering a
 * store the caller was never assigned to.
 */
export type StoreScope = {
  storeId: string;
  storeName: string;
  stores: StaffStore[];
  setStoreId: (id: string) => void;
  role: string;
  isPlatformAdmin: boolean;
};

const Ctx = createContext<StoreScope | null>(null);

export const StoreScopeProvider = Ctx.Provider;

/** Throws outside the shell, which is the point — a screen with no scope has
 *  no business guessing one. */
export function useStoreScope(): StoreScope {
  const scope = useContext(Ctx);
  if (!scope) throw new Error("useStoreScope must be used inside the manager shell.");
  return scope;
}
