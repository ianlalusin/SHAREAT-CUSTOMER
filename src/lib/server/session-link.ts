/**
 * Rules for who may hold / release a Sharelebrator card link on a session.
 *
 * A link is written on BOTH `activeSessions/{id}` and `sessions/{id}`. Two
 * kinds exist:
 *  - diner link:   `linkedBy` is null — a diner at the table logged in. Full
 *                  earn + redeem in POS.
 *  - cashier link: `linkedBy === "cashier"` (+ `linkedByUid`, `linkedAt`),
 *                  written by POS. Earn-only in POS; `linkedByParticipantId` is
 *                  null. See POS `src/lib/loyalty/session-link.ts`.
 */

export const CASHIER_LINKER = "cashier";

export function isCashierLinked(data: { linkedBy?: unknown } | null | undefined): boolean {
  return data?.linkedBy === CASHIER_LINKER;
}

/**
 * Written over the cashier-provenance fields whenever a diner takes or
 * releases the link, so a diner link is never mislabelled "via cashier".
 */
export const CLEARED_LINKER_FIELDS = {
  linkedBy: null,
  linkedByUid: null,
  linkedAt: null,
} as const;

export type DinerLinkDecision =
  | { ok: true }
  | { ok: false; status: 409; error: string };

/**
 * "First card wins", applied to a diner trying to link `phone` onto a session
 * whose current doc is `current`.
 *
 * A cashier link already holds the session, so it is no different from any
 * other first card: a different phone gets 409. The SAME phone is allowed — the
 * cardholder proved the password, so this upgrades the cashier link to a full
 * diner link (the caller re-binds `linkedByParticipantId` and clears
 * `linkedBy`), which is what enables redemption in POS.
 */
export function decideDinerLink(
  current: Record<string, any> | null | undefined,
  phone: string
): DinerLinkDecision {
  if (!current) return { ok: true };
  if (current.linkedCustomerLockedAt) {
    return { ok: false, status: 409, error: "This session has already been paid; link is locked." };
  }
  const currentPhone = current.linkedCustomerPhone as string | null | undefined;
  if (currentPhone && currentPhone !== phone) {
    const currentName = current.linkedCustomerName || "another card";
    return {
      ok: false,
      status: 409,
      error: isCashierLinked(current)
        ? `This session was linked to ${currentName} by the cashier. Ask the cashier to change it.`
        : `This session is already linked to ${currentName}. Ask them to unlink first before linking your card.`,
    };
  }
  return { ok: true };
}

/** A cashier link can only be removed by the cashier, never by a diner. */
export function canDinerUnlink(
  current: Record<string, any> | null | undefined
): { ok: true } | { ok: false; status: 403; error: string } {
  if (isCashierLinked(current)) {
    return {
      ok: false,
      status: 403,
      error: "This card was linked by the cashier. Ask the cashier to change it.",
    };
  }
  return { ok: true };
}
