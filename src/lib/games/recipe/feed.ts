import { compareForTop, isRankable } from "./rank";
import type { RecipeCard, RecipeFeed, RecipeStatus } from "./types";

/**
 * Building the three shelves.
 *
 * These are THREE DIFFERENT RULES, not one sort wearing three hats, and they
 * are separate functions so nobody collapses them into a shared "splice" that
 * is subtly wrong for two of the three:
 *
 *   top      — rank-ordered, and gated on having enough votes to mean anything.
 *   fresh    — recency-ordered, ignores score entirely. This is the discovery
 *              shelf: without it a new recipe can never accumulate the votes
 *              that would qualify it for `top`, so the board would ossify
 *              around whatever was published first.
 *   featured — admin-curated. Voting NEVER touches it.
 *
 * They are rebuilt wholesale rather than patched in place. Patching would have
 * to handle removal — hide and reject are deletions BY ID, not score
 * comparisons, and an admin pulling a recipe says nothing about its rank — and
 * a rebuild gets that for free by simply never including it.
 */

export const TOP_SIZE = 50;
export const FRESH_SIZE = 30;
export const FEATURED_SIZE = 5;

/** What a recipe must be to appear anywhere a diner can see it. */
export function isPublicStatus(status: RecipeStatus | string | null | undefined): boolean {
  return status === "published";
}

export type RankableRecipe = RecipeCard & { status: RecipeStatus };

export function buildTop(recipes: RankableRecipe[], size = TOP_SIZE): RecipeCard[] {
  return recipes
    .filter((r) => isPublicStatus(r.status) && isRankable(r.counts))
    .sort(compareForTop)
    .slice(0, size)
    .map(toCard);
}

export function buildFresh(recipes: RankableRecipe[], size = FRESH_SIZE): RecipeCard[] {
  return recipes
    .filter((r) => isPublicStatus(r.status))
    .sort((a, b) => b.publishedAtMs - a.publishedAtMs)
    .slice(0, size)
    .map(toCard);
}

export function buildFeatured(recipes: RankableRecipe[], size = FEATURED_SIZE): RecipeCard[] {
  return recipes
    .filter((r) => isPublicStatus(r.status) && r.featured)
    .sort((a, b) => b.publishedAtMs - a.publishedAtMs)
    .slice(0, size)
    .map(toCard);
}

export function buildFeed(recipes: RankableRecipe[], nowMs: number): RecipeFeed {
  return {
    top: buildTop(recipes),
    fresh: buildFresh(recipes),
    featured: buildFeatured(recipes),
    updatedAtMs: nowMs,
  };
}

/** Strip the moderation status — a diner's payload has no business carrying it. */
function toCard(r: RankableRecipe): RecipeCard {
  return {
    id: r.id,
    title: r.title,
    displayName: r.displayName,
    storeName: r.storeName,
    stepCount: r.stepCount,
    counts: r.counts,
    rankScore: r.rankScore,
    featured: r.featured,
    publishedAtMs: r.publishedAtMs,
  };
}
