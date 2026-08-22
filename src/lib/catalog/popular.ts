import type { CatalogCategory } from "./types";

/**
 * Which menu items the store actually sells most.
 *
 * POS keeps a running tally on `stores/{storeId}/catalogCache/popularItems`,
 * incremented as receipts close. It is a SEPARATE document from the menu cache
 * on purpose: `catalogCache/main` is rebuilt only when someone edits the menu,
 * so a popularity figure folded into it would freeze at whenever that last
 * happened. Reading the tally at menu load keeps it current without a rebuild.
 *
 * Counts key on the INVENTORY DOC ID, which is what POS bill lines key on —
 * not the productId. The published catalog carries `inventoryId` on both
 * entries and variants for exactly this join, and a family matches when ANY of
 * its variants sells: an unli set whose Pork tier is the store's best seller is
 * popular, even though the family root has no inventory row of its own.
 */

export const POPULAR_LIMIT = 10;

/** The most-ordered inventory ids, highest first. Mirrors POS's topPopularIds. */
export function topPopularIds(
  counts: Record<string, unknown> | null | undefined,
  limit: number = POPULAR_LIMIT
): string[] {
  if (!counts || typeof counts !== "object") return [];

  return Object.entries(counts)
    .map(([id, raw]) => [id, Number(raw)] as const)
    .filter(([, n]) => Number.isFinite(n) && n > 0)
    // Ties break on the id so the group does not reshuffle between two reads of
    // the same data.
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, limit))
    .map(([id]) => id);
}

/**
 * Flag the entries whose inventory id is in `popularIds`.
 *
 * Returns new objects rather than mutating: the categories come straight from
 * projectCatalog and are handed to the client as-is.
 */
export function markPopular(
  categories: CatalogCategory[],
  popularIds: readonly string[]
): CatalogCategory[] {
  if (!popularIds.length) return categories;
  const wanted = new Set(popularIds);

  return categories.map((c) => ({
    ...c,
    items: c.items.map((item) => {
      const hit =
        (item.inventoryId != null && wanted.has(String(item.inventoryId))) ||
        (item.variants ?? []).some(
          (v) => v.inventoryId != null && wanted.has(String(v.inventoryId))
        );
      return hit ? { ...item, popular: true } : item;
    }),
  }));
}
