import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  // Verify session token (customer:true with storeId + sessionId)
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

  // Read the session's linked phone
  const activeSnap = await db.doc(`stores/${storeId}/activeSessions/${sessionId}`).get();
  const sessionData = activeSnap.data() as any;
  const phone = sessionData?.linkedCustomerPhone;
  if (!phone) return NextResponse.json({ ok: true, linked: false });

  const customerSnap = await db.doc(`customers/${phone}`).get();
  if (!customerSnap.exists) return NextResponse.json({ ok: true, linked: false });

  const c = customerSnap.data() as any;

  // Recent ledger entries (last 20)
  const ledgerSnap = await db
    .collection(`customers/${phone}/pointsLedger`)
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();

  const ledger = ledgerSnap.docs.map((d) => {
    const data = d.data();
    const ts = data.createdAt?.toMillis ? data.createdAt.toMillis() : null;
    return {
      id: d.id,
      type: data.type,
      points: data.points,
      amount: data.amount,
      storeId: data.storeId,
      sessionId: data.sessionId,
      createdAtMs: ts,
    };
  });

  return NextResponse.json({
    ok: true,
    linked: true,
    locked: !!sessionData?.linkedCustomerLockedAt,
    customer: {
      phone: c.phone,
      name: c.name,
      bday: c.bday,
      address: c.address ?? "",
      email: c.email ?? null,
      pointsBalance: c.pointsBalance ?? 0,
    },
    ledger,
  });
}
