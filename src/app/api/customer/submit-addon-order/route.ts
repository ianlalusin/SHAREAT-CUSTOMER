import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { validateActiveParticipant } from "@/lib/server/customer-participants";
import { writeKitchenTicket } from "@/lib/server/kitchen-ticket-write";
import { claimOrderRequest, releaseOrderRequest } from "@/lib/server/order-claim";
import { orderTotal, resolveOrderLines } from "@/lib/catalog/order-validation";

/**
 * A diner orders add-ons from their own phone.
 *
 * Writes kitchen tickets ONLY — no bill line. The bill line is created by POS
 * when the kitchen marks the item served, so the diner is charged for what they
 * were actually handed and a cancelled order never reaches the bill. See
 * POS/src/lib/kitchen/customer-order-billing.ts for the other half of that
 * contract; the `billOnServe` / `pendingBillLine` fields below are what POS
 * looks for.
 *
 * Prices are recomputed server-side from the catalog snapshot. The client sends
 * ids and quantities; it never sends money.
 */

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/** Session states that must not take new charges. */
const CLOSED_STATUSES = new Set(["paid", "closed", "cancelled", "voided", "completed"]);

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
    const clientRequestId = String(body?.clientRequestId || "");
    if (!clientRequestId) return bad("Missing clientRequestId.", 400);

    const db = getAdminDb();

    const activeSnap = await db.doc(`stores/${storeId}/activeSessions/${sessionId}`).get();
    if (!activeSnap.exists) return bad("Session not found.", 404);

    const active = activeSnap.data() as any;
    if (active.customerAccessEnabled !== true) return bad("Customer access disabled.", 403);
    if (Number(active.customerAccessExpiresAtMs || 0) <= Date.now()) return bad("Customer access expired.", 403);

    // Ordering into a bill that is being settled would either miss the payment
    // or abort the cashier's checkout on a billingRevision bump.
    const status = String(active.status || "").toLowerCase();
    if (status && CLOSED_STATUSES.has(status)) {
      return bad("Your bill is being closed — please ask our staff.", 409);
    }

    let participantInfo;
    try {
      participantInfo = await validateActiveParticipant(db, storeId, sessionId, participantId);
    } catch (e: any) {
      return bad(e.message, e.httpStatus || 403);
    }

    // ---- price and validate EVERY line before writing any ticket -----------
    const cacheSnap = await db.doc(`stores/${storeId}/catalogCache/main`).get();
    if (!cacheSnap.exists) return bad("Menu unavailable right now — please ask our staff.", 503);

    const resolved = resolveOrderLines(cacheSnap.data(), body?.items);
    if (!resolved.ok) return bad(resolved.error, resolved.status);

    // ---- one-shot claim, so a double tap cannot order twice ----------------
    try {
      await claimOrderRequest(db, { storeId, sessionId, participantId, clientRequestId });
    } catch (e: any) {
      return bad(e?.message ?? "Could not send your order.", e?.httpStatus || 409);
    }

    const tableNumber = String(active.tableNumber || "");
    const sessionLabel = String(active.tableDisplayName || (tableNumber ? `Table ${tableNumber}` : ""));
    const sessionMode = String(active.sessionMode || "package_dinein");
    const customerName = active.customerName ?? null;
    const guestCount =
      Number(active.guestCountFinal ?? active.guestCountCashierInitial ?? active.guestCount ?? 0) || 0;

    const createdTicketIds: string[] = [];

    try {
      for (const line of resolved.lines) {
        const ticketId = await writeKitchenTicket(db, {
          storeId,
          sessionId,
          kitchenLocationId: line.kitchenLocationId,
          kitchenLocationName: line.kitchenLocationName || "Kitchen",
          type: "addon",
          itemId: line.itemId,
          itemName: line.itemName,
          qty: line.qty,
          notes: line.note ?? "",
          session: { tableNumber, sessionLabel, sessionMode, customerName, guestCount },
          actor: {
            createdByUid,
            participantId,
            slotNumber: participantInfo.slotNumber,
            joinMethod: participantInfo.joinMethod,
          },
          extra: {
            source: "customer_app",
            // The half of the bill-on-serve contract POS reads. Everything
            // needed to price the line travels with the ticket, so a later
            // catalog edit cannot change what this diner was quoted.
            billOnServe: true,
            pendingBillLine: {
              lineId: line.lineId,
              itemId: line.itemId,
              itemName: line.itemName,
              category: line.category,
              unitPrice: line.unitPrice,
              modifiers: line.modifiers,
              modifiersText: line.modifiersText,
              modifiersTotal: line.modifiersTotal,
              kitchenLocationId: line.kitchenLocationId,
              kitchenLocationName: line.kitchenLocationName,
              note: line.note,
            },
            // Rendered on the KDS card the same way a refill's flavour note is.
            modifiersText: line.modifiersText,
          },
        });
        createdTicketIds.push(ticketId);
      }
    } catch (e: any) {
      // Let the diner simply tap again rather than telling them a failed order
      // "was already sent".
      await releaseOrderRequest(db, { storeId, sessionId, participantId, clientRequestId });
      throw e;
    }

    return NextResponse.json({
      ok: true,
      ticketIds: createdTicketIds,
      total: orderTotal(resolved.lines),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
