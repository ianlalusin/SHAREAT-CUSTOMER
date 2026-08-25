import { describe, it, expect } from "vitest";
import { managerGameState, setStoreEnabled } from "./gameStoreToggle";
import { isGameEnabledForStore } from "./gameScope";

const HERE = "storeA";
const THERE = "storeB";

describe("managerGameState", () => {
  it("says a game with no config is not theirs to switch on", () => {
    const s = managerGameState(null, HERE);
    expect(s.configured).toBe(false);
    expect(s.runningHere).toBe(false);
    expect(s.lockedReason).toBeTruthy();
  });

  it("reports a game running at this branch", () => {
    expect(managerGameState({ isActive: true }, HERE)).toEqual({
      configured: true,
      runningHere: true,
      lockedReason: null,
    });
  });

  it("reports a game this branch has switched off", () => {
    const s = managerGameState({ isActive: true, disabledStoreIds: [HERE] }, HERE);
    expect(s.runningHere).toBe(false);
    expect(s.lockedReason).toBeNull();
  });

  it("is unaffected by another branch switching it off", () => {
    expect(managerGameState({ isActive: true, disabledStoreIds: [THERE] }, HERE).runningHere).toBe(true);
  });

  /** A switch that silently does nothing is worse than one that explains. */
  it("locks the switch when head office killed it chain-wide", () => {
    const s = managerGameState({ isActive: false }, HERE);
    expect(s.runningHere).toBe(false);
    expect(s.lockedReason).toMatch(/every branch/i);
  });

  it("locks the switch when the branch is outside the allow-list", () => {
    const s = managerGameState({ isActive: true, applicableStoreIds: [THERE] }, HERE);
    expect(s.lockedReason).toMatch(/not offered/i);
  });

  it("treats an empty allow-list as every branch", () => {
    expect(managerGameState({ isActive: true, applicableStoreIds: [] }, HERE).lockedReason).toBeNull();
  });
});

describe("setStoreEnabled", () => {
  it("switching off adds only this branch", () => {
    expect(setStoreEnabled({ isActive: true }, HERE, false)).toEqual([HERE]);
  });

  it("switching on removes only this branch", () => {
    expect(setStoreEnabled({ disabledStoreIds: [HERE, THERE] }, HERE, true)).toEqual([THERE]);
  });

  it("never duplicates a branch already switched off", () => {
    expect(setStoreEnabled({ disabledStoreIds: [HERE] }, HERE, false)).toEqual([HERE]);
  });

  it("leaves other branches exactly as they were", () => {
    const before = { disabledStoreIds: [THERE, "storeC"] };
    expect(setStoreEnabled(before, HERE, false)).toEqual([THERE, "storeC", HERE]);
    expect(setStoreEnabled(before, HERE, true)).toEqual([THERE, "storeC"]);
  });

  it("survives a missing or junk list", () => {
    expect(setStoreEnabled(null, HERE, false)).toEqual([HERE]);
    expect(setStoreEnabled({ disabledStoreIds: null }, HERE, true)).toEqual([]);
  });
});

/** The whole point: what a manager flips is what a diner then sees. */
describe("the diner path agrees", () => {
  it("switching off here stops the game here and nowhere else", () => {
    const cfg = { isActive: true, disabledStoreIds: setStoreEnabled({ isActive: true }, HERE, false) };
    expect(isGameEnabledForStore(cfg, HERE)).toBe(false);
    expect(isGameEnabledForStore(cfg, THERE)).toBe(true);
  });

  it("switching back on restores it", () => {
    const off = { isActive: true, disabledStoreIds: [HERE] };
    const cfg = { isActive: true, disabledStoreIds: setStoreEnabled(off, HERE, true) };
    expect(isGameEnabledForStore(cfg, HERE)).toBe(true);
  });
});
