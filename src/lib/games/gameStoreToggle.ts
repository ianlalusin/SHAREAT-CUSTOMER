import { isWithinRunDates, type GameStoreScope } from "./gameScope";

/**
 * A manager switching a game on or off AT THEIR OWN BRANCH.
 *
 * The switch is SUBTRACTIVE: it only ever adds or removes their storeId in
 * `disabledStoreIds`. It can never touch `isActive` — that is the chain-wide
 * kill switch on a single shared document, and one branch does not get to make
 * that decision for the others — and never `applicableStoreIds`, which is head
 * office deciding where a game is offered at all.
 *
 * `isGameEnabledForStore` already honours `disabledStoreIds` on the diner path,
 * so nothing downstream has to learn about this.
 */

export type ManagerGameState = {
  /** Head office has switched this game on somewhere. */
  configured: boolean;
  /** Diners at this branch can play it right now. */
  runningHere: boolean;
  /**
   * Why the switch is unavailable, in the manager's words. Null when they may
   * actually flip it. A toggle that silently does nothing is worse than one
   * that explains itself.
   */
  lockedReason: string | null;
};

function disabledList(cfg: GameStoreScope | null | undefined): string[] {
  return Array.isArray(cfg?.disabledStoreIds)
    ? cfg!.disabledStoreIds!.map((x) => String(x)).filter(Boolean)
    : [];
}

/** What a manager at `storeId` may see and do about this game. */
export function managerGameState(
  cfg: GameStoreScope | null | undefined,
  storeId: string
): ManagerGameState {
  if (!cfg) {
    return {
      configured: false,
      runningHere: false,
      lockedReason: "Not switched on yet. Ask head office to enable it.",
    };
  }

  if (cfg.isActive === false) {
    return {
      configured: true,
      runningHere: false,
      lockedReason: "Switched off for every branch by head office.",
    };
  }

  if (!isWithinRunDates(cfg, Date.now())) {
    return {
      configured: true,
      runningHere: false,
      lockedReason: "Outside the event dates set by head office.",
    };
  }

  const allowed = Array.isArray(cfg.applicableStoreIds) ? cfg.applicableStoreIds : null;
  if (allowed && allowed.length > 0 && !allowed.includes(storeId)) {
    return {
      configured: true,
      runningHere: false,
      lockedReason: "Not offered at this branch by head office.",
    };
  }

  return { configured: true, runningHere: !disabledList(cfg).includes(storeId), lockedReason: null };
}

/**
 * The new `disabledStoreIds` after this branch flips its own switch.
 *
 * Returns the whole array rather than a patch: it is written with
 * `merge: true`, and an array field is replaced wholesale under merge, so the
 * caller must hand over the complete list.
 */
export function setStoreEnabled(
  cfg: GameStoreScope | null | undefined,
  storeId: string,
  enabled: boolean
): string[] {
  const current = disabledList(cfg);
  if (enabled) return current.filter((id) => id !== storeId);
  return current.includes(storeId) ? current : [...current, storeId];
}
