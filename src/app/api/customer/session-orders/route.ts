import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { validateActiveParticipant } from "@/lib/server/customer-participants";
import { computeRunningBill } from "@/lib/catalog/running-bill";
import { customerStatus, orderedQtyFor, servedQtyFor, type RawKitchenTicket } from "@/lib/session-orders";

/**
 * Everything this TABLE has ordered — not just this phone.
 *
 * Diners at one table join the same session from their own phones, so without a
 * shared view the second phone cannot tell that the first already ordered the
 * Kimbap. Scoping to the session rather than the participant is the whole
 * point: it is what stops the table double-ordering.
 *
 * The kitchen tickets ARE the order history, so there is no second collection
 * to keep in step.
 *
 * Refills are deliberately EXCLUDED. They are included in the package, cost
 * nothing extra, and a table works through a lot of them — listing every one
 * buries the handful of items the diner actually chose and paid for, which is
 * what this panel is for. Refill progress has its own surface in the refill
 * flow.
 *
 * The response also carries the running bill, so the diner can see what they
 * have run up without flagging down a server. See `running-bill.ts` for why
 * that figure is deliberately the line subtotal and not a full total.
 */

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/** Enough to cover a long dinner without unbounded reads. */
const MAX_ORDERS = 60;

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

    const [snap, linesSnap, sessionSnap] = await Promise.all([
      db
        .collection(`stores/${storeId}/sessions/${sessionId}/kitchentickets`)
        .orderBy("createdAtClientMs", "desc")
        .limit(MAX_ORDERS)
        .get(),
      db.collection(`stores/${storeId}/sessions/${sessionId}/sessionBillLines`).get(),
      db.doc(`stores/${storeId}/sessions/${sessionId}`).get(),
    ]);

    const bill = computeRunningBill(
      linesSnap.docs.map((d) => d.data()),
      sessionSnap.data()
    );

    const orders = snap.docs
      .filter((d) => String((d.data() as any)?.type || "") !== "refill")
      .map((d) => {
      const t = d.data() as any;
      const status = customerStatus(t as RawKitchenTicket);
      const qtyOrdered = orderedQtyFor(t as RawKitchenTicket);
      const qtyServed = servedQtyFor(t as RawKitchenTicket);
      const unitPrice = Number(t?.pendingBillLine?.unitPrice ?? 0) || 0;
      const modifiersTotal = Number(t?.pendingBillLine?.modifiersTotal ?? 0) || 0;

      return {
        id: d.id,
        /** The sellable SKU, so the menu can flag a repeat order of the same thing. */
        itemId: String(t.itemId || ""),
        itemName: String(t.itemName || ""),
        qty: qtyOrdered,
        qtyServed,
        status,
        type: String(t.type || "addon"),
        createdAtMs: Number(t.createdAtClientMs ?? 0) || 0,
        note: t.notes ? String(t.notes) : null,
        // Refills carry a flavour instead of modifiers; show whichever exists.
        detail: t.modifiersText ? String(t.modifiersText) : t.flavorNote ? String(t.flavorNote) : null,
        /** Which diner at the table sent it — seat number, not identity. */
        orderedBySlot: t.createdBySlotNumber ?? null,
        /** True for the phone asking, so the UI can say "you". */
        orderedByMe: String(t.createdByParticipantId || "") === participantId,
        /**
         * What this order actually costs.
         *
         * Once the kitchen has served any of it, that is the quantity being
         * billed — a 2-ordered / 1-served line costs the price of ONE. Showing
         * the ordered value there would quote a diner a number their bill will
         * never match. While it is still preparing, the ordered value is the
         * right expectation to set.
         *
         * Null for staff-placed items, which carry no price on the ticket.
         */
        lineTotal: unitPrice > 0
          ? (unitPrice + modifiersTotal) * (qtyServed > 0 ? qtyServed : qtyOrdered)
          : null,
        /**
         * True once the amount above is on the bill rather than an expectation.
         *
         * A ticket POS marked served IS billed — that is when POS creates or
         * increments the line (see `customer-order-billing.ts`). Keying this
         * off `qtyServed` alone left an already-charged line captioned
         * "when served" whenever POS served it without counting.
         */
        billed: status === "served" || qtyServed > 0,
      };
    });

    return NextResponse.json({ ok: true, orders, bill });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
