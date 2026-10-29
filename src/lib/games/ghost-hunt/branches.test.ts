import { describe, it, expect } from "vitest";
import { legacyBranchConfig, resolveBranchConfig, summarizeBranches, summaryLive } from "./branches";
import { DEFAULT_SETTINGS, normalizeSettings } from "./rules";

const chainEvent = { ...DEFAULT_SETTINGS, hashtag: "#Chain" };
const summary = { isActive: true, applicableStoreIds: ["lipa"], event: chainEvent };

describe("switch-over: a branch runs exactly as before until it is saved", () => {
  it("reads the old chain settings with the branch's overrides on top", () => {
    const c = legacyBranchConfig(summary, { hashtag: "#Lipa" }, "lipa");
    expect(c.enabled).toBe(true);
    expect(c.settings.hashtag).toBe("#Lipa");
    expect(c.settings.prizes).toEqual(chainEvent.prizes);
  });

  it("keeps a branch outside the old allow-list off", () => {
    expect(legacyBranchConfig(summary, null, "malvar").enabled).toBe(false);
    expect(legacyBranchConfig({ ...summary, applicableStoreIds: [] }, null, "malvar").enabled).toBe(true);
    expect(legacyBranchConfig({ ...summary, isActive: false }, null, "lipa").enabled).toBe(false);
  });
});

describe("resolveBranchConfig", () => {
  it("uses the branch's own settings once it has them — nothing chain-wide leaks in", () => {
    const own = normalizeSettings({ ...DEFAULT_SETTINGS, hashtag: "#OwnOnly", appearChance: 0.2 });
    const c = resolveBranchConfig(summary, { enabled: true, settings: own, overrides: { hashtag: "#Old" } }, "lipa");
    expect(c).toEqual({ enabled: true, settings: own });
  });

  it("treats a branch never set up after the switch-over as off", () => {
    const c = resolveBranchConfig({ ...summary, perStore: true }, null, "davao");
    expect(c.enabled).toBe(false);
  });

  it("is off unless the branch says enabled", () => {
    expect(resolveBranchConfig(summary, { settings: DEFAULT_SETTINGS }, "lipa").enabled).toBe(false);
  });
});

describe("summarizeBranches", () => {
  const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
  const b = (storeId: string, enabled: boolean, start: number, end: number) => ({
    storeId,
    enabled,
    settings: { ...DEFAULT_SETTINGS, startsAtMs: start, endsAtMs: end },
  });

  it("covers only the branches that are on, earliest start to latest end", () => {
    expect(
      summarizeBranches([b("malvar", true, at(2026, 11, 1), at(2026, 11, 20)), b("lipa", true, at(2026, 10, 30), at(2026, 11, 15)), b("davao", false, 0, 1)])
    ).toEqual({ isActive: true, applicableStoreIds: ["lipa", "malvar"], startsAtMs: at(2026, 10, 30), endsAtMs: at(2026, 11, 20) });
  });

  it("is off when no branch is on", () => {
    expect(summarizeBranches([b("lipa", false, 0, 1)])).toMatchObject({ isActive: false, applicableStoreIds: [] });
  });

  it("tells anonymous browsers whether it is on anywhere today", () => {
    const s = { isActive: true, startsAtMs: at(2026, 10, 30), endsAtMs: at(2026, 11, 16) };
    expect(summaryLive(s, at(2026, 11, 1))).toBe(true);
    expect(summaryLive(s, at(2026, 11, 20))).toBe(false);
    expect(summaryLive({ ...s, isActive: false }, at(2026, 11, 1))).toBe(false);
  });
});
