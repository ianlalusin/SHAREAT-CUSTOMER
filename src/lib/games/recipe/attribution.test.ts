import { describe, it, expect } from "vitest";
import { attributionFor, clampText, NAME_DISPLAY_MAX } from "@/lib/games/recipe/attribution";

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
    expect(attributionFor("SharEat", "SharEat")).toEqual({ name: "SharEat", store: "" });
  });

  it("ignores case and padding when comparing", () => {
    expect(attributionFor("SharEat", "  shareat ").store).toBe("");
  });

  /**
   * Regression: the name is clamped for display, but the comparison has to run
   * on the FULL value. Clamping first made "SharEat Kitchen" stop matching a
   * store of the same name, and the duplicate came back.
   */
  it("compares the full name even when the displayed one is clipped", () => {
    const a = attributionFor("SharEat Kitchen", "SharEat Kitchen");
    expect(a.store).toBe("");
    expect(a.name.length).toBeLessThanOrEqual(NAME_DISPLAY_MAX);
  });

  it("handles a recipe with no store at all", () => {
    expect(attributionFor("Ana", "")).toEqual({ name: "Ana", store: "" });
    expect(attributionFor("Ana", null)).toEqual({ name: "Ana", store: "" });
  });

  it("clamps a long name to the display cap", () => {
    expect(attributionFor("Bartholomew Higgins", "").name.length).toBeLessThanOrEqual(NAME_DISPLAY_MAX);
  });

  /** A card must never render "by:" followed by nothing. */
  it("always yields a name", () => {
    expect(attributionFor("", "SharEat Lipa").name).toBe("Guest");
    expect(attributionFor(null, null).name).toBe("Guest");
    expect(attributionFor("   ", "").name).toBe("Guest");
  });
});

describe("clampText", () => {
  it("leaves anything within the limit alone", () => {
    expect(clampText("Ana", 10)).toBe("Ana");
    expect(clampText("ExactlyTen", 10)).toBe("ExactlyTen");
  });

  it("ellipsises what is over, staying within the limit", () => {
    const out = clampText("Bartholomew", 10);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out.endsWith("…")).toBe(true);
  });

  it("survives a nonsense limit", () => {
    expect(clampText("Ana", 0).length).toBeLessThanOrEqual(2);
  });
});
