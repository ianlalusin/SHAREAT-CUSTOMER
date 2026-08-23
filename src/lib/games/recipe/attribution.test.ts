import { describe, it, expect } from "vitest";
import { attributionFor } from "@/lib/games/recipe/attribution";

describe("attributionFor", () => {
  it("keeps the store when it adds something", () => {
    expect(attributionFor("Ana", "SharEat Lipa")).toEqual({ name: "Ana", store: "SharEat Lipa" });
  });

  /**
   * The bug this exists for: house recipes are authored by "SharEat Kitchen"
   * and were also stamped with it as their store, so every card printed the
   * name twice.
   */
  it("drops a store that only repeats the author", () => {
    expect(attributionFor("SharEat Kitchen", "SharEat Kitchen"))
      .toEqual({ name: "SharEat Kitchen", store: "" });
  });

  it("ignores case and padding when comparing", () => {
    expect(attributionFor("SharEat Kitchen", "  shareat kitchen ").store).toBe("");
  });

  it("handles a recipe with no store at all", () => {
    expect(attributionFor("Ana", "")).toEqual({ name: "Ana", store: "" });
    expect(attributionFor("Ana", null)).toEqual({ name: "Ana", store: "" });
  });

  /** A card must never render "by:" followed by nothing. */
  it("always yields a name", () => {
    expect(attributionFor("", "SharEat Lipa").name).toBe("Guest");
    expect(attributionFor(null, null).name).toBe("Guest");
    expect(attributionFor("   ", "").name).toBe("Guest");
  });
});
