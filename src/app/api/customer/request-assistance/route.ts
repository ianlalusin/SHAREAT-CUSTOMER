import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { validateActiveParticipant } from "@/lib/server/customer-participants";
import { createPendingCustomerRequest } from "@/lib/server/customer-request";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

// One-tap "Ask for assistance". Writes a customerRequests doc (type "assistance")
// that staff (KDS + server) get alerted on. Deduped per session so repeat taps
// don't stack alerts.
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

    try {
      await validateActiveParticipant(db, storeId, sessionId, participantId);
    } catch (e: any) {
      return bad(e.message, e.httpStatus || 403);
    }

    const tableNumber = String(active.tableNumber || "");
    const tableDisplayName = String(active.tableDisplayName || (tableNumber ? `Table ${tableNumber}` : ""));
    const customerName = active.customerName ?? null;

    // Dedupe: if this session already has a pending assistance call, reuse it so
    // staff don't get a duplicate alert. Atomic — see createPendingCustomerRequest.
    const { requestId, deduped } = await createPendingCustomerRequest(db, {
      storeId,
      sessionId,
      participantId,
      createdByUid,
      type: "assistance",
      text: "Assistance requested",
      tableNumber,
      tableDisplayName,
      customerName,
    });

    return NextResponse.json(deduped ? { ok: true, requestId, deduped: true } : { ok: true, requestId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
