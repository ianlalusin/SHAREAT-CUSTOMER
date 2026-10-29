import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  activePrizeShare,
  dayProgress,
  windowWeights,
  releasedSoFar,
  describeWindows,
  eventState,
  isInsideWindow,
  manilaDayKey,
  manilaMidnightMs,
  normalizeSettings,
  prizesLeft,
  prizesRemaining,
  settingsForBranch,
  rollSpawn,
  savedTicketStillValid,
  type GhostHuntSettings,
} from "./rules";
import { isGameEnabledForStore } from "@/lib/games/gameScope";

/** A Manila wall-clock instant. */
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => manilaMidnightMs(y, mo, d) + (h * 60 + mi) * 60_000;

/** A rand() that returns these values in order. */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe("dates and hours", () => {
  it("keys the day in Manila, not UTC", () => {
    // 7 AM Oct 30 Manila is still Oct 29 in UTC.
    expect(manilaDayKey(at(2026, 10, 30, 7))).toBe("2026-10-30");
    expect(manilaDayKey(at(2026, 10, 30, 23, 59))).toBe("2026-10-30");
  });

  it("runs Oct 30 through the end of Nov 15, then switches itself off", () => {
    const s = { ...DEFAULT_SETTINGS, windows: [] };
    expect(eventState(s, at(2026, 10, 29, 23, 59)).live).toBe(false);
    expect(eventState(s, at(2026, 10, 30, 0, 0)).live).toBe(true);
    expect(eventState(s, at(2026, 11, 15, 23, 59)).live).toBe(true);
    const after = eventState(s, at(2026, 11, 16, 0, 0));
    expect(after.live).toBe(false);
    expect(!after.live && after.reason).toBe("ended");
  });

  it("only spawns inside the windows, and handles a window past midnight", () => {
    const w = [{ start: "17:00", end: "22:00" }];
    expect(isInsideWindow(w, at(2026, 11, 1, 16, 59))).toBe(false);
    expect(isInsideWindow(w, at(2026, 11, 1, 17, 0))).toBe(true);
    expect(isInsideWindow(w, at(2026, 11, 1, 22, 0))).toBe(false);

    const late = [{ start: "20:00", end: "01:00" }];
    expect(isInsideWindow(late, at(2026, 11, 1, 23, 30))).toBe(true);
    expect(isInsideWindow(late, at(2026, 11, 2, 0, 30))).toBe(true);
    expect(isInsideWindow(late, at(2026, 11, 2, 2, 0))).toBe(false);
  });

  it("says the hours in plain words", () => {
    expect(describeWindows(DEFAULT_SETTINGS.windows)).toBe("from 11 AM to 2 PM and 5 PM to 10 PM");
    expect(describeWindows([])).toBe("all day");
  });

  it("feeds the hub's generic run dates, so the tile disappears on its own", () => {
    const cfg = { isActive: true, startsAtMs: DEFAULT_SETTINGS.startsAtMs, endsAtMs: DEFAULT_SETTINGS.endsAtMs };
    expect(isGameEnabledForStore(cfg, "s1", at(2026, 11, 10, 12))).toBe(true);
    expect(isGameEnabledForStore(cfg, "s1", at(2026, 11, 16, 12))).toBe(false);
  });
});

