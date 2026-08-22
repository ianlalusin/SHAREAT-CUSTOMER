import { hasBlockedWords } from "./text-guard";
import type { RecipeStep } from "./types";

/**
 * What a diner may publish, and which review path it takes.
 *
 * The caps are deliberately tight. Every character of free text is a character
 * a stranger reads under the SharEat name, and a small surface is both easier
 * to review and harder to misuse. They also keep the composer usable one-handed
 * at a table.
 */
export const MAX_STEPS = 8;
export const MIN_STEPS = 2;
export const MAX_TITLE_LEN = 40;
export const MAX_DISPLAY_NAME_LEN = 20;
export const MAX_NOTE_LEN = 60;
export const MAX_ITEM_NAME_LEN = 40;
export const MAX_VERB_LEN = 20;

/**
 * Titles for the Quick path. Fixed, so a Quick recipe contains no diner-authored
 * text at all and can publish without waiting for a human.
 */
export const QUICK_TITLES = [
  "My Samgyup Ritual",
  "The Classic Wrap",
  "Spicy Overload",
  "Cheese Everything",
  "The Sweet & Savory",
  "Grill Master's Way",
  "Beginner Friendly",
  "For the Brave",
] as const;

export type RecipeMode = "quick" | "custom";

export type RecipeDraft = {
  title: string;
  displayName: string;
  steps: RecipeStep[];
};

export type ValidationResult =
  | { ok: true; mode: RecipeMode; draft: RecipeDraft }
  | { ok: false; error: string };

const clean = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ");

/**
 * Whether a draft contains ANY diner-authored text.
 *
 * This is the whole basis of the two review paths, so it errs toward "yes":
 * a free step, a note, a title that is not one of the fixed ones, or a custom
 * display name all count. A recipe assembled purely from catalog items and a
 * template title has nothing for a reviewer to catch, so it goes straight out;
 * anything else waits for a human.
 */
export function hasFreeText(draft: RecipeDraft): boolean {
  if (!(QUICK_TITLES as readonly string[]).includes(draft.title)) return true;
  if (draft.displayName) return true;
  return draft.steps.some(
    (s) => s.kind === "free" || !!clean(s.note) || !!clean(s.verb)
  );
}

export function validateRecipeDraft(input: {
  title?: unknown;
  displayName?: unknown;
  steps?: unknown;
}): ValidationResult {
  const title = clean(input.title);
  const displayName = clean(input.displayName);

  if (!title) return { ok: false, error: "Give your recipe a name." };
  if (title.length > MAX_TITLE_LEN) {
    return { ok: false, error: `Keep the name under ${MAX_TITLE_LEN} characters.` };
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
    const kind = r.kind === "free" ? "free" : "catalog";
    const itemName = clean(r.itemName);
    const verb = clean(r.verb);
    const note = clean(r.note);
    const catalogItemId = clean(r.catalogItemId);

    if (!itemName) return { ok: false, error: "Every step needs something in it." };
    if (itemName.length > MAX_ITEM_NAME_LEN) {
      return { ok: false, error: `Step text must be under ${MAX_ITEM_NAME_LEN} characters.` };
    }
    if (verb.length > MAX_VERB_LEN) {
      return { ok: false, error: `Step actions must be under ${MAX_VERB_LEN} characters.` };
    }
    if (note.length > MAX_NOTE_LEN) {
      return { ok: false, error: `Step notes must be under ${MAX_NOTE_LEN} characters.` };
    }
    // A catalog step without an id is really a free step; classify it honestly
    // so it cannot slip into the auto-publish path.
    const resolvedKind: RecipeStep["kind"] = kind === "catalog" && catalogItemId ? "catalog" : "free";

    steps.push({
      kind: resolvedKind,
      itemName,
      ...(verb ? { verb } : {}),
      ...(note ? { note } : {}),
      ...(resolvedKind === "catalog" ? { catalogItemId } : {}),
    });
  }

  const draft: RecipeDraft = { title, displayName, steps };

  const blockedIn = [title, displayName, ...steps.flatMap((s) => [s.itemName, s.verb ?? "", s.note ?? ""])];
  if (blockedIn.some(hasBlockedWords)) {
    return { ok: false, error: "Please take out the bad words and try again." };
  }

  return { ok: true, mode: hasFreeText(draft) ? "custom" : "quick", draft };
}
