import { describe, it, expect } from "vitest";
import {
  judgeFlip, judgeRound, averageScore, pickRawStrip, startingNeedle, stepNeedle,
  PERFECT_LO, PERFECT_HI, PERFECT_MID, STRIP_COUNT, type Doneness,
} from "@/lib/games/flipit/rules";

describe("judgeFlip", () => {
  it("rewards the centre of the band", () => {
    const r = judgeFlip(PERFECT_MID);
    expect(r.doneness).toBe("perfect");
    expect(r.score).toBe(100);
  });

  it("counts the whole band as perfect, edges included", () => {
    expect(judgeFlip(PERFECT_LO).doneness).toBe("perfect");
    expect(judgeFlip(PERFECT_HI).doneness).toBe("perfect");
    expect(judgeFlip(PERFECT_LO).score).toBeGreaterThanOrEqual(92);
  });

  it("is undercooked early and burnt late", () => {
    expect(judgeFlip(2).doneness).toBe("under");
    expect(judgeFlip(98).doneness).toBe("burnt");
  });

  it("gives a near miss its own state on both sides", () => {
    expect(judgeFlip(PERFECT_LO - 5).doneness).toBe("good");
    expect(judgeFlip(PERFECT_HI + 5).doneness).toBe("good");
  });

  it("never scores below the floor, however badly timed", () => {
    for (const p of [0, 1, 99, 100]) expect(judgeFlip(p).score).toBeGreaterThanOrEqual(11);
  });

  it("falls off symmetrically around the centre", () => {
    expect(judgeFlip(PERFECT_MID - 25).score).toBe(judgeFlip(PERFECT_MID + 25).score);
  });

  it("survives junk input rather than producing NaN", () => {
    for (const p of [NaN, -50, 500, Infinity]) {
      const r = judgeFlip(p as number);
      expect(Number.isFinite(r.score)).toBe(true);
    }
  });

  /**
   * The band has to be winnable by someone tapping once while waiting for food.
   * If this ever drops much below a fifth of the bar, the game stops being fun.
   */
  it("keeps the perfect window generous enough to hit", () => {
    expect(PERFECT_HI - PERFECT_LO).toBeGreaterThanOrEqual(12);
  });
});

describe("judgeRound", () => {
  it("maps an average onto a closing line", () => {
    expect(judgeRound(96).verdict).toBe("GRILL MASTER");
    expect(judgeRound(75).verdict).toBe("SOLID GRILLING");
    expect(judgeRound(50).verdict).toBe("NEEDS PRACTICE");
    expect(judgeRound(20).verdict).toBe("LET SOMEONE ELSE COOK");
  });

  it("covers every boundary without a gap", () => {
    for (let a = 0; a <= 100; a++) expect(judgeRound(a).verdict).toBeTruthy();
  });
});

describe("averageScore", () => {
  it("rounds the mean", () => {
    expect(averageScore([92, 78, 46, 51, 27])).toBe(59);
    expect(averageScore([100])).toBe(100);
  });
  it("returns zero for an empty round rather than NaN", () => {
    expect(averageScore([])).toBe(0);
  });
});

describe("pickRawStrip", () => {
  const raw = (): Doneness[] => Array(STRIP_COUNT).fill("raw");

  it("only ever picks a strip that is still raw", () => {
    const states: Doneness[] = ["perfect", "raw", "burnt", "raw", "good"];
    for (let i = 0; i < 50; i++) expect([1, 3]).toContain(pickRawStrip(states));
  });

  it("returns -1 when every strip is cooked", () => {
    expect(pickRawStrip(["good", "good", "good", "good", "good"])).toBe(-1);
  });

  it("can reach every raw strip", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) seen.add(pickRawStrip(raw()));
    expect(seen.size).toBe(STRIP_COUNT);
  });

  /** Math.random() can return values arbitrarily close to 1. */
  it("stays in range at the top of the random interval", () => {
    expect(pickRawStrip(raw(), () => 0.999999999)).toBe(STRIP_COUNT - 1);
    expect(pickRawStrip(raw(), () => 0)).toBe(0);
  });
});

describe("startingNeedle", () => {
  it("always starts outside the band, heading into it", () => {
    for (let i = 0; i < 200; i++) {
      const { position, direction } = startingNeedle();
      const inBand = position >= PERFECT_LO && position <= PERFECT_HI;
      expect(inBand).toBe(false);
      // heading toward the middle, not away from it
      expect(position < PERFECT_MID ? direction : -direction).toBe(1);
    }
  });

  it("does not start from the same place every turn", () => {
    const seen = new Set(Array.from({ length: 40 }, () => Math.round(startingNeedle().position)));
    expect(seen.size).toBeGreaterThan(5);
  });
});

describe("stepNeedle", () => {
  it("bounces at both ends instead of running off the bar", () => {
    expect(stepNeedle(99.9, 1, 1)).toEqual({ position: 100, direction: -1 });
    expect(stepNeedle(0.1, -1, 1)).toEqual({ position: 0, direction: 1 });
  });

  it("stays on the bar over a long run", () => {
    let s = { position: 0, direction: 1 as 1 | -1 };
    for (let i = 0; i < 5000; i++) {
      s = stepNeedle(s.position, s.direction);
      expect(s.position).toBeGreaterThanOrEqual(0);
      expect(s.position).toBeLessThanOrEqual(100);
    }
  });
});
