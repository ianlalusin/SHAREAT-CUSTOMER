import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminAuth } from "@/lib/firebase/admin";
import { eraseCard } from "@/lib/server/retention-job";
import { authorizeSelfService } from "@/lib/server/self-service";
import { CLEARED_LINKER_FIELDS } from "@/lib/server/session-link";

export const runtime = "nodejs";
export const maxDuration = 120;

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/**
 * Take this card off the table the diner is sitting at, so the bill does not
 * try to earn points for a card that no longer exists. A paid (locked) session
 * is left alone: the link is part of a closed bill.
 */
async function unlinkCurrentTable(db: Firestore, storeId: string, sessionId: string, phone: string) {
  const clear = { linkedCustomerPhone: null, linkedByParticipantId: null, linkedCustomerName: null, ...CLEARED_LINKER_FIELDS };
  const refs = [db.doc(`stores/${storeId}/activeSessions/${sessionId}`), db.doc(`stores/${storeId}/sessions/${sessionId}`)];
  await db.runTransaction(async (tx) => {
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));
    snaps.forEach((s, i) => {
      const d = s.exists ? (s.data() as { linkedCustomerPhone?: string; linkedCustomerLockedAt?: unknown }) : null;
      if (d && d.linkedCustomerPhone === phone && !d.linkedCustomerLockedAt) tx.update(refs[i], clear);
    });
  });
}

/**
 * "Delete my card" (audit PRV-02a). Needs the card owner, their password, and
 * the word DELETE. Erases the card the same way the two-year cleanup does:
 * the card, password record and points history go; logs and vouchers keep the
 * record but lose the name and phone; POS receipts (tax records) stay. Any
 * points left are forfeited. Blocked while a claimed reward is holding points.
 */
export async function POST(req: Request) {
  const auth = await authorizeSelfService(req);
  if (!auth.ok) return auth.response;
  const { db, decoded, phone, profile, body } = auth;

  if (body.confirm !== "DELETE") return bad("Type DELETE to confirm.");
  if (Number(profile.pointsReserved || 0) > 0) {
    return bad("You have a reward waiting to be used. Use it or let it expire, then try again.", 409);
  }

  try {
    if (decoded.customer === true && decoded.storeId && decoded.sessionId) {
      await unlinkCurrentTable(db, String(decoded.storeId), String(decoded.sessionId), phone);
    }
    const { points } = await eraseCard(db, phone, Date.now(), { reason: "deleted by the cardholder in the app" });

    // Best effort: remove the sign-in record too. The card is already gone.
    if (decoded.loyaltyCustomer === true) {
      try {
        await getAdminAuth().deleteUser(phone);
      } catch {}
    }
    return NextResponse.json({ ok: true, pointsForfeited: points });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Could not delete the card. Try again.", 500);
  }
}
