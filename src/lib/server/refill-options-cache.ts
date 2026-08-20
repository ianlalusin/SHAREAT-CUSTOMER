import type { Firestore } from "firebase-admin/firestore";
import { globalInactiveIds } from "../refill-visibility";

export const REFILL_OPTIONS_CACHE_TTL_MS = 10 * 60 * 1000;

export type CachedStoreRefill = {
  id: string;
  refillId: string;
  refillName: string;
  isOther: boolean;
  kitchenLocationId: string | null;
  kitchenLocationName: string | null;
  isEnabled: boolean;
  sortOrder: number;
};

export type CachedRefill = {
  id: string;
  isActive: boolean;
  requiresFlavor: boolean;
  allowedFlavorIds: string[];
};

export type CachedStoreFlavor = {
  id: string;
  flavorId: string;
  flavorName: string;
  isEnabled: boolean;
};

export type RefillOptionsMenu = {
  storeRefills: CachedStoreRefill[];
  refills: CachedRefill[];
  storeFlavors: CachedStoreFlavor[];
};

/**
 * Runs the three source-collection scans (storeRefills, refills, storeFlavors)
 * with the same field mapping/filters the customer route used to run inline.
 * This is the only place that should ever read those collections directly —
 * everything else reads the refillOptionsCache doc this builds.
 */
export async function buildRefillOptionsMenu(db: Firestore, storeId: string): Promise<RefillOptionsMenu> {
  const storeRefillsSnap = await db
    .collection(`stores/${storeId}/storeRefills`)
    .where("isEnabled", "==", true)
    .orderBy("sortOrder", "asc")
    .get();

  const storeRefillsAll: CachedStoreRefill[] = storeRefillsSnap.docs.map((d) => {
    const x = d.data() as any;
    return {
      id: d.id,
      refillId: d.id,
      refillName: String(x.refillName || x.name || ""),
      isOther: !!(x.isOther ?? x.isother ?? x.is_other ?? x.isOtherRefill ?? x.other),
      kitchenLocationId: x.kitchenLocationId ?? null,
      kitchenLocationName: x.kitchenLocationName ?? null,
      isEnabled: x.isEnabled !== false,
      sortOrder: Number(x.sortOrder || 0),
    };
  });

  // Read EVERY global refill, not just the active ones: the projection has to
  // know which ids are retired in order to drop them from the store list.
  // Filtering the query to isActive==true is precisely why deactivating an item
  // in the global admin appeared to do nothing. Same single collection read.
  const refillsSnap = await db.collection("refills").get();
  const allGlobalRefills: CachedRefill[] = refillsSnap.docs.map((d) => {
    const x = d.data() as any;
    return {
      id: d.id,
      isActive: x.isActive !== false,
      requiresFlavor: !!x.requiresFlavor,
      allowedFlavorIds: Array.isArray(x.allowedFlavorIds) ? x.allowedFlavorIds : [],
    };
  });

  // Unchanged shape for consumers: only active globals carry the flavor rules.
  const refills: CachedRefill[] = allGlobalRefills.filter((r) => r.isActive);

  const globalInactive = globalInactiveIds(allGlobalRefills);
  const storeRefills = storeRefillsAll.filter((r) => !globalInactive.has(r.refillId));

  const flavorsSnap = await db
    .collection(`stores/${storeId}/storeFlavors`)
    .where("isEnabled", "==", true)
    .get();

  const storeFlavors: CachedStoreFlavor[] = flavorsSnap.docs.map((d) => {
    const x = d.data() as any;
    return {
      id: d.id,
      flavorId: d.id,
      flavorName: String(x.flavorName || x.name || ""),
      isEnabled: x.isEnabled !== false,
    };
  });

  return { storeRefills, refills, storeFlavors };
}

/** Rebuilds and persists stores/{storeId}/refillOptionsCache/main from primary data. */
export async function rebuildRefillOptionsCache(
  db: Firestore,
  storeId: string
): Promise<RefillOptionsMenu & { updatedAtMs: number }> {
  const menu = await buildRefillOptionsMenu(db, storeId);
  const updatedAtMs = Date.now();

  await db.doc(`stores/${storeId}/refillOptionsCache/main`).set(
    {
      updatedAtMs,
      ...menu,
    },
    { merge: true }
  );

  return { updatedAtMs, ...menu };
}

/**
 * Reads the refillOptionsCache doc. Self-heals by rebuilding inline when the
 * doc is missing or older than REFILL_OPTIONS_CACHE_TTL_MS, so this can never
 * serve stale-forever or 404 even if an upstream editor (POS/ERP) forgets to
 * trigger a rebuild after a menu edit.
 */
export async function getRefillOptionsMenu(db: Firestore, storeId: string): Promise<RefillOptionsMenu> {
  const cacheSnap = await db.doc(`stores/${storeId}/refillOptionsCache/main`).get();
  const cache = cacheSnap.exists ? (cacheSnap.data() as any) : null;
  const updatedAtMs = Number(cache?.updatedAtMs || 0);
  const isStale = !cache || Date.now() - updatedAtMs > REFILL_OPTIONS_CACHE_TTL_MS;

  if (isStale) {
    const rebuilt = await rebuildRefillOptionsCache(db, storeId);
    return {
      storeRefills: rebuilt.storeRefills,
      refills: rebuilt.refills,
      storeFlavors: rebuilt.storeFlavors,
    };
  }

  return {
    storeRefills: Array.isArray(cache.storeRefills) ? cache.storeRefills : [],
    refills: Array.isArray(cache.refills) ? cache.refills : [],
    storeFlavors: Array.isArray(cache.storeFlavors) ? cache.storeFlavors : [],
  };
}
