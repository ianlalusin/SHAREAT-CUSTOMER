/**
 * Turns what a diner tapped into priced, kitchen-routable order lines — or a
 * refusal.
 *
 * The catalog snapshot is the price authority. The client sends ids and
 * quantities only; every peso is recomputed here from
 * `stores/{storeId}/catalogCache/main`, so a tampered request cannot set its
 * own price, and the diner is quoted exactly what the store published.
 *
 * This works on the RAW snapshot (the one carrying internal kitchen routing),
 * not the browser-facing projection — which is why `kitchenLocationId` is in
 * the snapshot at all.
 */

export type OrderRequestModifier = { groupId: string; valueId: string };

export type OrderRequestLine = {
  /** The family root for a variant order, or the product itself for a single. */
  productId: string;
  variantId?: string | null;
  qty: number;
  note?: string;
  modifiers?: OrderRequestModifier[];
};

export type ResolvedModifier = {
  groupId: string;
  groupName: string;
  valueId: string;
  valueName: string;
  priceDelta: number;
};

export type ResolvedOrderLine = {
  /** The sellable SKU: the variant when there is one, else the product. */
  itemId: string;
  itemName: string;
  category: string | null;
  /** Base price, excluding modifiers — matches `sessionBillLines.unitPrice`. */
  unitPrice: number;
  modifiers: ResolvedModifier[] | null;
  modifiersText: string | null;
  modifiersTotal: number | null;
  qty: number;
  note: string | null;
  kitchenLocationId: string;
  kitchenLocationName: string | null;
  /** POS's own line-id scheme, so customer and staff orders merge onto one line. */
  lineId: string;
};

export type ResolveResult =
  | { ok: true; lines: ResolvedOrderLine[] }
  | { ok: false; error: string; status: number };

/** Quantity a single order line may carry. Guards typos and scripted abuse. */
export const MAX_QTY_PER_LINE = 20;
/** Distinct lines one submission may carry. */
export const MAX_LINES_PER_ORDER = 20;

