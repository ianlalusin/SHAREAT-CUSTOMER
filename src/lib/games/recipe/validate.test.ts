import { describe, it, expect } from "vitest";
import {
  validateRecipeDraft, MAX_STEPS, MAX_TITLE_LEN, MAX_STEP_LEN,
} from "@/lib/games/recipe/validate";
import { findBlockedWords, hasBlockedWords } from "@/lib/games/recipe/text-guard";

const catalogStep = (itemName: string, catalogItemId = "cat_1") => ({
  kind: "catalog" as const, itemName, catalogItemId,
});

const quickDraft = (over: Record<string, unknown> = {}) => ({
  title: "My Wrap",
  displayName: "",
  steps: [catalogStep("Pork Belly"), catalogStep("Lettuce", "cat_2")],
  ...over,
});

describe("validateRecipeDraft — shape", () => {
  it("accepts a minimal valid draft", () => {
    const r = validateRecipeDraft(quickDraft());
    expect(r.ok).toBe(true);
  });

  it("requires a title and at least two steps", () => {
    expect(validateRecipeDraft(quickDraft({ title: "  " })).ok).toBe(false);
    expect(validateRecipeDraft(quickDraft({ steps: [catalogStep("Pork")] })).ok).toBe(false);
    expect(validateRecipeDraft(quickDraft({ steps: [] })).ok).toBe(false);
  });

  it("caps the step count and every text length", () => {
    const many = Array.from({ length: MAX_STEPS + 1 }, () => catalogStep("Pork"));
    expect(validateRecipeDraft(quickDraft({ steps: many })).ok).toBe(false);
    expect(validateRecipeDraft(quickDraft({ title: "x".repeat(MAX_TITLE_LEN + 1) })).ok).toBe(false);
    expect(validateRecipeDraft(quickDraft({ displayName: "x".repeat(21) })).ok).toBe(false);

    const longStep = ["x".repeat(MAX_STEP_LEN + 1), "ok"];
    expect(validateRecipeDraft(quickDraft({ steps: longStep })).ok).toBe(false);
  });

  it("rejects a step with nothing in it", () => {
    expect(validateRecipeDraft(quickDraft({ steps: [catalogStep(""), catalogStep("Rice")] })).ok).toBe(false);
  });

  it("collapses whitespace rather than storing it", () => {
    const r = validateRecipeDraft(quickDraft({ steps: [catalogStep("  Pork   Belly "), catalogStep("Rice")] }));
    expect(r.ok && r.draft.steps[0].itemName).toBe("Pork Belly");
  });
});

describe("validateRecipeDraft — step shapes", () => {
  /**
   * The composer sends plain strings; the admin editor and the house recipes
   * send objects. Both have to land as the same stored shape.
   */
  it("accepts a bare string as a step", () => {
    const r = validateRecipeDraft({ title: "T", displayName: "", steps: ["Grill the pork", "Wrap it"] });
    expect(r.ok).toBe(true);
    expect(r.ok && r.draft.steps[0]).toEqual({ kind: "free", itemName: "Grill the pork" });
  });

  it("keeps a step with a real catalog id as a catalog step", () => {
    const r = validateRecipeDraft(quickDraft());
    expect(r.ok && r.draft.steps[0].kind).toBe("catalog");
  });

  /** Without an id there is nothing to verify against a menu — it is just text. */
  it("treats a catalog step with no id as free text", () => {
    const r = validateRecipeDraft(quickDraft({
      steps: [{ kind: "catalog", itemName: "Totally Real Menu Item" }, catalogStep("Rice")],
    }));
    expect(r.ok && r.draft.steps[0].kind).toBe("free");
  });

  it("gives a free-text step room to be an actual instruction", () => {
    const sentence = "Wrap the pork belly in lettuce with garlic and a little ssamjang";
    expect(sentence.length).toBeGreaterThan(40);
    const r = validateRecipeDraft({ title: "T", displayName: "", steps: [sentence, "Eat it"] });
    expect(r.ok).toBe(true);
  });

  it("still caps a runaway step", () => {
    const r = validateRecipeDraft({ title: "T", displayName: "", steps: ["x".repeat(MAX_STEP_LEN + 1), "y"] });
    expect(r.ok).toBe(false);
  });
});

describe("text-guard", () => {
  it("catches blocked words in either language", () => {
    expect(hasBlockedWords("this is shit")).toBe(true);
    expect(hasBlockedWords("PUTANGINA naman")).toBe(true);
    expect(hasBlockedWords("p u t a")).toBe(false);
  });

  it("matches on word boundaries, not substrings", () => {
    // The Scunthorpe case: an innocent word containing a blocked one.
    expect(hasBlockedWords("assassin")).toBe(false);
    expect(hasBlockedWords("Dickinson")).toBe(false);
    expect(hasBlockedWords("gagaling na siya")).toBe(false);
  });

  it("still trips through punctuation and accents", () => {
    expect(hasBlockedWords("what the f-u-c-k")).toBe(false);
    expect(hasBlockedWords("what the (fuck)!")).toBe(true);
    expect(findBlockedWords("puta!!! gago")).toEqual(expect.arrayContaining(["puta", "gago"]));
  });

  it("passes ordinary recipe text", () => {
    expect(hasBlockedWords("Wrap the pork belly in lettuce with garlic")).toBe(false);
    expect(hasBlockedWords("")).toBe(false);
  });

  it("blocks a draft containing one", () => {
    expect(validateRecipeDraft(quickDraft({ title: "gago recipe" })).ok).toBe(false);
  });
});
