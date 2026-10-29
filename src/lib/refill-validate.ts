import type { RefillOptionsMenu } from "@/lib/server/refill-options-cache";

/**
 * Check a diner's refill line against the branch's real refill menu.
 *
 * Refills are free, so whatever the request says is what the kitchen cooks.
 * The route used to take the item, its name, its kitchen station and the
 * quantity straight from the request — a crafted call could put an invented
 * "free" item on the KDS, at any station, in any quantity (negative included).
 * Now the menu is the source of truth: the item must be one this branch
 * offers, the name and station come from the menu, and the quantity is a
 * small whole number.
 */

/** The modal sends 1 per meat line; anything above this is not a refill. */
export const MAX_REFILL_QTY = 5;
/** Per side inside "Other Refills" (rice, lettuce…). Generous: one phone may order for a big table. */
export const MAX_SIDE_QTY = 20;

/** The line the modal sends for "Other Refills": one per kitchen station, sides inside. */
export const OTHER_REFILLS_ID = "OTHER_REFILLS";

export type RefillLine = {
  itemId: string;
  itemName: string;
  kitchenLocationId: string;
  kitchenLocationName: string;
  qty: number;
  flavorIds: string[];
  refillRequest: Record<string, number> | null;
  /** The refill types this line puts on cooldown. */
  cooldownIds: string[];
};

export type RefillCheck = { ok: true; line: RefillLine } | { ok: false; error: string };

function wholeQty(v: unknown, fallback: number | null, max = MAX_REFILL_QTY): number | null {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
}

export function validateRefillLine(raw: any, menu: RefillOptionsMenu): RefillCheck {
  const offered = new Map(
    menu.storeRefills.filter((r) => r.isEnabled !== false).map((r) => [r.refillId, r] as const)
  );
  const inactive = new Set(menu.refills.filter((r) => r.isActive === false).map((r) => r.id));
  const isOffered = (id: string) => offered.has(id) && !inactive.has(id);

  const itemId = String(raw?.itemId || raw?.refillId || "");
  const station = String(raw?.kitchenLocationId || "");
  const flavorIds: string[] = Array.isArray(raw?.flavorIds) ? raw.flavorIds.map(String).filter(Boolean) : [];
  const qty = wholeQty(raw?.qty, 1);
  if (qty === null) return { ok: false, error: `Refill quantity must be 1 to ${MAX_REFILL_QTY}.` };

  if (itemId === OTHER_REFILLS_ID) {
    const ids: string[] = Array.isArray(raw?.refillIds) ? Array.from(new Set(raw.refillIds.map(String).filter(Boolean))) : [];
    if (!ids.length) return { ok: false, error: "No refills in this order." };

    const request = raw?.refillRequest && typeof raw.refillRequest === "object" ? raw.refillRequest : {};
    const rebuilt: Record<string, number> = {};
    let stationName = "";
    for (const id of ids) {
      if (!isOffered(id)) return { ok: false, error: "One of these refills is not available here." };
      const r = offered.get(id)!;
      // Every side in one line must be from the station the line is sent to.
      if (String(r.kitchenLocationId || "") !== station) {
        return { ok: false, error: "Refill sent to the wrong kitchen station. Please try again." };
      }
      // The KDS card is keyed by display name; rebuild it from the menu so
      // nothing the client invents reaches the kitchen.
      const n = wholeQty(request[r.refillName], 1, MAX_SIDE_QTY);
      if (n === null) return { ok: false, error: `${r.refillName}: order 1 to ${MAX_SIDE_QTY} at a time.` };
      rebuilt[r.refillName] = n;
      stationName = stationName || String(r.kitchenLocationName || "");
    }
    const known = new Set(ids.map((id) => offered.get(id)!.refillName));
    if (Object.keys(request).some((k) => !known.has(k))) {
      return { ok: false, error: "One of these refills is not available here." };
    }
    if (!station) return { ok: false, error: "Missing kitchenLocationId." };

    return {
      ok: true,
      line: {
        itemId: OTHER_REFILLS_ID,
        itemName: "OTHER REFILLS",
        kitchenLocationId: station,
        kitchenLocationName: stationName || "Kitchen",
        qty,
        flavorIds: [],
        refillRequest: rebuilt,
        cooldownIds: ids,
      },
    };
  }

  if (!itemId || !isOffered(itemId)) return { ok: false, error: "That refill is not available here." };
  const r = offered.get(itemId)!;
  const menuStation = String(r.kitchenLocationId || "");
  if (!menuStation) return { ok: false, error: "Missing kitchenLocationId." };

  if (flavorIds.length > 1) {
    return { ok: false, error: `Only 1 flavor per meat is allowed — "${r.refillName}" has ${flavorIds.length}.` };
  }
  if (flavorIds.length) {
    const enabledFlavors = new Set(menu.storeFlavors.filter((f) => f.isEnabled !== false).map((f) => f.flavorId));
    const allowed = menu.refills.find((x) => x.id === itemId)?.allowedFlavorIds ?? [];
    const f = flavorIds[0];
    if (!enabledFlavors.has(f) || (allowed.length > 0 && !allowed.includes(f))) {
      return { ok: false, error: `That flavor is not available for ${r.refillName}.` };
    }
  }

  return {
    ok: true,
    line: {
      itemId,
      itemName: r.refillName,
      kitchenLocationId: menuStation,
      kitchenLocationName: String(r.kitchenLocationName || "Kitchen"),
      qty,
      flavorIds,
      refillRequest: null,
      cooldownIds: [itemId],
    },
  };
}
