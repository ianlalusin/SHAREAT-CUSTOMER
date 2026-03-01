import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  try {
    const authz = req.headers.get("authorization") || "";
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return bad("Missing Authorization Bearer token.", 401);

    const idToken = m[1];
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);

    // must be a customer token
    if (decoded.customer !== true) return bad("Not a customer token.", 403);

    const storeId = String((decoded as any).storeId || "");
    const sessionId = String((decoded as any).sessionId || "");
    if (!storeId || !sessionId) return bad("Missing storeId/sessionId in token.", 403);

    const db = getAdminDb();

    // canonical source of truth (POS projection)
    const snap = await db.doc(`stores/${storeId}/activeSessions/${sessionId}`).get();
    if (!snap.exists) return bad("Session not found.", 404);

    const s = snap.data() as any;

    // OPTIONAL: enforce customer access window server-side too
    if (s.customerAccessEnabled !== true) return bad("Customer access disabled.", 403);
    if (Number(s.customerAccessExpiresAtMs || 0) <= Date.now()) return bad("Customer access expired.", 403);

    return NextResponse.json({
      ok: true,
      session: {
        storeId,
        sessionId,
        customerName: String(s.customerName || "Customer"),
        tableId: String(s.tableId || ""),
        tableNumber: String(s.tableNumber || ""),
        tableDisplayName: String(s.tableDisplayName || ""),
        packageOfferingId: String(s.packageOfferingId || ""),
        packageName: String(s.packageName || s.packageSnapshot?.name || ""),
        initialFlavorIds: Array.isArray(s.initialFlavorIds) ? s.initialFlavorIds : [],
        status: String(s.status || ""),
        sessionMode: String(s.sessionMode || ""),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
