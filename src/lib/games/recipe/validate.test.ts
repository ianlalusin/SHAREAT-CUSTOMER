import { describe, it, expect } from "vitest";
import {
  validateRecipeDraft, hasFreeText, QUICK_TITLES,
  MAX_STEPS, MAX_TITLE_LEN, MAX_NOTE_LEN,
} from "@/lib/games/recipe/validate";
import { findBlockedWords, hasBlockedWords } from "@/lib/games/recipe/text-guard";

const catalogStep = (itemName: string, catalogItemId = "cat_1") => ({
  kind: "catalog" as const, itemName, catalogItemId,
});

const quickDraft = (over: Record<string, unknown> = {}) => ({
  title: QUICK_TITLES[0],
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

    const longNote = [{ kind: "free", itemName: "Pork", note: "x".repeat(MAX_NOTE_LEN + 1) }, catalogStep("Rice")];
    expect(validateRecipeDraft(quickDraft({ steps: longNote })).ok).toBe(false);
  });

  it("rejects a step with nothing in it", () => {
    expect(validateRecipeDraft(quickDraft({ steps: [catalogStep(""), catalogStep("Rice")] })).ok).toBe(false);
  });

  it("collapses whitespace rather than storing it", () => {
    const r = validateRecipeDraft(quickDraft({ steps: [catalogStep("  Pork   Belly "), catalogStep("Rice")] }));
    expect(r.ok && r.draft.steps[0].itemName).toBe("Pork Belly");
  });
});

describe("validateRecipeDraft — review path", () => {
  it("classifies a catalog-only recipe with a template title as quick", () => {
    const r = validateRecipeDraft(quickDraft());
    expect(r.ok && r.mode).toBe("quick");
  });

  it.each([
    ["a custom title", { title: "My Own Title" }],
    ["a custom display name", { displayName: "Ana" }],
    ["a free step", { steps: [{ kind: "free", itemName: "Anything" }, catalogStep("Rice")] }],
    ["a step note", { steps: [{ ...catalogStep("Pork"), note: "dip twice" }, catalogStep("Rice")] }],
    ["a step verb", { steps: [{ ...catalogStep("Pork"), verb: "grill" }, catalogStep("Rice")] }],
  ])("sends a recipe with %s to human review", (_label, over) => {
    const r = validateRecipeDraft(quickDraft(over));
    expect(r.ok && r.mode).toBe("custom");
  });

  /**
   * A "catalog" step with no id is not verifiable against any menu — it is just
   * text. It must not buy a free pass into the auto-publish path.
   */
  it("treats a catalog step with no id as free text", () => {
    const r = validateRecipeDraft(quickDraft({
      steps: [{ kind: "catalog", itemName: "Totally Real Menu Item" }, catalogStep("Rice")],
    }));
    expect(r.ok && r.mode).toBe("custom");
    expect(r.ok && r.draft.steps[0].kind).toBe("free");
  });

  it("agrees with hasFreeText on the same draft", () => {
    const r = validateRecipeDraft(quickDraft());
    expect(r.ok && hasFreeText(r.draft)).toBe(false);
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
