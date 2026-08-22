import type { Firestore } from "firebase-admin/firestore";

/**
 * One customer's card and recent points history.
 *
 * Shared by /sharelebrator/me and the no-link "view my own card" path so the
 * two cannot drift: the second exists precisely because a diner whose table is
 * already linked to someone else must still be able to read their own card,
 * and it would be a poor trade to fix that by duplicating what a card is.
 *
 * Says nothing about WHO may see this — callers do that. /me gates on the
 * participant that linked the session; the read-only path gates on the
 * password the caller just proved.
 */

export type LoyaltyLedgerEntry = {
  id: string;
  type: string;
  points: number;
  amount: number;
  storeId: string;
  sessionId: string;
  createdAtMs: number | null;
  recipientName: string | null;
  recipientPhone: string | null;
  senderName: string | null;
  senderPhone: string | null;
};

export type LoyaltyCard = {
  customer: {
    phone: string;
    name: string;
    bday: string;
    address: string;
    email: string | null;
    pointsBalance: number;
    pointsReserved: number;
    available: number;
  };
  ledger: LoyaltyLedgerEntry[];
};

/** The most recent entries a cardholder is shown. */
const LEDGER_LIMIT = 20;

export async function loadLoyaltyCard(db: Firestore, phone: string): Promise<LoyaltyCard | null> {
  const customerSnap = await db.doc(`customers/${phone}`).get();
  if (!customerSnap.exists) return null;

  const c = customerSnap.data() as any;
  const pointsBalance = Number(c.pointsBalance ?? 0);
  const pointsReserved = Number(c.pointsReserved ?? 0);

  const ledgerSnap = await db
    .collection(`customers/${phone}/pointsLedger`)
    .orderBy("createdAt", "desc")
    .limit(LEDGER_LIMIT)
    .get();

  return {
    customer: {
      phone: c.phone,
      name: c.name,
      bday: c.bday,
      address: c.address ?? "",
      email: c.email ?? null,
      pointsBalance,
      pointsReserved,
      available: Math.max(0, pointsBalance - pointsReserved),
    },
    ledger: ledgerSnap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        type: data.type,
        points: data.points,
        amount: data.amount,
        storeId: data.storeId,
        sessionId: data.sessionId,
        createdAtMs: data.createdAt?.toMillis ? data.createdAt.toMillis() : null,
        recipientName: data.recipientName ?? null,
        recipientPhone: data.recipientPhone ?? null,
        senderName: data.senderName ?? null,
        senderPhone: data.senderPhone ?? null,
      };
    }),
  };
}
