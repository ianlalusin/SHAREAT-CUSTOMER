import { describe, it, expect } from "vitest";
import {
  REFILL_COOLDOWN_MS,
  cooldownFor,
  blockedRefills,
  toNextAllowedMap,
  formatCountdown,
} from "../refill-cooldown";

const T0 = 1_700_000_000_000;

describe("cooldownFor", () => {
  it("allows a refill that was never ordered", () => {
    const r = cooldownFor({}, "pork", T0);
    expect(r.allowed).toBe(true);
    expect(r.retryAfterMs).toBe(0);
  });

  it("blocks inside the window and reports the remaining time", () => {
    const r = cooldownFor({ pork: T0 }, "pork", T0 + 2 * 60_000);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBe(8 * 60_000);
    expect(r.nextAllowedAtMs).toBe(T0 + REFILL_COOLDOWN_MS);
  });

  it("allows once the window has fully elapsed", () => {
    expect(cooldownFor({ pork: T0 }, "pork", T0 + REFILL_COOLDOWN_MS).allowed).toBe(true);
  });

  it("still blocks one millisecond before the boundary", () => {
    expect(cooldownFor({ pork: T0 }, "pork", T0 + REFILL_COOLDOWN_MS - 1).allowed).toBe(false);
  });

  it("treats a zero or garbage timestamp as never ordered", () => {
    expect(cooldownFor({ pork: 0 }, "pork", T0).allowed).toBe(true);
    expect(cooldownFor({ pork: NaN as unknown as number }, "pork", T0).allowed).toBe(true);
  });

  it("never returns a negative wait when a stamp sits in the future", () => {
    expect(cooldownFor({ pork: T0 + 60_000 }, "pork", T0).retryAfterMs).toBeGreaterThan(0);
  });
});

describe("blockedRefills", () => {
  const map = { pork: T0 };
  const now = T0 + 2 * 60_000;

  it("does not block a different meat — the point of per-meat cooldowns", () => {
    expect(blockedRefills(map, ["beef"], now)).toEqual([]);
  });

  it("blocks the meat that was just ordered", () => {
    expect(blockedRefills(map, ["pork"], now)).toEqual([
      { refillId: "pork", nextAllowedAtMs: T0 + REFILL_COOLDOWN_MS },
    ]);
  });

  it("reports only the blocked meat in a mixed order", () => {
    expect(blockedRefills(map, ["pork", "beef"], now).map((b) => b.refillId)).toEqual(["pork"]);
  });

  it("allows everything once the window elapses", () => {
    expect(blockedRefills(map, ["pork", "beef"], T0 + REFILL_COOLDOWN_MS)).toEqual([]);
  });

  it("de-duplicates repeated ids", () => {
    expect(blockedRefills(map, ["pork", "pork"], now)).toHaveLength(1);
  });
});

describe("toNextAllowedMap", () => {
  it("keeps only the entries still cooling down", () => {
    const map = { pork: T0, beef: T0 - REFILL_COOLDOWN_MS };
    expect(toNextAllowedMap(map, T0 + 60_000)).toEqual({ pork: T0 + REFILL_COOLDOWN_MS });
  });

  it("is empty when nothing is cooling down", () => {
    expect(toNextAllowedMap({ pork: T0 }, T0 + REFILL_COOLDOWN_MS)).toEqual({});
  });
});

describe("formatCountdown", () => {
  it("formats as m:ss", () => {
    expect(formatCountdown(572_000)).toBe("9:32");
    expect(formatCountdown(7_000)).toBe("0:07");
    expect(formatCountdown(10 * 60_000)).toBe("10:00");
  });

  it("rounds up so it never reads 0:00 while still blocked", () => {
    expect(formatCountdown(500)).toBe("0:01");
  });

  it("never goes negative", () => {
    expect(formatCountdown(-5_000)).toBe("0:00");
  });
});
