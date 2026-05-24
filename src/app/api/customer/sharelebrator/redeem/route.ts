import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { writeLoyaltyLog } from "@/lib/server/loyaltyLog";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

const DEFAULT_EXPIRY_MIN = 60;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function genCode(len = 6): string {
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

async function resolvePhone(db: any, decoded: any): Promise<string | null> {
  if (decoded.customer === true) {
    const storeId = String(decoded.storeId || "");
    const sessionId = String(decoded.sessionId || "");
    if (!storeId || !sessionId) return null;
    const snap = await db.doc(`stores/${storeId}/activeSessions/${sessionId}`).get();
    return snap.exists ? (snap.data()?.linkedCustomerPhone ?? null) : null;
  }
  if (decoded.loyaltyCustomer === true) return String(decoded.phone || "") || null;
  return null;
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body.");
  }
  const rewardId = String(body.rewardId || "");
  if (!rewardId) return bad("Missing rewardId.");

  const db = getAdminDb();
  const phone = await resolvePhone(db, decoded);
  if (!phone) return bad("No loyalty card linked.", 403);

  // Resolve expiry window (store-configurable when in a store session).
  let expiryMin = DEFAULT_EXPIRY_MIN;
  if (decoded.storeId) {
    try {
      const storeSnap = await db.doc(`stores/${decoded.storeId}`).get();
      const m = Number(storeSnap.data()?.loyaltyConfig?.redemptionExpiryMinutes);
      if (Number.isFinite(m) && m > 0) expiryMin = m;
    } catch {}
  }

  const customerRef = db.doc(`customers/${phone}`);
  const rewardRef = db.doc(`loyaltyRewards/${rewardId}`);
  const redemptionRef = db.collection("loyaltyRedemptions").doc();
  const ledgerRef = customerRef.collection("pointsLedger").doc();
  const statsRef = db.doc("loyaltyStats/global");
  const now = Date.now();
  const code = genCode();
  const expiresAtMs = now + expiryMin * 60_000;

  try {
    const result = await db.runTransaction(async (tx: any) => {
      const [cSnap, rewardSnap] = await Promise.all([tx.get(customerRef), tx.get(rewardRef)]);
      if (!cSnap.exists) throw new Error("Customer not found");
      if (!rewardSnap.exists) throw new Error("Reward not found");
      const c = cSnap.data();
      const reward = rewardSnap.data();
      if (reward.isActive === false) throw new Error("Reward is not available");

      const pointsCost = Math.floor(Number(reward.pointsCost) || 0);
      const value = Number(reward.value) || 0;
      const type = reward.type === "percent" ? "percent" : "fixed";
      if (pointsCost <= 0 || value <= 0) throw new Error("Invalid reward configuration");
      if (Number(c.pointsBalance || 0) < pointsCost) throw new Error("Insufficient points");

      tx.update(customerRef, { pointsBalance: FieldValue.increment(-pointsCost), updatedAt: FieldValue.serverTimestamp() });
      tx.set(ledgerRef, {
        type: "redeem", points: -pointsCost, amount: 0, storeId: "", storeName: "", sessionId: "",
        rewardId, rewardName: reward.name, redemptionId: redemptionRef.id,
        createdAt: FieldValue.serverTimestamp(), createdByUid: decoded.uid ?? null,
      });
      tx.set(redemptionRef, {
        id: redemptionRef.id, code, phone, rewardId, rewardName: reward.name,
        pointsCost, type, value, status: "active", source: "hub",
        createdAt: FieldValue.serverTimestamp(), createdAtClientMs: now, expiresAtMs,
        appliedStoreId: null, appliedSessionId: null, appliedReceiptId: null,
        appliedByUid: null, appliedAtMs: null, refundedAtMs: null,
      });
      tx.set(statsRef, {
        totalPointsOutstanding: FieldValue.increment(-pointsCost),
        totalPointsRedeemedEver: FieldValue.increment(pointsCost),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { rewardName: reward.name, pointsCost, type, value, customerName: c.name || "" };
    });

    try {
      await writeLoyaltyLog({
        type: "points_redeemed", phone, customerName: result.customerName, actorUid: decoded.uid ?? "customer",
        source: "customer_redeem", points: result.pointsCost,
      } as any);
    } catch {}

    return NextResponse.json({ ok: true, code, expiresAtMs, reward: { name: result.rewardName, type: result.type, value: result.value, pointsCost: result.pointsCost } });
  } catch (err: any) {
    const msg = err.message || "Redeem failed.";
    return bad(msg, msg.includes("Insufficient") || msg.includes("not found") || msg.includes("available") ? 400 : 500);
  }
}
