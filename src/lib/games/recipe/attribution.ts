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

export function attributionFor(
  displayName: string | null | undefined,
  storeName: string | null | undefined
): Attribution {
  const name = String(displayName ?? "").trim() || "Guest";
  const store = String(storeName ?? "").trim();
  const sameAsName = store.toLowerCase() === name.toLowerCase();
  return { name, store: store && !sameAsName ? store : "" };
}
