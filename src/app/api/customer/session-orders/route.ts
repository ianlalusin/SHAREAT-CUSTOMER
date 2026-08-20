import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { validateActiveParticipant } from "@/lib/server/customer-participants";

/**
 * Everything this TABLE has ordered — not just this phone.
 *
 * Diners at one table join the same session from their own phones, so without a
 * shared view the second phone cannot tell that the first already ordered the
 * Kimbap. Scoping to the session rather than the participant is the whole
 * point: it is what stops the table double-ordering.
 *
 * The kitchen tickets ARE the order history, so there is no second collection
 * to keep in step — refills and self-ordered add-ons both appear, which is also
 * what a diner expects to see.
 */

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/** Enough to cover a long dinner without unbounded reads. */
const MAX_ORDERS = 60;

/** The lifecycle a diner is shown, collapsed from POS's ticket statuses. */
function customerStatus(raw: string, qtyServed: number, qtyCancelled: number): string {
  const s = String(raw || "").toLowerCase();
  if (s === "cancelled") return "cancelled";
  if (s === "served") return qtyServed > 0 ? "served" : "cancelled";
  if (s === "partially_served") return "partially_served";
  return "preparing";
}

export async function GET(req: Request) {
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

    const db = getAdminDb();

    const activeSnap = await db.doc(`stores/${storeId}/activeSessions/${sessionId}`).get();
    if (!activeSnap.exists) return bad("Session not found.", 404);
    const active = activeSnap.data() as any;
    if (active.customerAccessEnabled !== true) return bad("Customer access disabled.", 403);
    if (Number(active.customerAccessExpiresAtMs || 0) <= Date.now()) return bad("Customer access expired.", 403);

    try {
      await validateActiveParticipant(db, storeId, sessionId, participantId);
    } catch (e: any) {
      return bad(e.message, e.httpStatus || 403);
    }

    const snap = await db
      .collection(`stores/${storeId}/sessions/${sessionId}/kitchentickets`)
      .orderBy("createdAtClientMs", "desc")
      .limit(MAX_ORDERS)
      .get();

    const orders = snap.docs.map((d) => {
      const t = d.data() as any;
      const qtyOrdered = Number(t.qtyOrdered ?? t.qty ?? 0) || 0;
      const qtyServed = Number(t.qtyServed ?? 0) || 0;
      const qtyCancelled = Number(t.qtyCancelled ?? 0) || 0;
      const unitPrice = Number(t?.pendingBillLine?.unitPrice ?? 0) || 0;
      const modifiersTotal = Number(t?.pendingBillLine?.modifiersTotal ?? 0) || 0;

      return {
        id: d.id,
        /** The sellable SKU, so the menu can flag a repeat order of the same thing. */
        itemId: String(t.itemId || ""),
        itemName: String(t.itemName || ""),
        qty: qtyOrdered,
        qtyServed,
        status: customerStatus(t.status, qtyServed, qtyCancelled),
        type: String(t.type || "addon"),
        createdAtMs: Number(t.createdAtClientMs ?? 0) || 0,
        note: t.notes ? String(t.notes) : null,
        // Refills carry a flavour instead of modifiers; show whichever exists.
        detail: t.modifiersText ? String(t.modifiersText) : t.flavorNote ? String(t.flavorNote) : null,
        /** Which diner at the table sent it — seat number, not identity. */
        orderedBySlot: t.createdBySlotNumber ?? null,
        /** True for the phone asking, so the UI can say "you". */
        orderedByMe: String(t.createdByParticipantId || "") === participantId,
        /** Staff-placed items have no price here; refills are included in the package. */
        lineTotal: unitPrice > 0 ? (unitPrice + modifiersTotal) * qtyOrdered : null,
      };
    });

    return NextResponse.json({ ok: true, orders });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
