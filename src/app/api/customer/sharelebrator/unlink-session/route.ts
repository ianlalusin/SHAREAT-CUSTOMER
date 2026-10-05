import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { canDinerUnlink, CLEARED_LINKER_FIELDS } from "@/lib/server/session-link";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return bad("Missing session token.", 401);

  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(match[1]);
  } catch {
    return bad("Invalid session token.", 401);
  }

  if (decoded.customer !== true) return bad("Not a customer session.", 403);
  const storeId = String(decoded.storeId || "");
  const sessionId = String(decoded.sessionId || "");
  if (!storeId || !sessionId) return bad("Session claims missing storeId/sessionId.", 403);

  const db = getAdminDb();
  const activeRef = db.doc(`stores/${storeId}/activeSessions/${sessionId}`);
  const sessionRef = db.doc(`stores/${storeId}/sessions/${sessionId}`);

  const activeSnap = await activeRef.get();
  if (activeSnap.exists) {
    const sData = activeSnap.data() as any;
    if (sData.linkedCustomerLockedAt) {
      return bad("This session has been paid; link can no longer be changed.", 409);
    }
    // A cashier link is earn-only and belongs to the cashier: no diner at the
    // table may drop it (the caller is not the linker).
    const verdict = canDinerUnlink(sData);
    if (!verdict.ok) return bad(verdict.error, verdict.status);
  }

  const clear = {
    linkedCustomerPhone: null,
    linkedByParticipantId: null,
    linkedCustomerName: null,
    ...CLEARED_LINKER_FIELDS,
  };

  const batch = db.batch();
  if (activeSnap.exists) batch.update(activeRef, clear);
  const sessionSnap = await sessionRef.get();
  if (sessionSnap.exists) batch.update(sessionRef, clear);
  await batch.commit();

  return NextResponse.json({ ok: true });
}
