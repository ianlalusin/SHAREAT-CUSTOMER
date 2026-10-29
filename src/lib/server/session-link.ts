import { checkLiveParticipant } from "@/lib/server/customer-gate";

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

/**
 * Who may unlink. A cashier link: only the cashier, never a diner. A diner
 * link: only the participant who made it — the same rule `resolveSessionCard`
 * uses to decide who the cardholder is. Nothing linked is a harmless no-op.
 */
export function canDinerUnlink(
  current: Record<string, any> | null | undefined,
  callerParticipantId: string
): { ok: true } | { ok: false; status: 403; error: string } {
  if (isCashierLinked(current)) {
    return {
      ok: false,
      status: 403,
      error: "This card was linked by the cashier. Ask the cashier to change it.",
    };
  }
  const owner = String(current?.linkedByParticipantId || "");
  if (current?.linkedCustomerPhone && owner && owner !== callerParticipantId) {
    const name = String(current?.linkedCustomerName || "").trim();
    return {
      ok: false,
      status: 403,
      error: `This card was linked from ${name ? `${name}'s` : "another"} phone. Only they can unlink it, or ask the cashier.`,
    };
  }
  return { ok: true };
}

export type SessionCard =
  | { ok: true; phone: string }
  | { ok: false; reason: "none" | "cashier" | "other"; message: string };

/**
 * Which card, if any, the caller may ACT on (redeem, transfer, edit profile…)
 * given the shared session doc. Same ownership rule as /me: only the
 * participant that linked the card gets it — everyone else at the table shares
 * the session doc but not the card.
 *
 * A cashier link has no participant (`linkedByParticipantId` null) and is
 * earn-only in POS, so it is refused outright with its own message; no diner
 * can act on it until the cardholder links it themselves (same phone), which
 * upgrades it (see decideDinerLink).
 */
export function resolveSessionCard(
  data: Record<string, any> | null | undefined,
  participantId: string
): SessionCard {
  const phone = data?.linkedCustomerPhone as string | null | undefined;
  if (!phone) return { ok: false, reason: "none", message: "No loyalty card linked." };
  if (isCashierLinked(data)) {
    return {
      ok: false,
      reason: "cashier",
      message:
        "This card was linked by the cashier and can only earn points. Log in with your card on your own phone to use it.",
    };
  }
  const owner = String(data?.linkedByParticipantId || "");
  if (!owner || !participantId || owner !== participantId) {
    return { ok: false, reason: "other", message: "This card belongs to someone else at your table." };
  }
  return { ok: true, phone };
}

/**
 * The card behind a verified ID token: a table session (subject to
 * resolveSessionCard) or a loyalty-card login (the token's own phone).
 */
export async function resolveTokenCard(db: any, decoded: any): Promise<SessionCard> {
  const none: SessionCard = { ok: false, reason: "none", message: "No loyalty card linked." };
  if (decoded.customer === true) {
    const storeId = String(decoded.storeId || "");
    const sessionId = String(decoded.sessionId || "");
    if (!storeId || !sessionId) return none;
    // A phone removed from the table, or a table whose customer access was
    // switched off, must lose the card along with everything else.
    const snap = await db.doc(`stores/${storeId}/activeSessions/${sessionId}`).get();
    if (!snap.exists) return none;
    const live = await checkLiveParticipant(db, decoded);
    if (!live.ok) return { ok: false, reason: "other", message: live.error };
    return resolveSessionCard(snap.data(), String(decoded.participantId || ""));
  }
  if (decoded.loyaltyCustomer === true) {
    const phone = String(decoded.phone || "");
    return phone ? { ok: true, phone } : none;
  }
  return none;
}
