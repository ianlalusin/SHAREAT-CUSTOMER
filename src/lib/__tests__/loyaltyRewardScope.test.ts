import { describe, it, expect } from "vitest";
import { isRewardOfferedAtStore } from "@/lib/loyaltyRewardScope";

const STORE = "storeA";
const OTHER = "storeB";

describe("isRewardOfferedAtStore", () => {
  it("offers an unscoped reward everywhere", () => {
    // How every reward predating per-store scoping is stored, so this is the
    // case that must not change.
    expect(isRewardOfferedAtStore({}, STORE)).toBe(true);
    expect(isRewardOfferedAtStore({ applicableStoreIds: null, disabledStoreIds: null }, STORE)).toBe(true);
    expect(isRewardOfferedAtStore({ applicableStoreIds: [], disabledStoreIds: [] }, STORE)).toBe(true);
  });

  it("respects the admin's allow-list", () => {
    expect(isRewardOfferedAtStore({ applicableStoreIds: [STORE] }, STORE)).toBe(true);
    expect(isRewardOfferedAtStore({ applicableStoreIds: [OTHER] }, STORE)).toBe(false);
  });

  it("respects the manager's opt-out for their own branch", () => {
    expect(isRewardOfferedAtStore({ disabledStoreIds: [STORE] }, STORE)).toBe(false);
    expect(isRewardOfferedAtStore({ disabledStoreIds: [OTHER] }, STORE)).toBe(true);
  });

  it("lets the manager's opt-out override an allow-list that includes them", () => {
    expect(
      isRewardOfferedAtStore({ applicableStoreIds: [STORE, OTHER], disabledStoreIds: [STORE] }, STORE)
    ).toBe(false);
  });

  it("hides a globally paused reward regardless of scoping", () => {
    expect(isRewardOfferedAtStore({ isActive: false }, STORE)).toBe(false);
    expect(isRewardOfferedAtStore({ isActive: false, applicableStoreIds: [STORE] }, STORE)).toBe(false);
  });

  it("offers nothing without a store to check against", () => {
    // A claim with no store context must not fall through to "available".
    expect(isRewardOfferedAtStore({}, "")).toBe(false);
    expect(isRewardOfferedAtStore(null, STORE)).toBe(false);
    expect(isRewardOfferedAtStore(undefined, STORE)).toBe(false);
  });

  it("ignores malformed scope fields rather than throwing", () => {
    expect(isRewardOfferedAtStore({ applicableStoreIds: "storeA" as any }, STORE)).toBe(true);
    expect(isRewardOfferedAtStore({ disabledStoreIds: "storeA" as any }, STORE)).toBe(true);
  });
});
