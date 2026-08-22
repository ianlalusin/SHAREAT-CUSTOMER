import { describe, it, expect } from "vitest";
import { projectCatalog } from "./project";

const cache = (items: any[]) => ({
  categories: [{ name: "Sides", items }],
});

const item = (over: Record<string, any> = {}) => ({
  productId: "p1",
  name: "Kimbap",
  displayName: "Kimbap",
  kind: "single",
  price: 120,
  orderable: true,
  ...over,
});

describe("popular survives the catalog projection", () => {
  it("carries the flag through", () => {
    // The projection is a whitelist. A field POS publishes but that is not
    // copied never reaches the menu, so the Popular chip would never appear
    // and the feature would ship doing nothing.
    const [cat] = projectCatalog(cache([item({ popular: true })]));
    expect(cat.items[0].popular).toBe(true);
  });

  it("omits it rather than publishing false", () => {
    const [cat] = projectCatalog(cache([item()]));
    expect(cat.items[0].popular).toBeUndefined();
  });

  it("ignores a non-true value", () => {
    for (const v of ["true", 1, {}, null]) {
      const [cat] = projectCatalog(cache([item({ popular: v })]));
      expect(cat.items[0].popular).toBeUndefined();
    }
  });

  it("carries it on a variant family too", () => {
    const [cat] = projectCatalog(
      cache([
        item({
          kind: "group",
          popular: true,
          variants: [{ productId: "v1", displayName: "Pork", price: 120, orderable: true }],
        }),
      ])
    );
    expect(cat.items[0].popular).toBe(true);
  });

  it("leaves a snapshot written before the flag existed untouched", () => {
    // Every store is in this state until its catalog is next republished.
    const [cat] = projectCatalog(cache([item()]));
    expect(cat.items[0].popular).toBeUndefined();
    expect(cat.items[0].displayName).toBe("Kimbap");
  });
});
