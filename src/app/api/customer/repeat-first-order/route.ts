import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  try {
    const authz = req.headers.get("authorization") || "";
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return bad("Missing Authorization Bearer token.", 401);

    const idToken = m[1];
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);

    if ((decoded as any).customer !== true) return bad("Not a customer token.", 403);

    const storeId = String((decoded as any).storeId || "");
    const sessionId = String((decoded as any).sessionId || "");
    if (!storeId || !sessionId) return bad("Missing storeId/sessionId in token.", 403);

    const createdByUid = String(decoded.uid || "");

    const db = getAdminDb();

    // Canonical session
    const activeSnap = await db.doc(`stores/${storeId}/activeSessions/${sessionId}`).get();
    if (!activeSnap.exists) return bad("Session not found.", 404);

    const active = activeSnap.data() as any;
    if (active.customerAccessEnabled !== true) return bad("Customer access disabled.", 403);
    if (Number(active.customerAccessExpiresAtMs || 0) <= Date.now()) return bad("Customer access expired.", 403);

    const tableNumber = String(active.tableNumber || "");
    const sessionLabel = String(active.tableDisplayName || (tableNumber ? `Table ${tableNumber}` : ""));
    const sessionMode = String(active.sessionMode || "package_dinein");
    const customerName = active.customerName ?? null;

    const guestCount =
      Number(active.guestCountFinal ?? active.guestCountCashierInitial ?? active.guestCount ?? 0) || 0;

    const packageOfferingId = String(active.packageOfferingId || "");
    let packageName = String(active.packageName || active.packageSnapshot?.name || "");

    // Load package to get refillsAllowed (source of truth)
    let refillsAllowed: string[] = [];
    if (packageOfferingId) {
      const pkgSnap = await db.doc(`stores/${storeId}/storePackages/${packageOfferingId}`).get();
      if (pkgSnap.exists) {
        const pkg = pkgSnap.data() as any;
        packageName = String(pkg.packageName || pkg.name || packageName || "");
        refillsAllowed = Array.isArray(pkg.refillsAllowed) ? pkg.refillsAllowed : [];
      }
    }
    if (!refillsAllowed.length) return bad("No refills allowed for this package.", 400);

    // Pick first allowed refill to decide kitchen location
    const firstRefillId = String(refillsAllowed[0] || "");
    const firstRefillSnap = await db.doc(`stores/${storeId}/storeRefills/${firstRefillId}`).get();
    if (!firstRefillSnap.exists) return bad("First refill config not found.", 500);

    const firstRefill = firstRefillSnap.data() as any;
    const kitchenLocationId = String(firstRefill.kitchenLocationId || "");
    const kitchenLocationName = String(firstRefill.kitchenLocationName || "Kitchen");
    if (!kitchenLocationId) return bad("First refill has no kitchenLocationId.", 500);

    const initialFlavorIds = Array.isArray(active.initialFlavorIds) ? active.initialFlavorIds : [];
    const notes =
      initialFlavorIds.length > 0
        ? `Flavors: ${initialFlavorIds.join(", ")}`
        : "";

    // Single consolidated ticket
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

        customerName,
        durationMs: 0,
        guestCount,

        id: ticketRef.id,

        // Consolidated item
        itemId: `repeat_first_order_${packageOfferingId || "package"}`,
        itemName: `REFILL - ${packageName || "PACKAGE"}`,

        kitchenLocationId,
        kitchenLocationName,

        notes,
        qty: 1,

        sessionId,
        sessionLabel,
        sessionMode,

        status: "preparing",

        storeId,
        tableNumber,

        type: "refill",

        updatedAt: FieldValue.serverTimestamp(),

        // optional: include allowed refill ids for kitchen reference (won't break POS if ignored)
        refillsAllowed,
        initialFlavorIds,
      };

      tx.set(ticketRef, ticket, { merge: false });

      // Update rtKdsTickets projection (exact style)
      tickets[ticketRef.id] = ticket;

      if (!activeIds.includes(ticketRef.id)) activeIds.unshift(ticketRef.id);

      const idxArr = Array.isArray(sessionIndex[sessionId]) ? [...sessionIndex[sessionId]] : [];
      if (!idxArr.includes(ticketRef.id)) idxArr.unshift(ticketRef.id);
      sessionIndex[sessionId] = idxArr;

      tx.set(
        rtRef,
        {
          kitchenLocationId,
          activeIds,
          sessionIndex,
          tickets,
          meta: {
            source: "createKitchenTickets",
            updatedAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );
    });

    return NextResponse.json({
      ok: true,
      ticketId: ticketRef.id,
      kitchenLocationId,
      kitchenLocationName,
      itemName: `REFILL - ${packageName || "PACKAGE"}`,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
