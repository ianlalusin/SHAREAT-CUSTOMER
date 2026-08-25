import { describe, it, expect } from "vitest";
import {
  judgeCaller, hasStoreAccess, visibleStoreIds, roleAllowed, MANAGER_ROLES,
  type StaffCaller,
} from "./access-rules";

const A = "storeA";
const B = "storeB";

function caller(over: Partial<StaffCaller> = {}): StaffCaller {
  return { uid: "u1", role: "manager", assignedStoreIds: [A], isPlatformAdmin: false, ...over };
}

function granted(res: ReturnType<typeof judgeCaller>): StaffCaller {
  if (!res.ok) throw new Error(`expected granted, got ${res.status} ${res.error}`);
  return res.caller;
}

describe("judgeCaller", () => {
  it("admits an active staff member with their assignments", () => {
    const c = granted(judgeCaller({ uid: "u1" }, { role: "manager", status: "active", assignedStoreIds: [A, B] }));
    expect(c).toEqual({ uid: "u1", role: "manager", assignedStoreIds: [A, B], isPlatformAdmin: false });
  });

  it("refuses a staff member who is not active", () => {
    const res = judgeCaller({ uid: "u1" }, { role: "manager", status: "disabled", assignedStoreIds: [A] });
    expect(res.ok).toBe(false);
  });

  it("refuses someone with no staff document", () => {
    expect(judgeCaller({ uid: "u1" }, null).ok).toBe(false);
  });

  /** A diner's token carries a uid too. It must never open a staff route. */
  it("refuses a customer token outright", () => {
    expect(judgeCaller({ uid: "u1", customer: true }, { status: "active", role: "admin" }).ok).toBe(false);
    expect(judgeCaller({ uid: "u1", loyaltyCustomer: true }, { status: "active", role: "admin" }).ok).toBe(false);
  });

  it("treats the platformAdmin claim as break-glass, with no staff doc needed", () => {
    const c = granted(judgeCaller({ uid: "root", platformAdmin: true }, null));
    expect(c.isPlatformAdmin).toBe(true);
    expect(c.assignedStoreIds).toEqual([]);
  });

  it("treats an active admin role as a platform admin", () => {
    expect(granted(judgeCaller({ uid: "u1" }, { role: "admin", status: "active" })).isPlatformAdmin).toBe(true);
  });

  /** Deactivating an admin has to actually take the keys away. */
  it("does not honour an admin role on a deactivated document", () => {
    expect(judgeCaller({ uid: "u1" }, { role: "admin", status: "disabled" }).ok).toBe(false);
  });

  it("coerces a junk assignment list rather than trusting it", () => {
    const c = granted(judgeCaller({ uid: "u1" }, { role: "manager", status: "active", assignedStoreIds: [A, "", null, 7] }));
    expect(c.assignedStoreIds).toEqual([A, "7"]);
  });

  it("survives a missing assignment list", () => {
    expect(granted(judgeCaller({ uid: "u1" }, { role: "manager", status: "active" })).assignedStoreIds).toEqual([]);
  });
});

describe("hasStoreAccess", () => {
  it("allows a store the caller is assigned to", () => {
    expect(hasStoreAccess(caller(), A)).toBe(true);
  });

  it("refuses a store the caller is not assigned to", () => {
    expect(hasStoreAccess(caller(), B)).toBe(false);
  });

  /**
   * THE INVERTED CASE. `canModerateStore` returned true here, so a staff record
   * with no assignments could moderate, read and act on EVERY branch. The live
   * Firestore rules always refused those reads, so this only ever granted an
   * ability that did not work — and disagreed with three sibling routes.
   */
  it("refuses every store when the caller has no assignments", () => {
    expect(hasStoreAccess(caller({ assignedStoreIds: [] }), A)).toBe(false);
    expect(hasStoreAccess(caller({ assignedStoreIds: [] }), B)).toBe(false);
  });

  it("refuses a blank storeId even for an assigned manager", () => {
    expect(hasStoreAccess(caller(), "")).toBe(false);
  });

  it("lets a platform admin reach any store, assigned or not", () => {
    const admin = caller({ isPlatformAdmin: true, assignedStoreIds: [] });
    expect(hasStoreAccess(admin, B)).toBe(true);
  });
});

describe("visibleStoreIds", () => {
  it("narrows a chain-wide list to the caller's own branches", () => {
    expect(visibleStoreIds(caller(), [A, B, "storeC"])).toEqual([A]);
  });

  it("hands a platform admin the whole list", () => {
    expect(visibleStoreIds(caller({ isPlatformAdmin: true }), [A, B])).toEqual([A, B]);
  });

  it("yields nothing for a caller with no assignments", () => {
    expect(visibleStoreIds(caller({ assignedStoreIds: [] }), [A, B])).toEqual([]);
  });
});

describe("roleAllowed", () => {
  it("admits a listed role", () => {
    expect(roleAllowed(caller({ role: "manager" }), MANAGER_ROLES)).toBe(true);
  });

  /** Omission is denial — the safe direction to be wrong in. */
  it("refuses a role nobody listed", () => {
    expect(roleAllowed(caller({ role: "cashier" }), MANAGER_ROLES)).toBe(false);
    expect(roleAllowed(caller({ role: "kitchen" }), MANAGER_ROLES)).toBe(false);
    expect(roleAllowed(caller({ role: "" }), MANAGER_ROLES)).toBe(false);
  });

  it("lets a platform admin past any list", () => {
    expect(roleAllowed(caller({ isPlatformAdmin: true, role: "" }), ["cashier"])).toBe(true);
  });
});
