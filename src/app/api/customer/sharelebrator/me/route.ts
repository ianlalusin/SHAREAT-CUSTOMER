import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return bad("Missing bearer token.", 401);

  let decoded: any;
  try {
    decoded = await getAdminAuth().verifyIdToken(match[1]);
  } catch {
    return bad("Invalid token.", 401);
  }

  const db = getAdminDb();

  // Resolve phone + session context from either auth mode
  let phone: string | null = null;
  let sessionData: any = null;
  let locked = false;

  if (decoded.customer === true) {
    const storeId = String(decoded.storeId || "");
    const sessionId = String(decoded.sessionId || "");
    if (!storeId || !sessionId) return bad("Session claims missing storeId/sessionId.", 403);

    const activeSnap = await db.doc(`stores/${storeId}/activeSessions/${sessionId}`).get();
    sessionData = activeSnap.data();
    phone = sessionData?.linkedCustomerPhone ?? null;
    locked = !!sessionData?.linkedCustomerLockedAt;
    if (!phone) return NextResponse.json({ ok: true, linked: false });
  } else if (decoded.loyaltyCustomer === true) {
    phone = String(decoded.phone || "");
    if (!phone) return bad("Loyalty token missing phone claim.", 403);
  } else {
    return bad("Unauthorized token type.", 403);
  }

  const customerSnap = await db.doc(`customers/${phone}`).get();
  if (!customerSnap.exists) return NextResponse.json({ ok: true, linked: false });

  const c = customerSnap.data() as any;

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
    locked,
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
