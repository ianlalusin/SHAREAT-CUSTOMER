/**
 * Who a recipe is credited to, and where it came from.
 *
 * These are two different things that are often the same string — a house
 * recipe is authored by "SharEat Kitchen" and belongs to no branch — and
 * printing both unguarded produced "SharEat Kitchen · SharEat Kitchen" on every
 * card. The store is supporting detail: it only earns a place when it actually
 * says something the name did not.
 */
export type Attribution = {
  /** Always present — never blank, never the table's booking name. */
  name: string;
  /** Empty when there is no store, or when it would just repeat the name. */
  store: string;
};

/** Longest heading a card will render: the title plus the author's name. */
export const TITLE_DISPLAY_MAX = 30;
export const NAME_DISPLAY_MAX = 10;

/**
 * Trim for display only.
 *
 * The caps were tightened after recipes had already been written, so older rows
 * can still be longer than the composer now allows. Clamping here keeps a
 * legacy row from pushing the heading onto a third line.
 */
export function clampText(text: string, max: number): string {
  const t = String(text ?? "").trim();
  return t.length <= max ? t : `${t.slice(0, Math.max(1, max - 1))}…`;
}

export function attributionFor(
  displayName: string | null | undefined,
  storeName: string | null | undefined
): Attribution {
  // Compare the FULL names, then clamp. Clamping first turned
  // "SharEat Kitchen" into "SharEat K…", which no longer matched the store of
  // the same name — and the duplicate the whole function exists to remove came
  // straight back.
  const full = String(displayName ?? "").trim() || "Guest";
  const store = String(storeName ?? "").trim();
  const sameAsName = store.toLowerCase() === full.toLowerCase();
  return { name: clampText(full, NAME_DISPLAY_MAX), store: store && !sameAsName ? store : "" };
}
