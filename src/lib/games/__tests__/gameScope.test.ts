import { describe, it, expect } from "vitest";
import { isGameEnabledForStore, isGameConfigured } from "@/lib/games/gameScope";

const STORE = "storeA";
const OTHER = "storeB";

describe("isGameEnabledForStore", () => {
  it("runs an unscoped game at every store", () => {
    expect(isGameEnabledForStore({}, STORE)).toBe(true);
    expect(isGameEnabledForStore({ applicableStoreIds: null, disabledStoreIds: null }, STORE)).toBe(true);
    expect(isGameEnabledForStore({ applicableStoreIds: [], disabledStoreIds: [] }, STORE)).toBe(true);
  });

  it("respects the admin's allow-list", () => {
    expect(isGameEnabledForStore({ applicableStoreIds: [STORE] }, STORE)).toBe(true);
    expect(isGameEnabledForStore({ applicableStoreIds: [OTHER] }, STORE)).toBe(false);
  });

  it("respects a per-store opt-out, even against an allow-list that includes them", () => {
    expect(isGameEnabledForStore({ disabledStoreIds: [STORE] }, STORE)).toBe(false);
    expect(isGameEnabledForStore({ disabledStoreIds: [OTHER] }, STORE)).toBe(true);
    expect(
      isGameEnabledForStore({ applicableStoreIds: [STORE, OTHER], disabledStoreIds: [STORE] }, STORE)
    ).toBe(false);
  });

  it("hides a globally paused game regardless of scoping", () => {
    expect(isGameEnabledForStore({ isActive: false }, STORE)).toBe(false);
    expect(isGameEnabledForStore({ isActive: false, applicableStoreIds: [STORE] }, STORE)).toBe(false);
    expect(isGameEnabledForStore({ isActive: false }, null)).toBe(false);
  });

  /**
   * THE DIVERGENCE FROM loyaltyRewardScope. `isRewardOfferedAtStore` fails
   * closed without a store; a diner browsing /play away from a table has no
   * store and must still see what is live. Pinned so nobody "fixes" this into
   * the reward function's behaviour and blanks the hub for every visitor who
   * has not sat down.
   */
  it("ignores store scoping when there is no store context", () => {
    expect(isGameEnabledForStore({}, null)).toBe(true);
    expect(isGameEnabledForStore({ applicableStoreIds: [OTHER] }, null)).toBe(true);
    expect(isGameEnabledForStore({ disabledStoreIds: [OTHER] }, null)).toBe(true);
  });

  it("runs nothing without a config", () => {
    expect(isGameEnabledForStore(null, STORE)).toBe(false);
    expect(isGameEnabledForStore(undefined, null)).toBe(false);
  });
});

describe("isGameConfigured", () => {
  /**
   * The other half of "a missing doc means off". isGameEnabledForStore({}) is
   * true by design — it mirrors the reward semantics — so the caller must reject
   * an absent doc separately, or every game in the registry would go live the
   * moment it was written.
   */
  it("separates 'no doc' from 'a doc that says yes'", () => {
    expect(isGameConfigured(null)).toBe(false);
    expect(isGameConfigured(undefined)).toBe(false);
    expect(isGameConfigured({})).toBe(true);
    expect(isGameEnabledForStore({}, STORE)).toBe(true);
  });
});