describe("rollSpawn", () => {
  const s: GhostHuntSettings = { ...DEFAULT_SETTINGS, appearChance: 0.5, prizeShare: 0.2, helloShare: 0.5 };

  it("finds nothing when the first roll misses", () => {
    expect(rollSpawn({ settings: s, issued: {}, tableHasWon: false, rand: seq(0.9) }).kind).toBe("none");
  });

  it("spawns a prize ghost when stock is left", () => {
    const r = rollSpawn({ settings: s, issued: {}, tableHasWon: false, rand: seq(0.1, 0.1, 0) });
    expect(r.kind).toBe("prize");
    expect(r.prize?.id).toBe("melona");
  });

  it("never spawns a prize for a table that already won this visit", () => {
    const r = rollSpawn({ settings: s, issued: {}, tableHasWon: true, rand: seq(0.1, 0.1, 0.1) });
    expect(r.kind).not.toBe("prize");
  });

  it("falls through to free ghosts when every prize is gone for the day", () => {
    const issued = { melona: 3, coke: 2, kimbap: 2, enoki: 2 };
    const r = rollSpawn({ settings: s, issued, tableHasWon: false, rand: seq(0.1, 0.1, 0.1) });
    expect(r.kind).toBe("hello");
  });

  it("only picks prizes still in stock", () => {
    const issued = { melona: 3, coke: 2, kimbap: 2 };
    expect(prizesLeft(s.prizes, issued).map((p) => p.id)).toEqual(["enoki"]);
    const r = rollSpawn({ settings: s, issued, tableHasWon: false, rand: seq(0.1, 0.1, 0.99) });
    expect(r.prize?.id).toBe("enoki");
  });

  it("paces prizes across the day so lunch cannot take dinner's", () => {
    const w = [{ start: "11:00", end: "14:00" }, { start: "17:00", end: "22:00" }];
    expect(dayProgress(w, at(2026, 11, 1, 10, 0))).toBe(0);
    expect(dayProgress(w, at(2026, 11, 1, 14, 0))).toBeCloseTo(3 / 8);
    expect(dayProgress(w, at(2026, 11, 1, 23, 0))).toBe(1);
    // 3 Melona a day: one at opening, all three by the end.
    expect(releasedSoFar(3, 0)).toBe(1);
    expect(releasedSoFar(3, 0.5)).toBe(2);
    expect(releasedSoFar(3, 1)).toBe(3);
    // One Melona already gone at 11:05 — the next is not out yet.
    const early = prizesLeft(s.prizes, { melona: 1 }, 0.02).map((p) => p.id);
    expect(early).not.toContain("melona");
    expect(early).toContain("coke");
  });

  it("flies by when the hello roll misses", () => {
    expect(rollSpawn({ settings: s, issued: {}, tableHasWon: false, rand: seq(0.1, 0.9, 0.9) }).kind).toBe("flyby");
  });
});

describe("per-branch settings", () => {
  it("overrides only what the branch set", () => {
    const lipa = settingsForBranch(DEFAULT_SETTINGS, {
      prizes: [{ id: "melona", name: "2 Melona ice cream", perDay: 5 }],
      hashtag: "#SharEatLipa",
    });
    expect(lipa.prizes).toEqual([{ id: "melona", name: "2 Melona ice cream", perDay: 5 }]);
    expect(lipa.hashtag).toBe("#SharEatLipa");
    expect(lipa.tagHandle).toBe(DEFAULT_SETTINGS.tagHandle);
    expect(lipa.windows).toEqual(DEFAULT_SETTINGS.windows);
    expect(lipa.startsAtMs).toBe(DEFAULT_SETTINGS.startsAtMs);
  });

  it("ignores junk and blank fields", () => {
    expect(settingsForBranch(DEFAULT_SETTINGS, { hashtag: "  ", foo: 1 })).toEqual(DEFAULT_SETTINGS);
    expect(settingsForBranch(DEFAULT_SETTINGS, null)).toEqual(DEFAULT_SETTINGS);
  });

  it("counts a caught prize as gone even before it is claimed", () => {
    const left = prizesRemaining(DEFAULT_SETTINGS.prizes, { melona: 3, coke: 1 });
    expect(left.find((p) => p.id === "melona")?.left).toBe(0);
    expect(left.find((p) => p.id === "coke")?.left).toBe(1);
  });
});

