import { describe, it, expect } from "vitest";
import {
  rankScore, applyVerdict, isRankable, compareForTop, compareForPopular, displayScore,
  PRIOR_MEAN, MIN_VOTES_TO_RANK,
} from "@/lib/games/recipe/rank";
import { EMPTY_COUNTS, type RecipeCounts } from "@/lib/games/recipe/types";

const counts = (yuck: number, good: number, yummy: number): RecipeCounts => ({
  yuck, good, yummy, total: yuck + good + yummy,
});
/** scoreSum the way the store accumulates it: yuck 0, good 1, yummy 2. */
const sum = (c: RecipeCounts) => c.good * 1 + c.yummy * 2;

describe("rankScore", () => {
  it("sits exactly at the prior with no votes", () => {
    expect(rankScore(EMPTY_COUNTS, 0)).toBeCloseTo(PRIOR_MEAN, 10);
  });

  it("cannot leave [0,1] at either extreme", () => {
    const allYuck = counts(50, 0, 0);
    const allYummy = counts(0, 0, 50);
    expect(rankScore(allYuck, sum(allYuck))).toBeGreaterThan(0);
    expect(rankScore(allYuck, sum(allYuck))).toBeLessThan(PRIOR_MEAN);
    expect(rankScore(allYummy, sum(allYummy))).toBeLessThan(1);
    expect(rankScore(allYummy, sum(allYummy))).toBeGreaterThan(PRIOR_MEAN);
  });

  /** The whole reason the prior exists. */
  it("does not let one Yummy outrank a well-liked, well-tried recipe", () => {
    const lucky = counts(0, 0, 1);
    const proven = counts(2, 30, 168);
    expect(rankScore(lucky, sum(lucky))).toBeLessThan(rankScore(proven, sum(proven)));
  });

  it("converges toward the raw average as votes pile up", () => {
    const few = counts(0, 0, 5);
    const many = counts(0, 0, 500);
    expect(rankScore(many, sum(many))).toBeGreaterThan(rankScore(few, sum(few)));
    expect(rankScore(many, sum(many))).toBeCloseTo(1, 1);
  });

  /**
   * Guards the derivation comment in rank.ts. `scoreSum/2` is v*R already
   * simplified; a well-meaning "fix" adding `/ total` would land here.
   */
  it("does not double-divide by the vote count", () => {
    const c = counts(0, 0, 10);
    const actual = rankScore(c, sum(c));

    // (10 + 4) / 18 — ten unanimous Yummys, still shrunk toward "Good".
    expect(actual).toBeCloseTo(14 / 18, 10);

    // What the "fix" would produce: dividing by total a second time.
    const doubleDivided = (sum(c) / 2 / c.total + 0.5 * 8) / (c.total + 8);
    expect(doubleDivided).toBeCloseTo(5 / 18, 10);
    expect(actual).toBeGreaterThan(doubleDivided * 2);
  });

  it("treats missing or junk input as no votes", () => {
    expect(rankScore(EMPTY_COUNTS, NaN)).toBeCloseTo(PRIOR_MEAN, 10);
    expect(rankScore({ ...EMPTY_COUNTS, total: -3 }, -5)).toBeCloseTo(PRIOR_MEAN, 10);
  });
});

describe("applyVerdict", () => {
  it("moves the right counter and the sum together", () => {
    const a = applyVerdict(EMPTY_COUNTS, 0, "yummy");
    expect(a.counts).toEqual({ yuck: 0, good: 0, yummy: 1, total: 1 });
    expect(a.scoreSum).toBe(2);

    const b = applyVerdict(a.counts, a.scoreSum, "yuck");
    expect(b.counts).toEqual({ yuck: 1, good: 0, yummy: 1, total: 2 });
    expect(b.scoreSum).toBe(2);
    expect(b.rankScore).toBeLessThan(a.rankScore);
  });
});

describe("isRankable", () => {
  it("gates the Top board at MIN_VOTES_TO_RANK", () => {
    expect(isRankable(counts(0, 0, MIN_VOTES_TO_RANK - 1))).toBe(false);
    expect(isRankable(counts(0, 0, MIN_VOTES_TO_RANK))).toBe(true);
  });
});

describe("compareForTop", () => {
  const row = (rankScore: number, total: number, publishedAtMs: number) =>
    ({ rankScore, counts: { ...EMPTY_COUNTS, total }, publishedAtMs });

  it("sorts by score, then volume, then recency", () => {
    expect(compareForTop(row(0.9, 10, 1), row(0.8, 99, 9))).toBeLessThan(0);
    expect(compareForTop(row(0.9, 50, 1), row(0.9, 10, 9))).toBeLessThan(0);
    expect(compareForTop(row(0.9, 10, 900), row(0.9, 10, 100))).toBeLessThan(0);
  });
});

describe("displayScore", () => {
  it("is null until somebody rates it, never the 50 the prior would print", () => {
    expect(displayScore(EMPTY_COUNTS, rankScore(EMPTY_COUNTS, 0))).toBeNull();
  });
  it("is 0-100 and moves with the votes", () => {
    const loved = counts(0, 0, 20);
    const hated = counts(20, 0, 0);
    const lovedScore = displayScore(loved, rankScore(loved, sum(loved)))!;
    const hatedScore = displayScore(hated, rankScore(hated, sum(hated)))!;
    expect(lovedScore).toBeGreaterThan(50);
    expect(hatedScore).toBeLessThan(50);
    expect(lovedScore).toBeLessThanOrEqual(100);
    expect(hatedScore).toBeGreaterThanOrEqual(0);
  });
  it("clamps and survives junk", () => {
    expect(displayScore(counts(0, 0, 1), 7)).toBe(100);
    expect(displayScore(counts(0, 0, 1), -2)).toBe(0);
    expect(displayScore(counts(0, 0, 1), NaN)).toBeNull();
  });
});

describe("compareForPopular", () => {
  const r = (total: number, score: number, at: number) => ({
    counts: { yuck: 0, good: total, yummy: 0, total }, rankScore: score, publishedAtMs: at,
  });
  it("puts turnout first, then score, then recency", () => {
    const list = [r(3, 0.9, 1), r(30, 0.4, 1), r(3, 0.5, 5), r(3, 0.9, 7)];
    expect([...list].sort(compareForPopular)).toEqual([list[1], list[3], list[0], list[2]]);
  });
});
