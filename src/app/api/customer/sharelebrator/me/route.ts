import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { loadLoyaltyCard } from "@/lib/server/loyalty-card";
import { isCashierLinked } from "@/lib/server/session-link";

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
    if (!activeSnap.exists) return NextResponse.json({ ok: true, linked: false });
    sessionData = activeSnap.data();
    phone = sessionData?.linkedCustomerPhone ?? null;
    locked = !!sessionData?.linkedCustomerLockedAt;
    if (!phone) return NextResponse.json({ ok: true, linked: false });

    /**
     * The link lives on the SESSION doc, which everyone at the table shares.
     * Reading it as "this caller's card" handed every other diner the
     * cardholder's name, phone, birthday, address, email and last 20 points
     * entries. Only the phone that linked it gets the card back.
     *
     * A link written before `linkedByParticipantId` existed has no owner
     * recorded, and an unknown owner is not this caller: the cardholder sees
     * the notice too until they re-link, which is the safe way round. Sessions
     * last one meal, so that self-heals within hours.
     */
    const linkedBy = String(sessionData?.linkedByParticipantId || "");
    const participantId = String((decoded as any).participantId || "");
    if (!linkedBy || !participantId || linkedBy !== participantId) {
      return NextResponse.json({
        ok: true,
        linked: false,
        // Nothing but the display name already stored on the session — enough
        // to say who to ask, and no more.
        sessionLink: {
          byOther: true,
          // Who must be asked to change it: only the cashier can undo a
          // cashier link, so the UI points the diner there, not at the card.
          byCashier: isCashierLinked(sessionData),
          name: String(sessionData?.linkedCustomerName || "another diner"),
        },
      });
    }
  } else if (decoded.loyaltyCustomer === true) {
    phone = String(decoded.phone || "");
    if (!phone) return bad("Loyalty token missing phone claim.", 403);
  } else {
    return bad("Unauthorized token type.", 403);
  }

  const card = await loadLoyaltyCard(db, phone);
  if (!card) return NextResponse.json({ ok: true, linked: false });

  return NextResponse.json({ ok: true, linked: true, locked, ...card });
}