function fail(error: string, status = 400): ResolveResult {
  return { ok: false, error, status };
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * POS's line id: `addon_{itemId}_{basePrice}` plus a hash of the chosen
 * modifier values when there are any. Same item with different modifier picks
 * lands on separate lines; identical picks merge — including with a line a
 * cashier created from the POS add-on modal.
 */
export function buildLineId(itemId: string, unitPrice: number, modifiers: ResolvedModifier[] | null): string {
  const modHash = modifiers?.length
    ? modifiers.map((m) => m.valueId).sort().join("-")
    : "";
  return modHash ? `addon_${itemId}_${unitPrice}_${modHash}` : `addon_${itemId}_${unitPrice}`;
}

type RawVariant = {
  productId?: string;
  displayName?: string;
  price?: number;
  orderable?: boolean;
  kitchenLocationId?: string | null;
  kitchenLocationName?: string | null;
};

type RawEntry = {
  productId?: string;
  displayName?: string;
  subCategory?: string;
  kind?: string;
  price?: number;
  orderable?: boolean;
  kitchenLocationId?: string | null;
  kitchenLocationName?: string | null;
  variants?: RawVariant[];
  optionGroups?: any[];
};

function indexEntries(snapshot: any): Map<string, RawEntry> {
  const byId = new Map<string, RawEntry>();
  const categories = Array.isArray(snapshot?.categories) ? snapshot.categories : [];
  for (const cat of categories) {
    for (const item of Array.isArray(cat?.items) ? cat.items : []) {
      if (item?.productId) byId.set(String(item.productId), item as RawEntry);
    }
  }
  return byId;
}

/**
 * Validates the diner's modifier picks against the item's published option
 * groups, and prices them.
 *
 * Rejects rather than silently dropping: an unknown value, a required group
 * left empty, or two picks in a single-select group all mean the client and the
 * catalog disagree, and guessing which one is right would mis-price the order.
 */
function resolveModifiers(
  entry: RawEntry,
  picks: OrderRequestModifier[],
  itemName: string
): { ok: true; modifiers: ResolvedModifier[] } | { ok: false; error: string } {
  const groups = Array.isArray(entry.optionGroups) ? entry.optionGroups : [];
  const byGroupId = new Map<string, any>(groups.map((g: any) => [String(g?.id), g]));
  const resolved: ResolvedModifier[] = [];
  const pickedByGroup = new Map<string, number>();

  for (const pick of picks) {
    const groupId = String(pick?.groupId || "");
    const valueId = String(pick?.valueId || "");
    const group = byGroupId.get(groupId);
    if (!group) return { ok: false, error: `"${itemName}" has no option group here.` };

    const value = (Array.isArray(group.values) ? group.values : []).find(
      (v: any) => String(v?.id) === valueId
    );
    if (!value) return { ok: false, error: `That option is no longer available for "${itemName}".` };

    const count = (pickedByGroup.get(groupId) ?? 0) + 1;
    pickedByGroup.set(groupId, count);

    if (group.selectionMode !== "multi" && count > 1) {
      return { ok: false, error: `Pick only one ${group.name} for "${itemName}".` };
    }
    const max = group.maxSelections != null ? num(group.maxSelections) : null;
    if (max != null && max > 0 && count > max) {
      return { ok: false, error: `Pick at most ${max} ${group.name} for "${itemName}".` };
    }

    resolved.push({
      groupId,
      groupName: String(group.name || ""),
      valueId,
      valueName: String(value.name || ""),
      priceDelta: num(value.priceDelta),
    });
  }

  for (const group of groups) {
    const groupId = String(group?.id);
    const count = pickedByGroup.get(groupId) ?? 0;
    const min = group?.required ? Math.max(1, num(group.minSelections) || 1) : num(group?.minSelections);
    if (min > 0 && count < min) {
      return { ok: false, error: `Choose ${group.name} for "${itemName}".` };
    }
  }

  return { ok: true, modifiers: resolved };
}

/**
 * Resolves every requested line, or refuses the whole order.
 *
 * All-or-nothing on purpose: a partially-accepted order would put food in the
 * kitchen that the diner never confirmed the price of.
 */
export function resolveOrderLines(snapshot: any, requested: unknown): ResolveResult {
  if (snapshot?.orderingEnabled !== true) {
    return fail("Ordering from your phone isn't available right now — please ask our staff.", 403);
  }

  const lines = Array.isArray(requested) ? requested : [];
  if (!lines.length) return fail("Your order is empty.");
  if (lines.length > MAX_LINES_PER_ORDER) return fail("That's too many items for one order.");

  const byId = indexEntries(snapshot);
  const resolved: ResolvedOrderLine[] = [];

  for (const raw of lines as OrderRequestLine[]) {
    const productId = String(raw?.productId || "");
    const variantId = raw?.variantId ? String(raw.variantId) : "";
    const qty = Math.floor(num(raw?.qty));

    if (!productId) return fail("Invalid item in your order.");
    if (qty < 1) return fail("Quantity must be at least 1.");
    if (qty > MAX_QTY_PER_LINE) return fail(`You can order at most ${MAX_QTY_PER_LINE} of one item at a time.`);

    const entry = byId.get(productId);
    if (!entry) return fail("That item is no longer on the menu.", 409);

    // Pick the sellable SKU: a family orders through one of its variants.
    let sku: { id: string; name: string; price: number; orderable: boolean; kdsId: string | null; kdsName: string | null };
    if (entry.kind === "group") {
      const variants = Array.isArray(entry.variants) ? entry.variants : [];
      if (!variantId) return fail(`Choose a version of "${entry.displayName || productId}".`);
      const v = variants.find((x) => String(x?.productId) === variantId);
      if (!v) return fail("That version is no longer available.", 409);
      sku = {
        id: String(v.productId),
        name: String(v.displayName || entry.displayName || ""),
        price: num(v.price),
        orderable: v.orderable === true,
        kdsId: v.kitchenLocationId ?? null,
        kdsName: v.kitchenLocationName ?? null,
      };
    } else {
      sku = {
        id: String(entry.productId),
        name: String(entry.displayName || ""),
        price: num(entry.price),
        orderable: entry.orderable === true,
        kdsId: entry.kitchenLocationId ?? null,
        kdsName: entry.kitchenLocationName ?? null,
      };
    }

    if (!sku.orderable) return fail(`"${sku.name}" can't be ordered from your phone — please ask our staff.`, 409);
    if (sku.price <= 0) return fail(`"${sku.name}" isn't priced right now — please ask our staff.`, 409);
    // Belt and braces: `orderable` already implies a station, but a ticket with
    // no destination would be an order nobody ever sees.
    if (!sku.kdsId) return fail(`"${sku.name}" can't be sent to the kitchen — please ask our staff.`, 409);

    const picks = Array.isArray(raw?.modifiers) ? raw.modifiers : [];
    const mods = resolveModifiers(entry, picks, sku.name);
    if (!mods.ok) return fail(mods.error);

    const modifiers = mods.modifiers.length ? mods.modifiers : null;
    const modifiersTotal = modifiers ? modifiers.reduce((sum, m) => sum + m.priceDelta, 0) : null;

    resolved.push({
      itemId: sku.id,
      itemName: sku.name,
      category: entry.subCategory ? String(entry.subCategory) : null,
      unitPrice: sku.price,
      modifiers,
      modifiersText: modifiers ? modifiers.map((m) => m.valueName).join(", ") : null,
      modifiersTotal,
      qty,
      note: raw?.note ? String(raw.note).slice(0, 140).trim() || null : null,
      kitchenLocationId: sku.kdsId,
      kitchenLocationName: sku.kdsName,
      lineId: buildLineId(sku.id, sku.price, modifiers),
    });
  }

  return { ok: true, lines: resolved };
}

/** What the diner is told the order comes to. Billing happens on serve. */
export function orderTotal(lines: ResolvedOrderLine[]): number {
  return lines.reduce((sum, l) => sum + (l.unitPrice + (l.modifiersTotal ?? 0)) * l.qty, 0);
}
