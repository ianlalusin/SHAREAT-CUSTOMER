import type { Firestore } from "firebase-admin/firestore";
import { OUTSTANDING_BLOCK_MAX_MS } from "../refill-cooldown";

/**
 * Which refill types this phone still has sitting in the kitchen.
 *
 * A refill is blocked while the guest's own last ticket for it has not been
 * served or cancelled — the real constraint the old ten-minute timer was only
 * approximating.
 *
 * Per PARTICIPANT, not per table: four guests sharing a table each get their
 * own clock, which is the rule the refill flow has always followed.
 *
 * Deliberately unbounded in neither direction:
 *  - `OUTSTANDING_BLOCK_MAX_MS` stops a ticket the kitchen forgot from locking
 *    a meat forever (see the constant's own note).
 *  - the read is capped at `MAX_TICKETS_SCANNED`, comfortably more than one
 *    session produces.
 */

/** Terminal states. Anything else is still with the kitchen. */
const CLOSED_STATUSES: ReadonlySet<string> = new Set(["served", "cancelled"]);

/**
 * Matches the window `session-orders` reads. A single-field `orderBy` needs no
 * composite index — worth preserving, since a Firestore index reporting
 * "Deploy complete!" is not the same as being queryable.
 */
const MAX_TICKETS_SCANNED = 60;

/**
 * Every refill id one ticket covers.
 *
 * Usually just `itemId`. Two cases where it is not:
 *  - an "Other Refills" order bundles several sides into ONE ticket whose
 *    `itemId` is the bundle label `OTHER_REFILLS`;
 *  - `repeat-first-order` writes `itemId: repeat_first_order_<offering>`.
 *
 * Both would otherwise never match the refill they actually cover, so the
 * writers persist the authoritative list in `refillIds`.
 *
 * Note `refillRequest` is deliberately NOT read here: it is keyed by display
 * NAME ({"Cheese": 1}), because that map is what the KDS card renders. Names
 * are not ids and would never match, which is exactly how bundled sides went
 * unblocked before `refillIds` was stored.
 */
export function refillIdsOnTicket(ticket: Record<string, any>): string[] {
  const ids: string[] = [];
  const itemId = String(ticket?.itemId || "");
  if (itemId) ids.push(itemId);

  const covered = ticket?.refillIds;
  if (Array.isArray(covered)) {
    for (const id of covered) {
      const s = String(id || "");
      if (s) ids.push(s);
    }
  }

  return Array.from(new Set(ids));
}

/** True when this ticket should still block the refills it covers. */
export function ticketBlocks(
  ticket: Record<string, any>,
  participantId: string,
  nowMs: number
): boolean {
  if (String(ticket?.type || "") !== "refill") return false;
  if (String(ticket?.createdByParticipantId || "") !== participantId) return false;
  if (CLOSED_STATUSES.has(String(ticket?.status || "").toLowerCase())) return false;

  const createdAtMs = Number(ticket?.createdAtClientMs ?? 0);
  // A ticket with no timestamp cannot be aged out, so treat it as stale rather
  // than let it block indefinitely.
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return false;

  return nowMs - createdAtMs < OUTSTANDING_BLOCK_MAX_MS;
}

export async function outstandingRefillIds(
  db: Firestore,
  storeId: string,
  sessionId: string,
  participantId: string,
  nowMs: number = Date.now()
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!storeId || !sessionId || !participantId) return out;

  const snap = await db
    .collection(`stores/${storeId}/sessions/${sessionId}/kitchentickets`)
    .orderBy("createdAtClientMs", "desc")
    .limit(MAX_TICKETS_SCANNED)
    .get();

  for (const doc of snap.docs) {
    const ticket = doc.data() as Record<string, any>;
    if (!ticketBlocks(ticket, participantId, nowMs)) continue;
    for (const id of refillIdsOnTicket(ticket)) out.add(id);
  }

  return out;
}
