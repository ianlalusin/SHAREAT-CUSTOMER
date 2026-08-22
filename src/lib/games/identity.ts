/**
 * Who a recipe belongs to, and whose vote counts.
 *
 * ONE SCHEME: the participant id, which IS the hash of the browser's
 * `shareat_device_id` (see `hashDeviceId` in lib/server/customer-participants.ts
 * and its use as the participant doc id). Stable for the same device across
 * visits, which is enough for "one vote per person" to mean something.
 *
 * A PHONE-BASED KEY WAS DESIGNED AND REJECTED. It reads like the better
 * identity — it survives a change of device — but deriving it from
 * `session.linkedCustomerPhone` would be a real bug. That field lives on the
 * SESSION doc and is shared by the whole table:
 * app/api/customer/sharelebrator/me/route.ts only treats a caller as the
 * cardholder when `session.linkedByParticipantId === decoded.participantId`,
 * and deliberately treats every other diner at a linked table as unlinked. A
 * naive read would collapse every participant at that table onto ONE key — so
 * the second person to open the game would be told they had already voted, and
 * could not publish. It would only show up on linked sessions, so testing on a
 * single phone would never catch it.
 *
 * One scheme also keeps author and voter keys directly comparable. With two,
 * an author who published before linking their card and voted after would slip
 * past the "you cannot rate your own recipe" check.
 *
 * If cross-device author identity ever becomes a real product need, the fix is
 * a verified link keyed off `linkedByParticipantId` — not a read of
 * `linkedCustomerPhone`.
 */

const PREFIX = "d_";

/** Whether a participant id is well-formed enough to key content by. */
export function isUsableParticipantId(participantId: unknown): boolean {
  const id = String(participantId ?? "").trim();
  return id.length >= 8 && /^[A-Za-z0-9_-]+$/.test(id);
}

/**
 * The key a recipe is authored under and a vote is counted against.
 * Returns null when the caller has no identity worth trusting — the route must
 * refuse rather than invent one, or every anonymous caller shares a key.
 */
export function gameIdentityKey(participantId: unknown): string | null {
  const id = String(participantId ?? "").trim();
  return isUsableParticipantId(id) ? `${PREFIX}${id}` : null;
}
