import { describe, it, expect } from "vitest";
import { markPopular, topPopularIds, POPULAR_LIMIT } from "./popular";
import type { CatalogCategory } from "./types";

const cats = (items: any[]): CatalogCategory[] => [{ name: "Sides", items }];

const item = (over: Record<string, any> = {}): any => ({
  productId: "p1",
  inventoryId: "inv_kimbap",
  name: "Kimbap",
  displayName: "Kimbap",
  subCategory: "Sides",
  imageUrl: null,
  kind: "single",
  price: 120,
  orderable: true,
  ...over,
});

describe("topPopularIds", () => {
  it("orders by count, highest first", () => {
    expect(topPopularIds({ a: 3, b: 9, c: 5 })).toEqual(["b", "c", "a"]);
  });

  it("drops never-ordered and refunded-to-nothing items", () => {
    expect(topPopularIds({ a: 0, b: -2, c: 1 })).toEqual(["c"]);
  });

  it("breaks ties by id so the group does not reshuffle", () => {
    expect(topPopularIds({ z: 2, a: 2 })).toEqual(["a", "z"]);
  });

  it("caps at the display limit and survives junk", () => {
    const many = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`i${String(i).padStart(2, "0")}`, 30 - i])
    );
    expect(topPopularIds(many).length).toBe(POPULAR_LIMIT);
    expect(topPopularIds(null)).toEqual([]);
    expect(topPopularIds({ a: "junk" })).toEqual([]);
  });
});

describe("markPopular", () => {
  it("flags an item whose inventory id sold well", () => {
    const [c] = markPopular(cats([item()]), ["inv_kimbap"]);
    expect(c.items[0].popular).toBe(true);
  });

  it("leaves everything else alone", () => {
    const [c] = markPopular(cats([item()]), ["inv_other"]);
    expect(c.items[0].popular).toBeUndefined();
  });

  it("matches on the INVENTORY id, never the productId", () => {
    // The tally keys on POS bill lines, which use the inventory doc id. Joining
    // on productId would silently match nothing.
    const [c] = markPopular(cats([item()]), ["p1"]);
    expect(c.items[0].popular).toBeUndefined();
  });

  it("flags a family when any variant sells", () => {
    // An unli set whose Pork tier is the best seller is popular, even though
    // the family root carries no inventory row of its own.
    const family = item({
      inventoryId: null,
      kind: "group",
      variants: [
        { productId: "v1", inventoryId: "inv_pork", displayName: "Pork", price: 1, orderable: true },
        { productId: "v2", inventoryId: "inv_beef", displayName: "Beef", price: 1, orderable: true },
      ],
    });
    const [c] = markPopular(cats([family]), ["inv_pork"]);
    expect(c.items[0].popular).toBe(true);
  });

  it("does not mutate the input", () => {
    const input = cats([item()]);
    markPopular(input, ["inv_kimbap"]);
    expect(input[0].items[0].popular).toBeUndefined();
  });

  it("is a no-op when nothing has sold yet", () => {
    const input = cats([item()]);
    expect(markPopular(input, [])).toBe(input);
  });
});
