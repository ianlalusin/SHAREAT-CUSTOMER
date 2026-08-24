"use client";

import { Star } from "lucide-react";
import type { RecipeCard } from "@/lib/games/recipe/types";
import { MIN_VOTES_TO_RANK } from "@/lib/games/recipe/rank";
import { attributionFor, clampText, TITLE_DISPLAY_MAX } from "@/lib/games/recipe/attribution";

/**
 * One recipe in a list.
 *
 * Shows the raw Yummy/Good/Yuck tallies rather than the rank score. The score
 * is Bayesian-shrunk and would read as wrong to a diner looking at a recipe
 * with three Yummys and a "0.61" next to it — the tallies are what they can
 * actually verify.
 */
export function RecipeCardTile({
  recipe,
  rank,
  onOpen,
}: {
  recipe: RecipeCard;
  rank?: number;
  onOpen: () => void;
}) {
  const { counts } = recipe;
  const needsVotes = counts.total < MIN_VOTES_TO_RANK;
  const by = attributionFor(recipe.displayName, recipe.storeName);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-2xl border bg-white p-4 shadow-sm hover:shadow-md active:scale-[0.99] transition"
    >
      <div className="flex items-start gap-3">
        {rank !== undefined && (
          <span className="shrink-0 h-7 w-7 rounded-full bg-primary/10 text-primary font-black text-sm flex items-center justify-center">
            {rank}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            {recipe.featured && (
              <Star className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" fill="currentColor" aria-label="Featured" />
            )}
            {/* Title and credit are ONE heading. "by: Name" is nowrap so it can
                never be split from the name across a line break — it moves to
                the next line whole or not at all. */}
            <h3 className="font-black leading-tight">
              {clampText(recipe.title, TITLE_DISPLAY_MAX)}{" "}
              <span className="whitespace-nowrap text-primary">by: {by.name}</span>
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            {by.store ? `${by.store} · ` : ""}{recipe.stepCount} steps
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span title="Yummy">🤤 {counts.yummy}</span>
            <span title="Good">🙂 {counts.good}</span>
            <span title="Yuck">🤢 {counts.yuck}</span>
            {/* How many PEOPLE, not just how the votes split. Without it a
                recipe with one Yummy and one with forty read the same. */}
            {counts.total > 0 && (
              <span className="text-muted-foreground">
                {counts.total} {counts.total === 1 ? "rating" : "ratings"}
              </span>
            )}
            {needsVotes && (
              <span className="text-muted-foreground">
                {counts.total === 0 ? "Be the first to try it" : `${MIN_VOTES_TO_RANK - counts.total} more to rank`}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
