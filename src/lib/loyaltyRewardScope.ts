/**
 * Per-store availability of a global loyalty reward.
 *
 * MIRRORS `POS/src/lib/loyaltyRewardScope.ts` and must stay identical to it.
 * POS is where a manager switches a reward on or off for their branch
 * (Collections → Loyalty); this is where the diner's own app decides what to
 * show and what it will let them claim. If the two ever disagreed, a store
 * would either advertise a reward it does not honour, or hide one it does.
 *
 * Two fields decide it, and the order matters:
 *
 *  - `applicableStoreIds` — the admin's allow-list. Null / absent / empty
 *    means "every store", which is how every existing reward is stored, so
 *    nothing changes for rewards nobody has scoped.
 *  - `disabledStoreIds` — the manager's opt-out for their own store.
 *
 * The manager's toggle writes `disabledStoreIds` rather than rewriting the
 * admin's allow-list. Turning a reward off at one branch must not mean
 * materialising "all the other branches" into the allow-list, which would
 * silently exclude every store created afterwards.
 */

export type RewardStoreScope = {
  isActive?: boolean;
  applicableStoreIds?: string[] | null;
  disabledStoreIds?: string[] | null;
};

/** Whether `storeId` currently offers this reward. */
export function isRewardOfferedAtStore(
  reward: RewardStoreScope | null | undefined,
  storeId: string
): boolean {
  if (!reward || !storeId) return false;
  if (reward.isActive === false) return false;

  const allowed = Array.isArray(reward.applicableStoreIds) ? reward.applicableStoreIds : null;
  if (allowed && allowed.length > 0 && !allowed.includes(storeId)) return false;

  const disabled = Array.isArray(reward.disabledStoreIds) ? reward.disabledStoreIds : [];
  return !disabled.includes(storeId);
}
