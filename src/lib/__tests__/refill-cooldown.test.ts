import { describe, it, expect } from "vitest";
import {
  OUTSTANDING_BLOCK_MAX_MS,
  REFILL_COOLDOWN_MS,
  blockedRefillsDetailed,
  cooldownFor,
  blockedRefills,
  toNextAllowedMap,
  formatCountdown,
  mergeCooldownStamps,
} from "../refill-cooldown";

const T0 = 1_700_000_000_000;

describe("cooldownFor", () => {
  it("allows a refill that was never ordered", () => {
    const r = cooldownFor({}, "pork", T0);
    expect(r.allowed).toBe(true);
    expect(r.retryAfterMs).toBe(0);
  });

  it("blocks inside the window and reports the remaining time", () => {
    const elapsed = REFILL_COOLDOWN_MS / 5;
    const r = cooldownFor({ pork: T0 }, "pork", T0 + elapsed);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBe(REFILL_COOLDOWN_MS - elapsed);
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
  /** Partway through the window, whatever the window happens to be. */
  const now = T0 + REFILL_COOLDOWN_MS / 5;

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
    // Halfway through pork's cooldown; beef's lapsed a full cooldown ago.
    expect(toNextAllowedMap(map, T0 + REFILL_COOLDOWN_MS / 2)).toEqual({ pork: T0 + REFILL_COOLDOWN_MS });
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

describe("blockedRefillsDetailed", () => {
  const NONE = new Set<string>();

  it("lets a refill through when neither rule applies", () => {
    expect(blockedRefillsDetailed({}, NONE, ["pork"], T0)).toEqual([]);
  });

  it("blocks on the cooldown alone, with a time to show", () => {
    expect(blockedRefillsDetailed({ pork: T0 }, NONE, ["pork"], T0 + 1_000)).toEqual([
      { refillId: "pork", reason: "cooldown", nextAllowedAtMs: T0 + REFILL_COOLDOWN_MS },
    ]);
  });

  it("blocks while it is still in the kitchen even after the cooldown lapsed", () => {
    // The whole point: an old order that never arrived still blocks.
    expect(
      blockedRefillsDetailed({ pork: T0 }, new Set(["pork"]), ["pork"], T0 + REFILL_COOLDOWN_MS * 5)
    ).toEqual([{ refillId: "pork", reason: "in_kitchen", nextAllowedAtMs: 0 }]);
  });

  it("reports in_kitchen ahead of cooldown when both apply, and offers no countdown", () => {
    // Showing "0:20 left" beside a refill that will not unlock until the kitchen
    // serves it would be a lie.
    const [only] = blockedRefillsDetailed({ pork: T0 }, new Set(["pork"]), ["pork"], T0 + 1_000);
    expect(only.reason).toBe("in_kitchen");
    expect(only.nextAllowedAtMs).toBe(0);
  });

  it("keeps each refill independent", () => {
    const blocked = blockedRefillsDetailed({ pork: T0 }, new Set(["beef"]), ["pork", "beef", "chicken"], T0 + 1_000);
    expect(blocked.map((b) => [b.refillId, b.reason])).toEqual([
      ["pork", "cooldown"],
      ["beef", "in_kitchen"],
    ]);
  });

  it("de-duplicates repeated ids and ignores blanks", () => {
    expect(blockedRefillsDetailed({ pork: T0 }, NONE, ["pork", "pork", ""], T0 + 1_000)).toHaveLength(1);
  });

  it("tolerates a null outstanding set", () => {
    expect(blockedRefillsDetailed({}, null, ["pork"], T0)).toEqual([]);
  });

  it("keeps the cooldown well under the outstanding cap", () => {
    // The cap is the ceiling on the whole rule; a cooldown longer than it would
    // make the safety valve meaningless.
    expect(REFILL_COOLDOWN_MS).toBeLessThan(OUTSTANDING_BLOCK_MAX_MS);
  });
});

describe("mergeCooldownStamps", () => {
  it("keeps the later of the two stamps for each refill", () => {
    // The whole point: a serve that lands after the order was sent must push
    // the clock forward, never pull it back.
    const merged = mergeCooldownStamps({ pork: T0 }, { pork: T0 + 5_000 });
    expect(merged.pork).toBe(T0 + 5_000);
  });

  it("never moves a stamp backwards", () => {
    const merged = mergeCooldownStamps({ pork: T0 + 5_000 }, { pork: T0 });
    expect(merged.pork).toBe(T0 + 5_000);
  });

  it("carries through refills present in only one side", () => {
    const merged = mergeCooldownStamps({ pork: T0 }, { beef: T0 + 1_000 });
    expect(merged).toEqual({ pork: T0, beef: T0 + 1_000 });
  });

  it("survives null, undefined and garbage values", () => {
    expect(mergeCooldownStamps(null, undefined)).toEqual({});
    expect(mergeCooldownStamps({ pork: T0 }, null)).toEqual({ pork: T0 });
    expect(mergeCooldownStamps({ pork: NaN as unknown as number }, { pork: T0 })).toEqual({ pork: T0 });
    expect(mergeCooldownStamps({ pork: T0 }, { pork: 0 })).toEqual({ pork: T0 });
  });

  it("does not mutate either input", () => {
    const a = { pork: T0 };
    const b = { pork: T0 + 5_000 };
    mergeCooldownStamps(a, b);
    expect(a).toEqual({ pork: T0 });
    expect(b).toEqual({ pork: T0 + 5_000 });
  });
});

describe("the minute runs from the serve, not from the order", () => {
  // The bug this fixes: order at T0, kitchen serves at T0+3min. The order-anchored
  // minute lapsed two minutes before the food arrived, so the refill was
  // re-orderable the instant it landed on the table.
  const SERVED_AT = T0 + 3 * 60_000;

  it("blocks for a full minute after the food arrives", () => {
    const merged = mergeCooldownStamps({ pork: T0 }, { pork: SERVED_AT });
    const state = cooldownFor(merged, "pork", SERVED_AT + 1);
    expect(state.allowed).toBe(false);
    expect(state.nextAllowedAtMs).toBe(SERVED_AT + REFILL_COOLDOWN_MS);
  });

  it("releases one minute after the serve", () => {
    const merged = mergeCooldownStamps({ pork: T0 }, { pork: SERVED_AT });
    expect(cooldownFor(merged, "pork", SERVED_AT + REFILL_COOLDOWN_MS - 1).allowed).toBe(false);
    expect(cooldownFor(merged, "pork", SERVED_AT + REFILL_COOLDOWN_MS).allowed).toBe(true);
  });

  it("shows the diner a countdown for it", () => {
    const merged = mergeCooldownStamps({ pork: T0 }, { pork: SERVED_AT });
    expect(toNextAllowedMap(merged, SERVED_AT + 1_000)).toEqual({
      pork: SERVED_AT + REFILL_COOLDOWN_MS,
    });
  });

  it("leaves a never-served refill on its order-anchored clock", () => {
    // Nothing arrived, so there is no serve to anchor to: the 10-minute
    // outstanding cap stays the only thing that releases it.
    const merged = mergeCooldownStamps({ pork: T0 }, {});
    expect(cooldownFor(merged, "pork", T0 + REFILL_COOLDOWN_MS).allowed).toBe(true);
  });
});
