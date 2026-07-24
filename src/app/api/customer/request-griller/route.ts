import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { validateActiveParticipant } from "@/lib/server/customer-participants";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

// "Add Griller" confirm. Writes a customerRequests doc (type "griller") that
// staff (KDS + server) get alerted on, with Add/Cancel actions. Deduped per
// session so repeat taps don't stack alerts.
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

    const db = getAdminDb();

    const activeRef = db.doc(`stores/${storeId}/activeSessions/${sessionId}`);
    const activeSnap = await activeRef.get();
    if (!activeSnap.exists) return bad("Session not found.", 404);

    const active = activeSnap.data() as any;
    if (active.customerAccessEnabled !== true) return bad("Customer access disabled.", 403);
    if (Number(active.customerAccessExpiresAtMs || 0) <= Date.now()) return bad("Customer access expired.", 403);

    // Defensive: griller is a dine-in add-on only. À la carte sessions never
    // reach this dashboard today (no PIN is issued), but guard anyway in
    // case that ever changes.
    if (active.sessionMode && active.sessionMode !== "package_dinein") {
      return bad("Griller requests are only available for dine-in sessions.", 403);
    }

    try {
      await validateActiveParticipant(db, storeId, sessionId, participantId);
    } catch (e: any) {
      return bad(e.message, e.httpStatus || 403);
    }

    const requestsRef = db.collection(`stores/${storeId}/customerRequests`);

    // Dedupe: if this session already has a pending griller request, reuse it
    // so staff don't get a duplicate alert.
    const existing = await requestsRef
      .where("sessionId", "==", sessionId)
      .where("status", "==", "pending")
      .limit(5)
      .get();
    const open = existing.docs.find((d) => (d.data() as any).type === "griller");
    if (open) {
      return NextResponse.json({ ok: true, requestId: open.id, deduped: true });
    }

    const tableNumber = String(active.tableNumber || "");
    const tableDisplayName = String(active.tableDisplayName || (tableNumber ? `Table ${tableNumber}` : ""));
    const customerName = active.customerName ?? null;

    const requestRef = requestsRef.doc();
    const createdAtClientMs = Date.now();

    await requestRef.set({
      id: requestRef.id,
      storeId,
      sessionId,
      participantId,
      type: "griller",
      text: "requested an additional griller",
      tableNumber,
      tableDisplayName,
      customerName,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      createdAtClientMs,
      createdByUid,
    });

    return NextResponse.json({ ok: true, requestId: requestRef.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