describe("per-time-slot pacing and odds", () => {
  const lunch = { start: "11:00", end: "14:00" };
  const dinner = { start: "17:00", end: "22:00" };

  it("with no shares set, unlocks evenly by the clock exactly as before", () => {
    expect(dayProgress([lunch, dinner], at(2026, 11, 1, 14, 0))).toBeCloseTo(3 / 8);
  });

  it("saves most prizes for dinner when dinner has the bigger share", () => {
    const w = [{ ...lunch, share: 0.3 }, { ...dinner, share: 0.7 }];
    expect(dayProgress(w, at(2026, 11, 1, 14, 0))).toBeCloseTo(0.3);
    expect(dayProgress(w, at(2026, 11, 1, 19, 30))).toBeCloseTo(0.3 + 0.7 * 0.5);
    // 10 prizes: 3 by the end of lunch, all 10 by close.
    expect(releasedSoFar(10, dayProgress(w, at(2026, 11, 1, 14, 0)))).toBe(3);
    expect(releasedSoFar(10, dayProgress(w, at(2026, 11, 1, 22, 0)))).toBe(10);
  });

  it("lets unset slots split whatever share is left", () => {
    expect(windowWeights([{ ...lunch, share: 0.2 }, dinner])).toEqual([0.2, 0.8]);
  });

  it("uses the current slot's own prize chance, else the branch's", () => {
    const s = { ...DEFAULT_SETTINGS, prizeShare: 0.05, windows: [lunch, { ...dinner, prizeShare: 0.12 }] };
    expect(activePrizeShare(s, at(2026, 11, 1, 12, 0))).toBe(0.05);
    expect(activePrizeShare(s, at(2026, 11, 1, 19, 0))).toBe(0.12);
  });

  it("feeds that chance into the roll", () => {
    const s = { ...DEFAULT_SETTINGS, appearChance: 1, prizeShare: 0.05 };
    // 0.1 misses a 5% prize chance but hits a 12% one.
    expect(rollSpawn({ settings: s, issued: {}, tableHasWon: false, rand: seq(0, 0.1, 0) }).kind).not.toBe("prize");
    expect(rollSpawn({ settings: s, issued: {}, tableHasWon: false, rand: seq(0, 0.1, 0), prizeShare: 0.12 }).kind).toBe("prize");
  });

  it("keeps blank slot fields unset and clamps numbers", () => {
    const n = normalizeSettings({ windows: [{ ...lunch, share: "", prizeShare: null }, { ...dinner, share: 0.7, prizeShare: 3 }] });
    expect(n.windows).toEqual([lunch, { ...dinner, share: 0.7, prizeShare: 1 }]);
  });
});

describe("savedTicketStillValid — the phone's old ticket", () => {
  const today = at(2026, 11, 1, 19);
  const t = { status: "won", day: "2026-11-01", storeId: "test-store" };

  it("hides a TEST-store ticket at Lipa (the reported case)", () => {
    expect(savedTicketStillValid(t, "lipa", today)).toBe(false);
  });

  it("shows an unclaimed ticket at the same branch, same day", () => {
    expect(savedTicketStillValid(t, "test-store", today)).toBe(true);
  });

  it("shows it away from any table, so it can be claimed after the table closes", () => {
    expect(savedTicketStillValid(t, null, today)).toBe(true);
  });

  it("hides it once claimed, or on another day", () => {
    expect(savedTicketStillValid({ ...t, status: "claimed" }, "test-store", today)).toBe(false);
    expect(savedTicketStillValid(t, "test-store", at(2026, 11, 2, 12))).toBe(false);
  });
});

describe("normalizeSettings", () => {
  it("falls back to the defaults for an empty doc", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("drops broken windows and prizes, clamps odds, keeps the rest", () => {
    const n = normalizeSettings({
      theme: "christmas",
      windows: [{ start: "18:00", end: "21:00" }, { start: "nope", end: "21:00" }],
      prizes: [{ name: "Free Coke", perDay: 4 }, { name: "" }, { name: "Free Coke", perDay: 1 }],
      appearChance: 7,
      prizeShare: -1,
    });
    expect(n.theme).toBe("christmas");
    expect(n.windows).toEqual([{ start: "18:00", end: "21:00" }]);
    expect(n.prizes).toEqual([{ id: "free-coke", name: "Free Coke", perDay: 4 }]);
    expect(n.appearChance).toBe(1);
    expect(n.prizeShare).toBe(0);
  });

  it("rejects an unknown theme", () => {
    expect(normalizeSettings({ theme: "easter" }).theme).toBe("halloween");
  });
});
