/**
 * Who may do what, as pure functions.
 *
 * No firebase import, so every decision below is unit-testable without a
 * database — which matters here more than anywhere else in this app, because
 * these are the rules that decide whether one branch can reach another's data.
 *
 * The semantics are POS's, deliberately: `POS/src/lib/server/staff-access.ts`
 * and the live Firestore rules (`hasStoreAccess()`) both read the SAME
 * `staff/{uid}` document and both refuse a non-admin whose `assignedStoreIds`
 * does not contain the store. Anything looser here would be a UI promising what
 * the database then refuses.
 */

export type StaffRole = "admin" | "manager" | "cashier" | "kitchen" | "server";

export type StaffCaller = {
  uid: string;
  /** From `staff/{uid}.role`. Empty string when the doc carries none. */
  role: string;
  assignedStoreIds: string[];
  /**
   * Sees every store. The claim alone is enough — it is the break-glass path
   * and needs no staff document, which is how a platform admin reaches a store
   * they were never assigned to.
   */
  isPlatformAdmin: boolean;
};

export type AccessRefusal = { ok: false; error: string; status: number };
export type AccessGranted = { ok: true; caller: StaffCaller };
export type AccessResult = AccessGranted | AccessRefusal;

export const NOT_STAFF: AccessRefusal = { ok: false, error: "Not allowed.", status: 403 };

/** Roles allowed to work a single branch through the manager surface. */
export const MANAGER_ROLES: StaffRole[] = ["manager", "admin"];

export type TokenClaims = {
  uid?: unknown;
  customer?: unknown;
  loyaltyCustomer?: unknown;
  platformAdmin?: unknown;
};

export type StaffDoc = {
  role?: unknown;
  status?: unknown;
  assignedStoreIds?: unknown;
} | null;

/**
 * Turn a verified token plus a staff document into a caller, or refuse.
 *
 * Replaces five hand-copied variants that disagreed with one another. For a
 * staff record with an EMPTY `assignedStoreIds` they variously allowed every
 * store, denied every store, or returned none — so the answer to "may this
 * person act here" depended on which endpoint they happened to hit.
 *
 * Here an empty list means exactly what it says: no stores. That is a
 * tightening, and a safe one — the live rules already refused those reads, so
 * it removes an ability that never actually worked.
 */
export function judgeCaller(claims: TokenClaims, staff: StaffDoc): AccessResult {
  const uid = String(claims?.uid || "");
  if (!uid) return { ok: false, error: "Invalid token.", status: 401 };

  // A diner's token must never reach a staff route, whatever else it carries.
  if (claims?.customer === true || claims?.loyaltyCustomer === true) return NOT_STAFF;

  const role = String(staff?.role || "");
  const isActive = !!staff && String(staff.status || "") === "active";

  // Mirrors the live rules' isAdmin(): the claim, OR an active staff doc whose
  // role is admin. A role of "admin" on a DEACTIVATED doc grants nothing.
  const isPlatformAdmin = claims?.platformAdmin === true || (isActive && role === "admin");

  if (!isPlatformAdmin && !isActive) return NOT_STAFF;

  // Coerce BEFORE stringifying, not after: String(null) is "null", a perfectly
  // truthy string that survives filter(Boolean) and becomes a store id named
  // "null". The copies this replaces all had that flaw.
  const assignedStoreIds = Array.isArray(staff?.assignedStoreIds)
    ? (staff!.assignedStoreIds as unknown[])
        .filter((x) => typeof x === "string" || typeof x === "number")
        .map((x) => String(x).trim())
        .filter(Boolean)
    : [];

  return { ok: true, caller: { uid, role, assignedStoreIds, isPlatformAdmin } };
}

/** Whether this caller may act on `storeId`. No empty-array exemption. */
export function hasStoreAccess(caller: StaffCaller, storeId: string): boolean {
  if (caller.isPlatformAdmin) return true;
  return !!storeId && caller.assignedStoreIds.includes(storeId);
}

/** The subset of `storeIds` this caller is allowed to see. */
export function visibleStoreIds(caller: StaffCaller, storeIds: string[]): string[] {
  return caller.isPlatformAdmin ? storeIds : storeIds.filter((id) => hasStoreAccess(caller, id));
}

/**
 * Whether the caller holds one of `roles`. A platform admin always does.
 *
 * Pass the narrowest list that makes sense — an omitted role is a denial, which
 * is the safe direction to be wrong in.
 */
export function roleAllowed(caller: StaffCaller, roles: StaffRole[]): boolean {
  return caller.isPlatformAdmin || roles.includes(caller.role as StaffRole);
}
