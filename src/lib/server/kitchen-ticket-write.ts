import { FieldValue, type Firestore } from "firebase-admin/firestore";

/**
 * Writes one kitchen ticket and fans it out to the live KDS station doc.
 *
 * Both customer-originated flows use this — refills and self-ordered add-ons —
 * so the two cannot drift apart in a way the kitchen screen would notice.
 *
 * The fan-out shape is load-bearing and belongs to POS. `rtKdsTickets/{station}`
 * carries `activeIds` (ordered ids), `tickets` (id → the full ticket object) and
 * `sessionIndex` (sessionId → ids), and the KDS reads all three. Keep the
 * `meta.source` string as POS's own writer sets it, so a ticket from here is
 * indistinguishable from one POS wrote.
 */

export type KitchenTicketSession = {
  tableNumber: string;
  sessionLabel: string;
  sessionMode: string;
  customerName: string | null;
  guestCount: number;
};

export type KitchenTicketActor = {
  createdByUid: string;
  participantId: string;
  slotNumber: number | null;
  joinMethod: string | null;
};

export type KitchenTicketInput = {
  storeId: string;
  sessionId: string;
  kitchenLocationId: string;
  kitchenLocationName: string;
  /** POS's OrderItemType. Customer flows only ever write these two. */
  type: "refill" | "addon";
  itemId: string;
  itemName: string;
  qty: number;
  notes?: string;
  session: KitchenTicketSession;
  actor: KitchenTicketActor;
  /**
   * Extra fields merged into the ticket — `flavorNote`/`refillRequest` for a
   * refill, `pendingBillLine`/`billOnServe` for a self-ordered add-on.
   */
  extra?: Record<string, any>;
  /**
   * A deterministic id from deriveKitchenTicketId. When given, the write is
   * create-only: a ticket already at this id (an earlier attempt of the same
   * submission got this far) is left exactly as it is and its id returned, so
   * a retry cannot put the line in front of the kitchen twice. Omitted, a
   * fresh random id is used, as before.
   */
  ticketId?: string;
};

function ticketsCollection(db: Firestore, storeId: string, sessionId: string) {
  return db.collection(`stores/${storeId}/sessions/${sessionId}/kitchentickets`);
}

/**
 * Which of `ticketIds` already exist. Lets a route tell, before its gates run,
 * which lines of a retried submission an earlier attempt already wrote.
 */
export async function existingKitchenTicketIds(
  db: Firestore,
  storeId: string,
  sessionId: string,
  ticketIds: string[]
): Promise<Set<string>> {
  if (!ticketIds.length) return new Set();
  const col = ticketsCollection(db, storeId, sessionId);
  const snaps = await db.getAll(...ticketIds.map((id) => col.doc(id)));
  return new Set(snaps.filter((s) => s.exists).map((s) => s.id));
}

export async function writeKitchenTicket(db: Firestore, input: KitchenTicketInput): Promise<string> {
  const {
    storeId, sessionId, kitchenLocationId, kitchenLocationName,
    type, itemId, itemName, qty, notes, session, actor, extra, ticketId,
  } = input;

  const col = ticketsCollection(db, storeId, sessionId);
  const ticketRef = ticketId ? col.doc(ticketId) : col.doc();
  const rtRef = db.doc(`stores/${storeId}/rtKdsTickets/${kitchenLocationId}`);
  const createdAtClientMs = Date.now();

  await db.runTransaction(async (tx: any) => {
    // Read inside the transaction, so two concurrent attempts of the same
    // submission cannot both see "missing" and both fan out to the KDS doc.
    if (ticketId) {
      const existing = await tx.get(ticketRef);
      if (existing.exists) return;
    }

    const rtSnap = await tx.get(rtRef);
    const rt = rtSnap.exists ? (rtSnap.data() as any) : {};

    const activeIds: string[] = Array.isArray(rt.activeIds) ? [...rt.activeIds] : [];
    const tickets: Record<string, any> = rt.tickets && typeof rt.tickets === "object" ? { ...rt.tickets } : {};
    const sessionIndex: Record<string, string[]> =
      rt.sessionIndex && typeof rt.sessionIndex === "object" ? { ...rt.sessionIndex } : {};

    const ticket = {
      // `extra` first so it can never overwrite an identity field below.
      ...(extra || {}),
      billLineId: null,
      createdAt: FieldValue.serverTimestamp(),
      createdAtClientMs,
      createdByUid: actor.createdByUid,
      createdByParticipantId: actor.participantId,
      createdBySlotNumber: actor.slotNumber,
      createdByJoinMethod: actor.joinMethod,
      customerName: session.customerName,
      durationMs: 0,
      guestCount: session.guestCount,
      id: ticketRef.id,
      itemId,
      itemName,
      kitchenLocationId,
      kitchenLocationName,
      notes: notes ?? "",
      qty,
      // POS's serve flow reads qtyOrdered/qtyRemaining for its batch-serve UI.
      qtyOrdered: qty,
      qtyServed: 0,
      qtyCancelled: 0,
      qtyRemaining: qty,
      serveLog: [],
      sessionId,
      sessionLabel: session.sessionLabel,
      sessionMode: session.sessionMode,
      status: "preparing",
      storeId,
      tableNumber: session.tableNumber,
      type,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (ticketId) tx.create(ticketRef, ticket);
    else tx.set(ticketRef, ticket, { merge: false });

    tickets[ticketRef.id] = ticket;
    if (!activeIds.includes(ticketRef.id)) activeIds.unshift(ticketRef.id);
    const idxArr = Array.isArray(sessionIndex[sessionId]) ? [...sessionIndex[sessionId]] : [];
    if (!idxArr.includes(ticketRef.id)) idxArr.unshift(ticketRef.id);
    sessionIndex[sessionId] = idxArr;

    tx.set(rtRef, {
      kitchenLocationId,
      activeIds,
      sessionIndex,
      tickets,
      meta: { source: "createKitchenTickets", updatedAt: FieldValue.serverTimestamp() },
    }, { merge: true });
  });

  return ticketRef.id;
}
