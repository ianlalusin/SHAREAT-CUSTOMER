import type {
  CatalogCategory,
  CatalogEntry,
  CatalogItem,
  CatalogOptionGroup,
  CatalogVariant,
} from "./types";

/**
 * Turns the raw `catalogCache/main` document into exactly what a diner's
 * browser is allowed to see.
 *
 * Both catalog routes — the real customer one and the admin Preview one — call
 * this, so the two can no longer drift apart the way they had (Preview used to
 * strip `isAvailable` while the customer route left it in).
 *
 * Two things it deliberately does:
 *
 * 1. **Whitelists every field.** Never spread the stored object through. The
 *    snapshot carries internal kitchen routing (`kitchenLocationId`) that the
 *    order route needs server-side and the browser has no business seeing.
 *
 * 2. **Tolerates a snapshot without families.** If POS has not yet shipped the
 *    family-aware builder for this store, `categories` is absent and we derive
 *    it from the flat `items` array. That keeps this build working against an
 *    older POS, the mirror of the compatibility POS keeps for older clients.
 */

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function optionGroups(raw: unknown): CatalogOptionGroup[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const groups = raw.map((g: any) => {
    const group: CatalogOptionGroup = {
      id: String(g?.id ?? ""),
      name: String(g?.name ?? ""),
      selectionMode: g?.selectionMode === "multi" ? "multi" : "single",
      required: !!g?.required,
      values: (Array.isArray(g?.values) ? g.values : []).map((v: any) => ({
        id: String(v?.id ?? ""),
        name: String(v?.name ?? ""),
        priceDelta: num(v?.priceDelta),
      })),
    };
    if (g?.minSelections != null) group.minSelections = num(g.minSelections);
    if (g?.maxSelections != null) group.maxSelections = num(g.maxSelections);
    return group;
  });
  const usable = groups.filter((g) => g.id && g.values.length > 0);
  return usable.length ? usable : undefined;
}

function variant(raw: any): CatalogVariant {
  const v: CatalogVariant = {
    productId: String(raw?.productId ?? ""),
    variantLabel: String(raw?.variantLabel ?? ""),
    displayName: String(raw?.displayName ?? ""),
    price: num(raw?.price),
    imageUrl: raw?.imageUrl ?? null,
    orderable: raw?.orderable === true,
  };
  if (raw?.description) v.description = String(raw.description);
  const groups = optionGroups(raw?.optionGroups);
  if (groups) v.optionGroups = groups;
  return v;
}

/**
 * The option groups in effect for a selection.
 *
 * A variant carries its own list only when it differs from the family's, so
 * this is a fallback, never a merge — POS already resolved parent ∪ variant ∪
 * store when it built the snapshot (`resolveOptionGroupIds` in
 * lib/server/catalog-shared.ts).
 *
 * Both the menu UI and `order-validation` call this, which is what guarantees
 * the diner is priced on exactly the list the server will accept.
 */
export function optionGroupsFor(
  entry: { optionGroups?: CatalogOptionGroup[] } | null | undefined,
  variant?: { optionGroups?: CatalogOptionGroup[] } | null
): CatalogOptionGroup[] {
  return variant?.optionGroups ?? entry?.optionGroups ?? [];
}

function entry(raw: any, categoryName: string): CatalogEntry {
  const kind = raw?.kind === "group" ? "group" : "single";
  const e: CatalogEntry = {
    productId: String(raw?.productId ?? ""),
    name: String(raw?.name ?? ""),
    displayName: String(raw?.displayName ?? raw?.name ?? ""),
    subCategory: String(raw?.subCategory ?? categoryName ?? ""),
    imageUrl: raw?.imageUrl ?? null,
    kind,
    price: num(raw?.price),
    orderable: raw?.orderable === true,
  };
  if (raw?.description) e.description = String(raw.description);

  if (kind === "group") {
    const variants = (Array.isArray(raw?.variants) ? raw.variants : [])
      .map(variant)
      .filter((v: CatalogVariant) => !!v.productId);
    e.variants = variants;
    // A family whose variants all fell away is not orderable, whatever the
    // stored flag says.
    e.orderable = e.orderable && variants.some((v: CatalogVariant) => v.orderable);
  }

  const groups = optionGroups(raw?.optionGroups);
  if (groups) e.optionGroups = groups;
  return e;
}

/** Legacy flat rows, for a snapshot written before families existed. */
function flatItems(raw: unknown): CatalogItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x: any) => ({
      id: String(x?.id ?? ""),
      name: String(x?.name ?? ""),
      category: String(x?.category ?? ""),
      price: num(x?.price),
      imageUrl: x?.imageUrl ?? null,
      isAvailable: x?.isAvailable,
    }))
    .filter((x) => !!x.id && (!!x.isAvailable || x.isAvailable === undefined))
    .map(({ id, name, category, price, imageUrl }) => ({ id, name, category, price, imageUrl }));
}

/** Builds `categories` out of flat rows, so an older snapshot still renders. */
function categoriesFromFlat(items: CatalogItem[]): CatalogCategory[] {
  const byCat = new Map<string, CatalogEntry[]>();
  for (const it of items) {
    const name = it.category || "Uncategorized";
    const arr = byCat.get(name) || [];
    arr.push({
      productId: it.id,
      name: it.name,
      displayName: it.name,
      subCategory: name,
      imageUrl: it.imageUrl,
      kind: "single",
      price: it.price,
      orderable: false, // an older snapshot carries no orderability at all
    });
    byCat.set(name, arr);
  }
  return [...byCat.entries()]
    .map(([name, arr]) => ({ name, items: arr.sort((a, b) => a.displayName.localeCompare(b.displayName)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function projectCatalog(cache: any): CatalogCategory[] {
  const raw = cache?.categories;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((c: any) => {
        const name = String(c?.name ?? "Uncategorized");
        const items = (Array.isArray(c?.items) ? c.items : [])
          .map((i: any) => entry(i, name))
          .filter((e: CatalogEntry) => !!e.productId);
        return { name, items };
      })
      .filter((c: CatalogCategory) => c.items.length > 0);
  }
  return categoriesFromFlat(flatItems(cache?.items));
}
