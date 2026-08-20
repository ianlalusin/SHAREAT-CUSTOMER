/**
 * The menu shapes the CUSTOMER app renders.
 *
 * These mirror what POS's `rebuildCustomerCatalog` writes to
 * `stores/{storeId}/catalogCache/main`. POS owns that document; this app is
 * strictly read-only with respect to it.
 *
 * Declared once, on purpose: this type used to be re-declared independently in
 * four files (the component, both API routes, and the preview dashboard), with
 * three slightly different shapes between them.
 */

export type CatalogOptionValue = {
  id: string;
  name: string;
  priceDelta: number;
};

export type CatalogOptionGroup = {
  id: string;
  name: string;
  selectionMode: "single" | "multi";
  required: boolean;
  minSelections?: number;
  maxSelections?: number;
  values: CatalogOptionValue[];
};

export type CatalogVariant = {
  productId: string;
  variantLabel: string;
  displayName: string;
  price: number;
  imageUrl: string | null;
  /** Whether a diner may order this themselves, rather than asking staff. */
  orderable: boolean;
  /**
   * This variant's OWN modifier set, present only when it differs from the
   * family's. Never merge it by hand — use `optionGroupsFor(entry, variant)`,
   * which both the menu UI and the order route read, so what a diner is shown
   * and what the server accepts cannot diverge.
   */
  optionGroups?: CatalogOptionGroup[];
  description?: string;
};

export type CatalogEntry = {
  productId: string;
  name: string;
  displayName: string;
  description?: string;
  subCategory: string;
  imageUrl: string | null;
  /** "group" is a variant family — one product, several sellable versions. */
  kind: "single" | "group";
  /** A family's price is its cheapest variant, shown as "from ₱X". */
  price: number;
  orderable: boolean;
  variants?: CatalogVariant[];
  optionGroups?: CatalogOptionGroup[];
};

export type CatalogCategory = {
  name: string;
  items: CatalogEntry[];
};

/**
 * The legacy flat row.
 *
 * POS still writes this alongside `categories` so a POS release cannot break a
 * CUSTOMER build that predates families. Retained here for the reverse case —
 * this build reading a snapshot written by a POS that has not shipped families
 * yet — and removable once both sides are past that window.
 */
export type CatalogItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  imageUrl: string | null;
};
