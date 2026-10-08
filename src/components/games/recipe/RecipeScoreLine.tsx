import type { RecipeCounts } from "@/lib/games/recipe/types";
import { displayScore, MIN_VOTES_TO_RANK } from "@/lib/games/recipe/rank";

/**
 * A recipe's standing, for staff: the 0-100 score beside the tallies it came
 * from, so the number can be checked against the votes behind it.
 *
 * Under MIN_VOTES_TO_RANK the score is still mostly the neutral starting
 * assumption, so it is marked provisional instead of being presented as a
 * verdict.
 */
export function RecipeScoreLine({ counts, rankScore }: { counts: RecipeCounts; rankScore: number }) {
  const score = displayScore(counts, rankScore);
  if (score === null) {
    return <p className="mt-1 text-xs text-muted-foreground">No ratings yet</p>;
  }
  const provisional = counts.total < MIN_VOTES_TO_RANK;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
      <span className="font-bold tabular-nums">
        Score {score}
        {provisional ? <span className="font-normal text-muted-foreground"> (provisional)</span> : null}
      </span>
      <span title="Yummy">🤤 {counts.yummy}</span>
      <span title="Good">🙂 {counts.good}</span>
      <span title="Yuck">🤢 {counts.yuck}</span>
      <span className="text-muted-foreground">
        {counts.total} {counts.total === 1 ? "rating" : "ratings"}
        {provisional ? ` · ${MIN_VOTES_TO_RANK - counts.total} more to rank` : ""}
      </span>
    </p>
  );
}
