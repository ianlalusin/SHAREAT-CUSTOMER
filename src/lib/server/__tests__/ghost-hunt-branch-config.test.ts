import { describe, it, expect, beforeEach } from "vitest";
import { readBranchConfig, readGhostHuntConfig, huntStatus, writeBranchConfig } from "../games/ghost-hunt-store";
import { DEFAULT_SETTINGS } from "@/lib/games/ghost-hunt/rules";

/**
 * The switch from chain-wide settings to per-branch-only, against an
 * in-memory Firestore. It runs once, on live data, so the thing pinned here is
 * that the first save changes nothing any diner sees except the branch saved.
 */
const store = new Map<string, any>();

function applyPatch(cur: any, patch: any) {
  const out = { ...(cur || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (((v as any)?.constructor?.name || "").includes("Delete")) delete out[k];
    else out[k] = v;
  }
  return out;
}

function fakeDb(): any {
  const snap = (path: string) => ({
    exists: store.has(path),
    id: path.split("/").pop(),
    data: () => store.get(path),
    get: (f: string) => store.get(path)?.[f],
  });
  const ref = (path: string) => ({
    path,
    get: async () => snap(path),
    set: async (d: any, o?: any) => void store.set(path, o?.merge ? applyPatch(store.get(path), d) : applyPatch({}, d)),
  });
  const col = (c: string): any => ({
    select: () => col(c),
    limit: () => col(c),
    get: async () => {
      const docs = [...store.keys()].filter((p) => p.startsWith(`${c}/`) && !p.slice(c.length + 1).includes("/")).map(snap);
      return { docs, empty: !docs.length, size: docs.length };
    },
  });
  return { doc: ref, collection: col };
}

const NOW = Date.UTC(2026, 10, 2, 11); // 7 PM Manila, Nov 2 — inside the default hours and dates
const chainEvent = { ...DEFAULT_SETTINGS, hashtag: "#ChainWide" };

beforeEach(() => {
  store.clear();
  for (const id of ["lipa", "malvar", "davao"]) store.set(`stores/${id}`, { name: id });
  // Live today: on at Lipa and Malvar; Malvar has its own prizes override.
  store.set("miniGames/ghost-hunt", { isActive: true, applicableStoreIds: ["lipa", "malvar"], event: chainEvent });
  store.set("ghostHuntBranches/malvar", { pinHash: "x", overrides: { prizes: [{ id: "coke", name: "1.5L Coke", perDay: 9 }] } });
});

describe("before any per-branch save", () => {
  it("each branch runs exactly as it does today", async () => {
    const db = fakeDb();
    expect(await readBranchConfig(db, "lipa")).toMatchObject({ enabled: true, settings: { hashtag: "#ChainWide" } });
    expect((await readBranchConfig(db, "malvar")).settings.prizes).toEqual([{ id: "coke", name: "1.5L Coke", perDay: 9 }]);
    expect((await readBranchConfig(db, "davao")).enabled).toBe(false);
  });
});

describe("the first per-branch save", () => {
  it("gives every branch its own copy of today's setup, changes only the branch saved, and drops the chain settings", async () => {
    const db = fakeDb();
    await writeBranchConfig(db, "davao", true, { ...DEFAULT_SETTINGS, hashtag: "#Davao" }, "admin");

    // Untouched branches: identical to before.
    expect(store.get("ghostHuntBranches/lipa")).toMatchObject({ enabled: true, settings: { hashtag: "#ChainWide" } });
    expect(store.get("ghostHuntBranches/malvar")).toMatchObject({
      enabled: true,
      pinHash: "x",
      settings: { prizes: [{ id: "coke", name: "1.5L Coke", perDay: 9 }] },
    });
    // The saved branch: exactly what was saved.
    expect(store.get("ghostHuntBranches/davao")).toMatchObject({ enabled: true, settings: { hashtag: "#Davao" } });

    // Summary rebuilt from the branches; no chain-wide settings left.
    const summary = store.get("miniGames/ghost-hunt");
    expect(summary).toMatchObject({ isActive: true, perStore: true, applicableStoreIds: ["davao", "lipa", "malvar"] });
    expect(summary.event).toBeUndefined();
  });

  it("switching a branch off takes it off the shelf and the game", async () => {
    const db = fakeDb();
    await writeBranchConfig(db, "lipa", false, DEFAULT_SETTINGS, "admin");
    expect(store.get("miniGames/ghost-hunt").applicableStoreIds).toEqual(["malvar"]);
    const cfg = await readGhostHuntConfig(db, "lipa");
    expect(huntStatus(cfg, "lipa", NOW)).toMatchObject({ live: false, message: "The hunt is not running at this branch." });
    expect(huntStatus(await readGhostHuntConfig(db, "malvar"), "malvar", NOW).live).toBe(true);
  });

  it("each branch's percentages are its own", async () => {
    const db = fakeDb();
    await writeBranchConfig(db, "lipa", true, { ...DEFAULT_SETTINGS, appearChance: 0.2, prizeShare: 0.5 }, "admin");
    expect((await readBranchConfig(db, "lipa")).settings).toMatchObject({ appearChance: 0.2, prizeShare: 0.5 });
    expect((await readBranchConfig(db, "malvar")).settings.appearChance).toBe(DEFAULT_SETTINGS.appearChance);
  });
});
