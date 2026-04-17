import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { normalizePhone } from "@/lib/phone";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
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
    const activeSnap = await db.doc(`stores/${storeId}/activeSessions/${sessionId}`).get();
    senderPhone = (activeSnap.data() as any)?.linkedCustomerPhone ?? null;
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

  // Atomic transaction
  try {
    const senderRef = db.doc(`customers/${senderPhone}`);
    const recipientRef = db.doc(`customers/${recipientPhone}`);

    const result = await db.runTransaction(async (tx) => {
      const senderSnap = await tx.get(senderRef);
      if (!senderSnap.exists) throw new Error("Sender account not found.");
      const senderData = senderSnap.data() as any;
      const senderBalance = Number(senderData.pointsBalance || 0);

      if (senderBalance < points) {
        throw new Error(`Insufficient points. You have ${senderBalance} points.`);
      }

      const recipientSnap = await tx.get(recipientRef);
      if (!recipientSnap.exists) throw new Error("Recipient account not found.");
      const recipientData = recipientSnap.data() as any;

      const senderName = String(senderData.name || "");
      const recipientName = String(recipientData.name || "");

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

      // Audit log
      const logRef = db.collection("loyaltyLogs").doc();
      tx.set(logRef, {
        type: "points_transferred",
        phone: senderPhone,
        customerName: senderName,
        actorUid: decoded.uid,
        points,
        source: "customer_transfer",
        recipientPhone,
        recipientName,
        createdAt: FieldValue.serverTimestamp(),
      });

      return { recipientName };
    });

    return NextResponse.json({ ok: true, recipientName: result.recipientName, points });
  } catch (err: any) {
    const msg = err.message || "Transfer failed.";
    return bad(msg, msg.includes("Insufficient") || msg.includes("not found") ? 400 : 500);
  }
}
