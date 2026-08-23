import { hasBlockedWords } from "./text-guard";
import type { RecipeStep } from "./types";

/**
 * What a diner may publish.
 *
 * **Every recipe is written in the author's own words and every recipe is
 * reviewed.** There is no fast path. An earlier version let a recipe assembled
 * purely from menu items publish immediately, on the grounds that it contained
 * no diner-authored text for a reviewer to catch; that was removed on Ian's
 * call. Nothing here may create a published recipe — see `publishRecipe`.
 *
 * The caps stay tight. Every character is one a stranger reads under the
 * SharEat name, and a small surface is both easier to review and harder to
 * misuse — while still leaving room to actually write a step ("Wrap the pork
 * belly in lettuce with garlic" does not fit in 40 characters).
 */
export const MAX_STEPS = 8;
export const MIN_STEPS = 2;
export const MAX_TITLE_LEN = 30;
export const MAX_DISPLAY_NAME_LEN = 10;
export const MAX_STEP_LEN = 120;
export const MAX_NOTE_LEN = 60;

export type RecipeDraft = {
  title: string;
  displayName: string;
  steps: RecipeStep[];
};

export type ValidationResult = { ok: true; draft: RecipeDraft } | { ok: false; error: string };

const clean = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ");

export function validateRecipeDraft(input: {
  title?: unknown;
  displayName?: unknown;
  steps?: unknown;
}): ValidationResult {
  const title = clean(input.title);
  const displayName = clean(input.displayName);

  if (!title) return { ok: false, error: "Give your recipe a name." };
  if (title.length > MAX_TITLE_LEN) {
    return { ok: false, error: `Keep the recipe name under ${MAX_TITLE_LEN} characters.` };
  }
  if (displayName.length > MAX_DISPLAY_NAME_LEN) {
    return { ok: false, error: `Keep your name under ${MAX_DISPLAY_NAME_LEN} characters.` };
  }

  const rawSteps = Array.isArray(input.steps) ? input.steps : [];
  if (rawSteps.length < MIN_STEPS) {
    return { ok: false, error: `Add at least ${MIN_STEPS} steps.` };
  }
  if (rawSteps.length > MAX_STEPS) {
    return { ok: false, error: `That is more than ${MAX_STEPS} steps.` };
  }

  const steps: RecipeStep[] = [];
  for (const raw of rawSteps) {
    const r = (raw ?? {}) as Record<string, unknown>;
    // A step may arrive as a bare string from the composer, or as the fuller
    // object shape the house recipes and the admin editor use.
    const itemName = clean(typeof raw === "string" ? raw : r.itemName);
    const verb = clean(r.verb);
    const note = clean(r.note);
    const catalogItemId = clean(r.catalogItemId);

    if (!itemName) return { ok: false, error: "Every step needs something in it." };
    if (itemName.length > MAX_STEP_LEN) {
      return { ok: false, error: `Keep each step under ${MAX_STEP_LEN} characters.` };
    }
    if (note.length > MAX_NOTE_LEN) {
      return { ok: false, error: `Step notes must be under ${MAX_NOTE_LEN} characters.` };
    }

    steps.push({
      // Only a step carrying a real catalog id can claim to be one; anything
      // else is the diner's own text however it was labelled.
      kind: catalogItemId ? "catalog" : "free",
      itemName,
      ...(verb ? { verb } : {}),
      ...(note ? { note } : {}),
      ...(catalogItemId ? { catalogItemId } : {}),
    });
  }

  const draft: RecipeDraft = { title, displayName, steps };

  const surfaces = [title, displayName, ...steps.flatMap((s) => [s.itemName, s.verb ?? "", s.note ?? ""])];
  if (surfaces.some(hasBlockedWords)) {
    return { ok: false, error: "Please take out the bad words and try again." };
  }

  return { ok: true, draft };
}
