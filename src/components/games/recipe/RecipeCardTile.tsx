"use client";

import { Star } from "lucide-react";
import type { RecipeCard } from "@/lib/games/recipe/types";
import { MIN_VOTES_TO_RANK } from "@/lib/games/recipe/rank";
import { attributionFor } from "@/lib/games/recipe/attribution";

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
          <div className="flex items-center gap-1.5">
            {recipe.featured && (
              <Star className="h-4 w-4 shrink-0 text-amber-500" fill="currentColor" aria-label="Featured" />
            )}
            <h3 className="font-black leading-tight truncate">{recipe.title}</h3>
          </div>
          {/* The author is the credit line, so it gets the brand colour and a
              line of its own rather than being buried in grey metadata. */}
          <p className="text-sm font-bold text-primary truncate">by: {by.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {by.store ? `${by.store} · ` : ""}{recipe.stepCount} steps
          </p>

          <div className="mt-2 flex items-center gap-3 text-xs">
            <span title="Yummy">🤤 {counts.yummy}</span>
            <span title="Good">🙂 {counts.good}</span>
            <span title="Yuck">🤢 {counts.yuck}</span>
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
