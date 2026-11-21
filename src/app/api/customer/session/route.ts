import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { validateActiveParticipant } from "@/lib/server/customer-participants";
import { REFILL_COOLDOWN_MS, toNextAllowedMap } from "@/lib/refill-cooldown";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
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

    const snap = await db.doc(`stores/${storeId}/activeSessions/${sessionId}`).get();
    if (!snap.exists) return bad("Session not found.", 404);

    const s = snap.data() as any;

    if (Object.prototype.hasOwnProperty.call(s, "customerAccessEnabled") && s.customerAccessEnabled !== true) {
      return bad("Customer access disabled.", 403);
    }
    if (Object.prototype.hasOwnProperty.call(s, "customerAccessExpiresAtMs") && Number(s.customerAccessExpiresAtMs || 0) <= Date.now()) {
      return bad("Customer access expired.", 403);
    }

    let participantInfo;
    try {
      participantInfo = await validateActiveParticipant(db, storeId, sessionId, participantId);
    } catch (e: any) {
      return bad(e.message, e.httpStatus || 403);
    }

    return NextResponse.json({
      ok: true,
      session: {
        storeId,
        sessionId,
        customerName: String(s.customerName || "Customer"),
        tableId: String(s.tableId || ""),
        tableNumber: String(s.tableNumber || ""),
        tableDisplayName: String(s.tableDisplayName || ""),
        // Same order POS uses for the table's guest limit.
        guestCount: Number(s.guestCountFinal ?? s.guestCountCashierInitial ?? s.guestCount ?? 0) || 0,
        packageOfferingId: String(s.packageOfferingId || ""),
        packageName: String(s.packageName || s.packageSnapshot?.name || ""),
        initialFlavorIds: Array.isArray(s.initialFlavorIds) ? s.initialFlavorIds : [],
        status: String(s.status || ""),
        sessionMode: String(s.sessionMode || ""),
        participantId,
        slotNumber: participantInfo.slotNumber,
        participantStatus: "active",
        // Per-meat refill countdowns for this phone. Server-hydrated so they
        // survive a page reload, unlike the in-memory assistance cooldown.
        refillCooldowns: {
          cooldownMs: REFILL_COOLDOWN_MS,
          nextAllowedAt: toNextAllowedMap(participantInfo.refillCooldowns, Date.now()),
        },
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
