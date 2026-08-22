/** "Paano ka mag-samgyup" — shared types. Pure; no firebase imports. */

export type Verdict = "yuck" | "good" | "yummy";

/** Points per verdict. Integers so repeated addition cannot drift. */
export const VERDICT_POINTS: Record<Verdict, number> = { yuck: 0, good: 1, yummy: 2 };
export const MAX_VERDICT_POINTS = 2;

export type RecipeStatus = "pending" | "published" | "rejected" | "hidden";

export type RecipeStep = {
  kind: "catalog" | "free";
  /**
   * REQUIRED and authoritative for display, snapshotted at publish time.
   *
   * Recipes travel between branches; `catalogItemId` is scoped to the author's
   * store and means nothing at another one. Never render from the id.
   */
  itemName: string;
  verb?: string;
  note?: string;
  /** Advisory only — usable when the VIEWER's store happens to carry this id. */
  catalogItemId?: string;
};

export type RecipeCounts = { yuck: number; good: number; yummy: number; total: number };

export const EMPTY_COUNTS: RecipeCounts = { yuck: 0, good: 0, yummy: 0, total: 0 };

/** The small shape the feed projection stores — never the whole recipe. */
export type RecipeCard = {
  id: string;
  title: string;
  displayName: string;
  storeName: string;
  stepCount: number;
  counts: RecipeCounts;
  rankScore: number;
  featured: boolean;
  publishedAtMs: number;
};

export type RecipeFeed = {
  top: RecipeCard[];
  fresh: RecipeCard[];
  featured: RecipeCard[];
  updatedAtMs: number;
};

export const EMPTY_FEED: RecipeFeed = { top: [], fresh: [], featured: [], updatedAtMs: 0 };
