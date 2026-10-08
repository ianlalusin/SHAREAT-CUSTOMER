import { VERDICT_POINTS, MAX_VERDICT_POINTS, type RecipeCounts, type Verdict } from "./types";

/**
 * How a recipe earns its place on the board.
 *
 * The naive answer — average the verdicts — is broken in the way that matters:
 * one Yummy from the author's seatmate scores a perfect 1.0 and outranks a
 * recipe two hundred people liked. So the average is shrunk toward a neutral
 * prior, and a recipe has to earn its position with VOLUME as well as score.
 */

/** The prior a recipe is assumed to be worth before anyone votes: "Good". */
export const PRIOR_MEAN = 0.5;
/** Strength of that assumption, in votes. ~8 phantom "Good"s to overcome. */
export const PRIOR_WEIGHT = 8;
/** Below this, a recipe is still finding its feet — it lives in Fresh, not Top. */
export const MIN_VOTES_TO_RANK = 5;

export function pointsFor(verdict: Verdict): number {
  return VERDICT_POINTS[verdict];
}

/**
 * Bayesian-shrunk score in [0,1]. Higher is tastier.
 *
 * DERIVATION — read this before "fixing" the missing division.
 *
 *   Standard shrinkage is   (v*R + m*C) / (v + m)
 *     v = vote count (`total`)
 *     R = this recipe's normalised average = scoreSum / (MAX_POINTS * total)
 *     m = PRIOR_WEIGHT, C = PRIOR_MEAN
 *
 *   The numerator's first term is  v * R
 *                               =  total * scoreSum / (MAX_POINTS * total)
 *                               =  scoreSum / MAX_POINTS          <- `total` cancels
 *
 * So `scoreSum / MAX_VERDICT_POINTS` below is NOT an un-averaged sum that
 * forgot to divide by `total`. The division already happened and cancelled.
 * Reintroducing `/ total` would double-divide and flatten the whole board.
 */
export function rankScore(counts: RecipeCounts, scoreSum: number): number {
  const total = Math.max(0, Number(counts?.total) || 0);
  const sum = Math.max(0, Number(scoreSum) || 0);

  const numerator = sum / MAX_VERDICT_POINTS + PRIOR_MEAN * PRIOR_WEIGHT;
  return numerator / (total + PRIOR_WEIGHT);
}

/** Recompute counts and scoreSum after one new verdict. */
export function applyVerdict(
  counts: RecipeCounts,
  scoreSum: number,
  verdict: Verdict
): { counts: RecipeCounts; scoreSum: number; rankScore: number } {
  const next: RecipeCounts = {
    yuck: counts.yuck + (verdict === "yuck" ? 1 : 0),
    good: counts.good + (verdict === "good" ? 1 : 0),
    yummy: counts.yummy + (verdict === "yummy" ? 1 : 0),
    total: counts.total + 1,
  };
  const nextSum = scoreSum + pointsFor(verdict);
  return { counts: next, scoreSum: nextSum, rankScore: rankScore(next, nextSum) };
}

/** Whether a recipe has enough votes to be ranked on the Top board. */
export function isRankable(counts: RecipeCounts): boolean {
  return (Number(counts?.total) || 0) >= MIN_VOTES_TO_RANK;
}

/**
 * The score as admins and diners read it: 0-100, or null when nobody has rated
 * the recipe yet.
 *
 * `rankScore` of an unrated recipe is the neutral prior (0.5), which would print
 * as "50" and read as a verdict nobody gave. Under MIN_VOTES_TO_RANK it is
 * still mostly that prior — callers label it provisional.
 */
export function displayScore(counts: RecipeCounts, score: number): number | null {
  if ((Number(counts?.total) || 0) <= 0) return null;
  const s = Number(score);
  if (!Number.isFinite(s)) return null;
  return Math.round(Math.min(1, Math.max(0, s)) * 100);
}

/**
 * Popularity order: how many people rated it, then score, then recency.
 * Volume leads here — the score only separates recipes with the same turnout.
 */
export function compareForPopular(
  a: { rankScore: number; counts: RecipeCounts; publishedAtMs: number },
  b: { rankScore: number; counts: RecipeCounts; publishedAtMs: number }
): number {
  if (b.counts.total !== a.counts.total) return b.counts.total - a.counts.total;
  if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
  return b.publishedAtMs - a.publishedAtMs;
}

/**
 * Board order: score, then volume, then recency. Volume breaks ties because
 * between two equally-rated recipes the better-evidenced one deserves the slot.
 */
export function compareForTop(
  a: { rankScore: number; counts: RecipeCounts; publishedAtMs: number },
  b: { rankScore: number; counts: RecipeCounts; publishedAtMs: number }
): number {
  if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
  if (b.counts.total !== a.counts.total) return b.counts.total - a.counts.total;
  return b.publishedAtMs - a.publishedAtMs;
}
