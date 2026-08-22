import { describe, it, expect } from "vitest";
import { stepsChanged, effectOfEdit } from "@/lib/games/recipe/edit";
import type { RecipeStep } from "@/lib/games/recipe/types";

const step = (over: Partial<RecipeStep> = {}): RecipeStep => ({
  kind: "catalog",
  itemName: "Pork Belly",
  catalogItemId: "cat_1",
  ...over,
});

const base = { steps: [step(), step({ itemName: "Lettuce" })], title: "My Wrap", displayName: "Ana" };

describe("stepsChanged", () => {
  it("sees no change in an identical list", () => {
    expect(stepsChanged(base.steps, [step(), step({ itemName: "Lettuce" })])).toBe(false);
  });

  it("catches a changed item, note, verb or kind", () => {
    expect(stepsChanged(base.steps, [step({ itemName: "Beef" }), step({ itemName: "Lettuce" })])).toBe(true);
    expect(stepsChanged(base.steps, [step({ note: "grill it" }), step({ itemName: "Lettuce" })])).toBe(true);
    expect(stepsChanged(base.steps, [step({ verb: "wrap" }), step({ itemName: "Lettuce" })])).toBe(true);
    expect(stepsChanged(base.steps, [step({ kind: "free" }), step({ itemName: "Lettuce" })])).toBe(true);
  });

  it("catches added, removed and reordered steps", () => {
    expect(stepsChanged(base.steps, [step()])).toBe(true);
    expect(stepsChanged(base.steps, [...base.steps, step({ itemName: "Rice" })])).toBe(true);
    expect(stepsChanged(base.steps, [step({ itemName: "Lettuce" }), step()])).toBe(true);
  });

  /**
   * catalogItemId is metadata a diner never sees. Re-linking a step to the same
   * item under a new id must not cost the recipe its ratings.
   */
  it("ignores a catalog id change when the visible step is the same", () => {
    expect(
      stepsChanged(base.steps, [step({ catalogItemId: "cat_999" }), step({ itemName: "Lettuce" })])
    ).toBe(false);
  });

  it("ignores surrounding whitespace", () => {
    expect(
      stepsChanged(base.steps, [step({ itemName: "  Pork Belly  " }), step({ itemName: "Lettuce" })])
    ).toBe(false);
  });

  it("treats an empty or missing list as empty", () => {
    expect(stepsChanged(null, [])).toBe(false);
    expect(stepsChanged(undefined, base.steps)).toBe(true);
  });
});

describe("effectOfEdit", () => {
  it("resets ratings when the instructions change", () => {
    const out = effectOfEdit(base, { ...base, steps: [step({ itemName: "Beef" })] });
    expect(out.resetRatings).toBe(true);
  });

  /** A typo fix must not cost an author their score, or nobody fixes typos. */
  it("keeps ratings for a title or author-name fix", () => {
    expect(effectOfEdit(base, { ...base, title: "My Wrapp" }).resetRatings).toBe(false);
    expect(effectOfEdit(base, { ...base, displayName: "Anna" }).resetRatings).toBe(false);
  });

  it("reports a no-op as a no-op", () => {
    expect(effectOfEdit(base, { ...base }).reason).toBe("No changes.");
  });

  it("resets when the steps change even if the wording changed too", () => {
    const out = effectOfEdit(base, { title: "New", displayName: "Bee", steps: [step({ itemName: "Beef" })] });
    expect(out.resetRatings).toBe(true);
  });
});
