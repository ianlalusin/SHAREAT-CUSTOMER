import type { RecipeStep } from "./types";

/**
 * What an edit does to a recipe's ratings.
 *
 * The rule: **the steps ARE the recipe.** People rated the instructions they
 * followed, so if those change the ratings describe something nobody tried and
 * have to go. A title or author-name fix changes nothing anyone tasted, so it
 * costs nothing — otherwise correcting a typo would wipe an author's score,
 * and nobody would ever correct one.
 *
 * Pure, so the decision is testable on its own and the store layer just acts on
 * the answer.
 */

/** One step reduced to the fields a diner actually sees and follows. */
function comparable(s: RecipeStep): string {
  return JSON.stringify([
    String(s?.kind || ""),
    String(s?.itemName || "").trim(),
    String(s?.verb || "").trim(),
    String(s?.note || "").trim(),
  ]);
}

/**
 * Whether the instructions changed.
 *
 * `catalogItemId` is deliberately NOT compared: it is advisory metadata that a
 * diner never sees, so a re-link to the same item under a new catalog id must
 * not cost the recipe its ratings.
 */
export function stepsChanged(a: RecipeStep[] | null | undefined, b: RecipeStep[] | null | undefined): boolean {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  if (left.length !== right.length) return true;
  return left.some((s, i) => comparable(s) !== comparable(right[i]));
}

export type EditEffect = {
  /** True when the tallies and vote records must be cleared. */
  resetRatings: boolean;
  /** Short, plain reason — shown to the admin before they commit. */
  reason: string;
};

export function effectOfEdit(
  current: { steps: RecipeStep[]; title: string; displayName: string },
  next: { steps: RecipeStep[]; title: string; displayName: string }
): EditEffect {
  if (stepsChanged(current.steps, next.steps)) {
    return { resetRatings: true, reason: "The steps changed, so existing ratings no longer apply." };
  }
  if (current.title !== next.title || current.displayName !== next.displayName) {
    return { resetRatings: false, reason: "Wording only — ratings are kept." };
  }
  return { resetRatings: false, reason: "No changes." };
}
