import type { Firestore } from "firebase-admin/firestore";
import { OUTSTANDING_BLOCK_MAX_MS, type CooldownMap } from "../refill-cooldown";
import { FIRST_SERVING_BLOCK_MAX_MS } from "../session-orders";

/**
 * What this phone's kitchen tickets say about each refill: which are still
 * sitting with the kitchen, and when the last one actually reached the table.
 *
 * A refill is blocked while the guest's own last ticket for it has not been
 * served or cancelled — the real constraint the old ten-minute timer was only
 * approximating — and then for a minute after it arrives. Both facts come off
 * the same scan, so the serve stamps cost no extra reads.
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

/**
 * When this ticket reached the guest, or 0 if it never did.
 *
 * `servedAtClientMs` is POS's own stamp and is written on both serve paths —
 * whole-ticket and partial. A cancel writes `cancelledAtClientMs` instead, so a
 * cancelled order correctly starts no cooldown: nothing arrived to wait after.
 *
 * Deliberately NOT subject to OUTSTANDING_BLOCK_MAX_MS. That valve exists to
 * release a ticket the kitchen never closed; a serve that really happened is a
 * fact, and the minute after it runs however long the kitchen took to get there.
 */
export function ticketServedAtMs(ticket: Record<string, any>, participantId: string): number {
  if (String(ticket?.type || "") !== "refill") return 0;
  if (String(ticket?.createdByParticipantId || "") !== participantId) return 0;

  const servedAtMs = Number(ticket?.servedAtClientMs ?? 0);
  return Number.isFinite(servedAtMs) && servedAtMs > 0 ? servedAtMs : 0;
}

/** refillId -> the most recent serve, across every ticket that covered it. */
export function servedStampsFrom(
  tickets: ReadonlyArray<Record<string, any>>,
  participantId: string
): CooldownMap {
  const out: CooldownMap = {};

  for (const ticket of tickets) {
    const servedAtMs = ticketServedAtMs(ticket, participantId);
    if (!servedAtMs) continue;
    for (const id of refillIdsOnTicket(ticket)) {
      if (servedAtMs > (out[id] ?? 0)) out[id] = servedAtMs;
    }
  }

  return out;
}

/**
 * Is this the cashier's opening order, still with the kitchen?
 *
 * `package` is the check-in ticket POS writes for the unli set itself. Unlike
 * every other check in this file it is deliberately NOT scoped to a
 * participant: the cashier created it on the table's behalf, so it carries no
 * diner's id and belongs to everyone at the session.
 *
 * Mirrors hasPendingFirstServing() in lib/session-orders.ts, which the dashboard
 * uses to decide whether to open the refill modal at all, and shares its valve.
 * The two must agree — if the UI refused what the API allowed, or the reverse,
 * one of them would be lying to the diner. A test pins them together.
 */
export function ticketIsPendingFirstServing(
  ticket: Record<string, any>,
  nowMs: number
): boolean {
  if (String(ticket?.type || "") !== "package") return false;
  if (CLOSED_STATUSES.has(String(ticket?.status || "").toLowerCase())) return false;

  const createdAtMs = Number(ticket?.createdAtClientMs ?? 0);
  // Cannot be aged out, so it could never expire the valve. Fail open.
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return false;

  return nowMs - createdAtMs < FIRST_SERVING_BLOCK_MAX_MS;
}

export type RefillTicketState = {
  /** Still with the kitchen. No known arrival time, so never show a timer. */
  outstanding: Set<string>;
  /** refillId -> when it last reached the table. Feeds the serve-anchored minute. */
  servedAt: CooldownMap;
  /** The table's opening order has not arrived yet — refuse refills entirely. */
  firstServingPending: boolean;
};

/** One scan, both answers. */
export async function refillTicketState(
  db: Firestore,
  storeId: string,
  sessionId: string,
  participantId: string,
  nowMs: number = Date.now()
): Promise<RefillTicketState> {
  const outstanding = new Set<string>();
  if (!storeId || !sessionId || !participantId)
    return { outstanding, servedAt: {}, firstServingPending: false };

  const snap = await db
    .collection(`stores/${storeId}/sessions/${sessionId}/kitchentickets`)
    .orderBy("createdAtClientMs", "desc")
    .limit(MAX_TICKETS_SCANNED)
    .get();

  const tickets = snap.docs.map((doc) => doc.data() as Record<string, any>);

  for (const ticket of tickets) {
    if (!ticketBlocks(ticket, participantId, nowMs)) continue;
    for (const id of refillIdsOnTicket(ticket)) outstanding.add(id);
  }

  return {
    outstanding,
    servedAt: servedStampsFrom(tickets, participantId),
    firstServingPending: tickets.some((t) => ticketIsPendingFirstServing(t, nowMs)),
  };
}
