import { describe, it, expect } from "vitest";
import { buildTop, buildPopular, buildFresh, buildFeatured, buildFeed } from "@/lib/games/recipe/feed";
import type { RankableRecipe } from "@/lib/games/recipe/feed";
import { rankScore } from "@/lib/games/recipe/rank";
import type { RecipeStatus } from "@/lib/games/recipe/types";

function make(
  id: string,
  opts: Partial<{
    yuck: number; good: number; yummy: number;
    status: RecipeStatus; featured: boolean; publishedAtMs: number;
  }> = {}
): RankableRecipe {
  const yuck = opts.yuck ?? 0, good = opts.good ?? 0, yummy = opts.yummy ?? 0;
  const counts = { yuck, good, yummy, total: yuck + good + yummy };
  const scoreSum = good + yummy * 2;
  return {
    id, title: `Recipe ${id}`, displayName: "Ana", storeName: "SharEat Lipa",
    stepCount: 3, counts, rankScore: rankScore(counts, scoreSum),
    featured: opts.featured ?? false,
    publishedAtMs: opts.publishedAtMs ?? 1000,
    status: opts.status ?? "published",
  };
}

describe("buildTop", () => {
  it("excludes recipes without enough votes to mean anything", () => {
    const out = buildTop([make("a", { yummy: 4 }), make("b", { yummy: 5 })]);
    expect(out.map((r) => r.id)).toEqual(["b"]);
  });

  it("orders by rank, best first", () => {
    const out = buildTop([
      make("mid", { good: 10 }),
      make("best", { yummy: 10 }),
      make("worst", { yuck: 10 }),
    ]);
    expect(out.map((r) => r.id)).toEqual(["best", "mid", "worst"]);
  });

  it("honours the size cap", () => {
    const many = Array.from({ length: 60 }, (_, i) => make(`r${i}`, { yummy: 10 }));
    expect(buildTop(many).length).toBe(50);
    expect(buildTop(many, 3).length).toBe(3);
  });

  /**
   * The case a patch-in-place projection gets wrong. A pulled recipe is not a
   * low-ranked one — it can be the highest-scoring thing on the board.
   */
  it.each(["hidden", "rejected", "pending"] as RecipeStatus[])(
    "drops a %s recipe no matter how good its score",
    (status) => {
      const out = buildTop([make("pulled", { yummy: 500, status }), make("ok", { good: 5 })]);
      expect(out.map((r) => r.id)).toEqual(["ok"]);
    }
  );
});

describe("buildFresh", () => {
  it("orders by recency and ignores score entirely", () => {
    const out = buildFresh([
      make("old", { yummy: 100, publishedAtMs: 1 }),
      make("new", { yuck: 3, publishedAtMs: 999 }),
    ]);
    expect(out.map((r) => r.id)).toEqual(["new", "old"]);
  });

  /** Fresh is the discovery shelf — a brand-new recipe must be visible at once. */
  it("includes a recipe with no votes at all", () => {
    expect(buildFresh([make("brand-new")]).map((r) => r.id)).toEqual(["brand-new"]);
  });

  it("drops anything not published", () => {
    expect(buildFresh([make("p", { status: "pending" })])).toEqual([]);
  });
});

describe("buildFeatured", () => {
  it("takes only admin-pinned recipes", () => {
    const out = buildFeatured([
      make("pinned", { featured: true }),
      make("popular", { yummy: 999 }),
    ]);
    expect(out.map((r) => r.id)).toEqual(["pinned"]);
  });

  it("still drops a pinned recipe that was later hidden", () => {
    expect(buildFeatured([make("x", { featured: true, status: "hidden" })])).toEqual([]);
  });

  it("does not require votes", () => {
    expect(buildFeatured([make("x", { featured: true })]).length).toBe(1);
  });
});

describe("buildFeed", () => {
  it("lets one recipe sit on several shelves at once", () => {
    const feed = buildFeed([make("star", { yummy: 20, featured: true, publishedAtMs: 5 })], 42);
    expect(feed.top.map((r) => r.id)).toEqual(["star"]);
    expect(feed.fresh.map((r) => r.id)).toEqual(["star"]);
    expect(feed.featured.map((r) => r.id)).toEqual(["star"]);
    expect(feed.updatedAtMs).toBe(42);
  });

  it("never leaks the moderation status to a diner's payload", () => {
    const feed = buildFeed([make("a", { yummy: 9 })], 1);
    expect(feed.top[0]).not.toHaveProperty("status");
  });

  it("survives an empty collection", () => {
    expect(buildFeed([], 7)).toEqual({ top: [], popular: [], fresh: [], featured: [], updatedAtMs: 7 });
  });
});

describe("buildPopular", () => {
  it("orders by number of ratings, then score, then recency", () => {
    const out = buildPopular([
      make("same-old", { yummy: 3, publishedAtMs: 1 }),
      make("many-ok", { good: 12, publishedAtMs: 2 }),
      make("lower-score", { good: 3, publishedAtMs: 9 }),
      make("same-new", { yummy: 3, publishedAtMs: 8 }),
    ]);
    // 12 ratings beat 3; of the 3-rating recipes the higher score wins, and
    // identical score and turnout fall back to the newer recipe.
    expect(out.map((r) => r.id)).toEqual(["many-ok", "same-new", "same-old", "lower-score"]);
  });

  it("has no vote floor, but leaves out unrated and unpublished recipes", () => {
    const out = buildPopular([
      make("one", { yummy: 1 }),
      make("none"),
      make("hidden", { yummy: 40, status: "hidden" }),
    ]);
    expect(out.map((r) => r.id)).toEqual(["one"]);
  });

  it("is capped and never carries the moderation status", () => {
    const many = Array.from({ length: 5 }, (_, i) => make(`r${i}`, { yummy: i + 1 }));
    expect(buildPopular(many, 2)).toHaveLength(2);
    expect(buildPopular(many)[0]).not.toHaveProperty("status");
  });
});
