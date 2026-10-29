import { NextResponse } from "next/server";
import { checkLiveParticipant } from "@/lib/server/customer-gate";
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
  const participantId = String((decoded as any).participantId || "");

  const db = getAdminDb();
  const live = await checkLiveParticipant(db, decoded);
  if (!live.ok) return bad(live.error, live.status);
  const activeRef = db.doc(`stores/${storeId}/activeSessions/${sessionId}`);
  const sessionRef = db.doc(`stores/${storeId}/sessions/${sessionId}`);

  const clear = {
    linkedCustomerPhone: null,
    linkedByParticipantId: null,
    linkedCustomerName: null,
    ...CLEARED_LINKER_FIELDS,
  };

  // Check and write in one transaction: a cashier link (or a payment lock)
  // landing between a separate read and write must not be nulled by a diner.
  const rejected = await db.runTransaction(async (tx: any) => {
    const activeSnap = await tx.get(activeRef);
    const sessionSnap = await tx.get(sessionRef);
    if (activeSnap.exists) {
      const sData = activeSnap.data() as any;
      if (sData.linkedCustomerLockedAt) {
        return { error: "This session has been paid; link can no longer be changed.", status: 409 };
      }
      // A cashier link is earn-only and belongs to the cashier: no diner at the
      // table may drop it (the caller is not the linker). A diner link belongs
      // to the diner who made it — another phone at the table must not be able
      // to drop it and link their own card to collect this meal's points.
      const verdict = canDinerUnlink(sData, participantId);
      if (!verdict.ok) return verdict;
    }
    if (activeSnap.exists) tx.update(activeRef, clear);
    if (sessionSnap.exists) tx.update(sessionRef, clear);
    return null;
  });
  if (rejected) return bad(rejected.error, rejected.status);

  return NextResponse.json({ ok: true });
}
