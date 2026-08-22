/**
 * Per-store availability of a mini-game.
 *
 * A deliberate sibling of `lib/loyaltyRewardScope.ts` — same three fields, same
 * reasoning about why a per-store switch is subtractive (`disabledStoreIds`)
 * rather than a rewrite of the admin's allow-list, which would silently exclude
 * every store created afterwards. Read that file before changing this one.
 *
 * TWO DELIBERATE DIVERGENCES from the reward version. Neither is an oversight:
 *
 *  1. `isRewardOfferedAtStore` returns false when it has no store to judge
 *     against. Here a diner browsing `/play` away from a table has no store,
 *     and must still see globally-active games. A null `storeId` therefore
 *     means "skip store scoping, honour `isActive` only" — it is a browsing
 *     context, not a claim, so there is nothing to fail closed on.
 *
 *  2. `isRewardOfferedAtStore({})` is TRUE, because every reward predating
 *     per-store scoping is stored that way and must keep working. Games have no
 *     such history: a game with no config doc is OFF, and must be switched on
 *     deliberately. That rule lives in the CALLER, not here — this function
 *     only ever judges a config doc that exists. See `isGameConfigured`.
 */

export type GameStoreScope = {
  isActive?: boolean;
  /** Admin allow-list. Null / absent / empty means every store. */
  applicableStoreIds?: string[] | null;
  /** Per-store opt-out, applied on top of the allow-list. */
  disabledStoreIds?: string[] | null;
};

/**
 * Whether a game with THIS config doc runs at `storeId`.
 *
 * Pass `null` for `storeId` to ask the store-independent question ("is this
 * game live anywhere at all"), which is what the hub does for a diner with no
 * session.
 */
export function isGameEnabledForStore(
  cfg: GameStoreScope | null | undefined,
  storeId: string | null
): boolean {
  if (!cfg) return false;
  if (cfg.isActive === false) return false;

  const allowed = Array.isArray(cfg.applicableStoreIds) ? cfg.applicableStoreIds : null;
  const scoped = !!(allowed && allowed.length > 0);

  if (!storeId) {
    // No store context. An allow-listed game is still "live somewhere", so it
    // stays browsable; the store check happens when they actually sit down.
    return true;
  }

  if (scoped && !allowed!.includes(storeId)) return false;

  const disabled = Array.isArray(cfg.disabledStoreIds) ? cfg.disabledStoreIds : [];
  return !disabled.includes(storeId);
}

/**
 * Whether a config doc exists at all. A game nobody has switched on has no doc,
 * and must not run — this is the half of the decision `isGameEnabledForStore`
 * deliberately does not make.
 */
export function isGameConfigured(cfg: GameStoreScope | null | undefined): boolean {
  return !!cfg;
}
