import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { normalizePhone } from "@/lib/phone";
import { writeLoyaltyLog } from "@/lib/server/loyaltyLog";
import { maskDisplayName } from "@/lib/server/mask-name";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { resolveTokenCard } from "@/lib/server/session-link";

export const runtime = "nodejs";

const MAX_SEND_PER_DAY = 50;
const MAX_RECEIVE_PER_DAY = 100;

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function getManilaStartOfDayTimestamp(): Timestamp {
  const now = new Date();
  const manilaStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); // YYYY-MM-DD
  // Parse as Manila midnight, convert to UTC
  const midnightManila = new Date(`${manilaStr}T00:00:00+08:00`);
  return Timestamp.fromDate(midnightManila);
}

async function getDailySentTotal(db: any, phone: string, startOfDay: Timestamp): Promise<number> {
  const snap = await db
    .collection(`customers/${phone}/pointsLedger`)
    .where("createdAt", ">=", startOfDay)
    .get();
  let total = 0;
  snap.docs.forEach((d: any) => {
    const data = d.data();
    if (data.type === "transfer_out") total += Math.abs(Number(data.points || 0));
  });
  return total;
}

async function getDailyReceivedTotal(db: any, phone: string, startOfDay: Timestamp): Promise<number> {
  const snap = await db
    .collection(`customers/${phone}/pointsLedger`)
    .where("createdAt", ">=", startOfDay)
    .get();
  let total = 0;
  snap.docs.forEach((d: any) => {
    const data = d.data();
    if (data.type === "transfer_in") total += Number(data.points || 0);
  });
  return total;
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return bad("Missing bearer token.", 401);

  let decoded: any;
  try {
    decoded = await getAdminAuth().verifyIdToken(match[1]);
  } catch {
    return bad("Invalid token.", 401);
  }

  // Resolve sender phone from token
  const db = getAdminDb();
  let senderPhone: string | null = null;

  if (decoded.customer === true) {
    const storeId = String(decoded.storeId || "");
    const sessionId = String(decoded.sessionId || "");
    if (!storeId || !sessionId) return bad("Session claims missing.", 403);
    // Only the participant that linked the card may spend it; a cashier link is
    // earn-only. resolveTokenCard also refuses a phone removed from the table
    // or a table closed to customers (audit SEC-04).
    const card = await resolveTokenCard(db, decoded);
    if (!card.ok) return bad(card.message, card.reason === "none" ? 400 : 403);
    senderPhone = card.phone;
  } else if (decoded.loyaltyCustomer === true) {
    senderPhone = String(decoded.phone || "");
  } else {
    return bad("Unauthorized.", 403);
  }

  if (!senderPhone) return bad("No loyalty card linked to this session.", 400);

  // Parse body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body.");
  }

  const recipientPhone = normalizePhone(body.recipientPhone);
  const points = Number(body.points);

  if (!recipientPhone) return bad("Invalid recipient phone number format.");
  if (!Number.isInteger(points) || points <= 0) return bad("Points must be a positive integer.");
  if (senderPhone === recipientPhone) return bad("Cannot transfer points to yourself.");

  // Rate limiting: check daily totals
  const startOfDay = getManilaStartOfDayTimestamp();

  const [sentToday, receivedToday] = await Promise.all([
    getDailySentTotal(db, senderPhone, startOfDay),
    getDailyReceivedTotal(db, recipientPhone, startOfDay),
  ]);

  if (sentToday + points > MAX_SEND_PER_DAY) {
    const remaining = Math.max(0, MAX_SEND_PER_DAY - sentToday);
    return bad(`Daily send limit reached. You can send up to ${remaining} more point${remaining === 1 ? "" : "s"} today.`);
  }

  if (receivedToday + points > MAX_RECEIVE_PER_DAY) {
    return bad("Recipient has reached the daily receive limit of 100 points.");
  }

  // Atomic transaction
  try {
    const senderRef = db.doc(`customers/${senderPhone}`);
    const recipientRef = db.doc(`customers/${recipientPhone}`);

    // Per-account, per-Manila-day counters, read and bumped INSIDE the
    // transaction. The ledger totals above are read outside it, so two sends
    // fired together both saw the same total and both passed (audit COR-02).
    // A counter missing for today is seeded from that ledger total, so sends
    // made earlier today, before counters existed, still count.
    const day = new Date(startOfDay.toMillis() + 8 * 3600_000).toISOString().slice(0, 10); // Manila date
    const sentRef = senderRef.collection("transferDays").doc(day);
    const receivedRef = recipientRef.collection("transferDays").doc(day);

    const result = await db.runTransaction(async (tx: any) => {
      const [senderSnap, sentSnap, receivedSnap] = await Promise.all([
        tx.get(senderRef),
        tx.get(sentRef),
        tx.get(receivedRef),
      ]);
      const sentSoFar = sentSnap.exists ? Number(sentSnap.data()?.sent || 0) : sentToday;
      const receivedSoFar = receivedSnap.exists ? Number(receivedSnap.data()?.received || 0) : receivedToday;
      if (sentSoFar + points > MAX_SEND_PER_DAY) {
        const remaining = Math.max(0, MAX_SEND_PER_DAY - sentSoFar);
        throw new Error(`Daily send limit reached. You can send up to ${remaining} more point${remaining === 1 ? "" : "s"} today.`);
      }
      if (receivedSoFar + points > MAX_RECEIVE_PER_DAY) {
        throw new Error("Recipient has reached the daily receive limit of 100 points.");
      }
      if (!senderSnap.exists) throw new Error("Sender account not found.");
      const senderData = senderSnap.data() as any;
      const senderBalance = Number(senderData.pointsBalance || 0);
      // Points held by an unredeemed voucher are already promised: claiming a
      // reward reserves them and POS spends them at payment. Sending them away
      // first would leave that spend to drive the balance negative.
      const senderReserved = Math.max(0, Number(senderData.pointsReserved || 0));
      const spendable = senderBalance - senderReserved;

      if (spendable < points) {
        throw new Error(
          senderReserved > 0 && senderBalance >= points
            ? `Insufficient points. ${senderReserved} of your points are held for a reward you claimed.`
            : "Insufficient points."
        );
      }

      const recipientSnap = await tx.get(recipientRef);
      if (!recipientSnap.exists) throw new Error("Recipient account not found.");
      const recipientData = recipientSnap.data() as any;

      const senderName = String(senderData.name || "");
      const recipientName = String(recipientData.name || "");

      tx.set(sentRef, { sent: sentSoFar + points, day, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(receivedRef, { received: receivedSoFar + points, day, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

      // Debit sender
      tx.update(senderRef, {
        pointsBalance: FieldValue.increment(-points),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Credit receiver
      tx.update(recipientRef, {
        pointsBalance: FieldValue.increment(points),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Sender ledger entry
      const senderLedgerRef = senderRef.collection("pointsLedger").doc();
      tx.set(senderLedgerRef, {
        type: "transfer_out",
        points: -points,
        amount: 0,
        storeId: "",
        storeName: "",
        sessionId: "",
        recipientPhone,
        recipientName,
        createdAt: FieldValue.serverTimestamp(),
        createdByUid: decoded.uid,
      });

      // Receiver ledger entry
      const recipientLedgerRef = recipientRef.collection("pointsLedger").doc();
      tx.set(recipientLedgerRef, {
        type: "transfer_in",
        points,
        amount: 0,
        storeId: "",
        storeName: "",
        sessionId: "",
        senderPhone,
        senderName,
        createdAt: FieldValue.serverTimestamp(),
        createdByUid: decoded.uid,
      });

      return { senderName, recipientName };
    });

    // Audit log via daily projection (best-effort, after tx committed)
    try {
      await writeLoyaltyLog({
        type: "points_transferred",
        phone: senderPhone,
        customerName: result.senderName,
        actorUid: decoded.uid,
        source: "customer_transfer",
        points,
      });
    } catch {}

    return NextResponse.json({ ok: true, recipientName: maskDisplayName(result.recipientName), points });
  } catch (err: any) {
    const msg = err.message || "Transfer failed.";
    return bad(msg, msg.includes("Insufficient") || msg.includes("not found") || msg.includes("limit") ? 400 : 500);
  }
}
