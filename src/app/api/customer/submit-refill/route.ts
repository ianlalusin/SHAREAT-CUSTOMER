import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { validateActiveParticipant } from "@/lib/server/customer-participants";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  try {
    const authz = req.headers.get("authorization") || "";
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return bad("Missing Authorization Bearer token.", 401);

    const decoded = await getAdminAuth().verifyIdToken(m[1]);
    if (decoded.customer !== true) return bad("Not a customer token.", 403);

    const storeId = String((decoded as any).storeId || "");
    const sessionId = String((decoded as any).sessionId || "");
    const participantId = String((decoded as any).participantId || "");
    if (!storeId || !sessionId) return bad("Missing storeId/sessionId in token.", 403);
    if (!participantId) return bad("Missing participantId in token. Please re-enter your PIN.", 403);

    const createdByUid = String(decoded.uid || "");

    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return bad("No refill items.", 400);

    const db = getAdminDb();

    const activeRef = db.doc(`stores/${storeId}/activeSessions/${sessionId}`);
    const activeSnap = await activeRef.get();
    if (!activeSnap.exists) return bad("Session not found.", 404);

    const active = activeSnap.data() as any;
    if (active.customerAccessEnabled !== true) return bad("Customer access disabled.", 403);
    if (Number(active.customerAccessExpiresAtMs || 0) <= Date.now()) return bad("Customer access expired.", 403);

    let participantInfo;
    try {
      participantInfo = await validateActiveParticipant(db, storeId, sessionId, participantId);
    } catch (e: any) {
      return bad(e.message, e.httpStatus || 403);
    }

    const tableNumber = String(active.tableNumber || "");
    const sessionLabel = String(active.tableDisplayName || (tableNumber ? `Table ${tableNumber}` : ""));
    const sessionMode = String(active.sessionMode || "package_dinein");
    const customerName = active.customerName ?? null;
    const guestCount = Number(active.guestCountFinal ?? active.guestCountCashierInitial ?? active.guestCount ?? 0) || 0;

    const createdTicketIds: string[] = [];

    for (const it of items) {
      const itemId = String(it?.itemId || it?.refillId || "");
      const itemName = String(it?.itemName || it?.refillName || "");
      const kitchenLocationId = String(it?.kitchenLocationId || "");
      const kitchenLocationName = String(it?.kitchenLocationName || "Kitchen");
      const qty = Number(it?.qty || 1);
      const notes = String(it?.notes || "");

      if (!itemId || !itemName) return bad("Invalid item payload.", 400);
      if (!kitchenLocationId) return bad("Missing kitchenLocationId.", 400);

      const ticketRef = db.collection(`stores/${storeId}/sessions/${sessionId}/kitchentickets`).doc();
      const rtRef = db.doc(`stores/${storeId}/rtKdsTickets/${kitchenLocationId}`);
      const createdAtClientMs = Date.now();

      await db.runTransaction(async (tx: any) => {
        const rtSnap = await tx.get(rtRef);
        const rt = rtSnap.exists ? (rtSnap.data() as any) : {};

        const activeIds: string[] = Array.isArray(rt.activeIds) ? [...rt.activeIds] : [];
        const tickets: Record<string, any> = rt.tickets && typeof rt.tickets === "object" ? { ...rt.tickets } : {};
        const sessionIndex: Record<string, string[]> =
          rt.sessionIndex && typeof rt.sessionIndex === "object" ? { ...rt.sessionIndex } : {};

        const ticket = {
          billLineId: null,
          createdAt: FieldValue.serverTimestamp(),
          createdAtClientMs,
          createdByUid,
          createdByParticipantId: participantId,
          createdBySlotNumber: participantInfo.slotNumber,
          createdByJoinMethod: participantInfo.joinMethod,
          customerName,
          durationMs: 0,
          guestCount,
          id: ticketRef.id,
          itemId,
          itemName,
          kitchenLocationId,
          kitchenLocationName,
          notes,
          qty,
          refillRequest: (it && typeof it === "object" ? (it as any).refillRequest : undefined) ?? null,
          sessionId,
          sessionLabel,
          sessionMode,
          status: "preparing",
          storeId,
          tableNumber,
          type: "refill",
          updatedAt: FieldValue.serverTimestamp(),
        };

        tx.set(ticketRef, ticket, { merge: false });

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

      createdTicketIds.push(ticketRef.id);
    }

    return NextResponse.json({ ok: true, ticketIds: createdTicketIds });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
