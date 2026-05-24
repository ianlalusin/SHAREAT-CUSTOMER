import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/**
 * Lazily refund any of this member's active vouchers that have passed their
 * expiry. Unapplied Hub vouchers were debited at creation, so expiry credits
 * the points back and marks the voucher expired. Idempotent per voucher.
 */
async function expireStaleVouchers(db: any, docs: any[]): Promise<void> {
  const now = Date.now();
  const stale = docs.filter((d) => {
    const v = d.data();
    return v.status === "active" && typeof v.expiresAtMs === "number" && v.expiresAtMs < now && !v.appliedSessionId;
  });
  for (const d of stale) {
    try {
      await db.runTransaction(async (tx: any) => {
        const vSnap = await tx.get(d.ref);
        if (!vSnap.exists) return;
        const v = vSnap.data();
        if (v.status !== "active") return; // already handled by a concurrent read
        const pointsCost = Math.floor(Number(v.pointsCost) || 0);
        const customerRef = db.doc(`customers/${v.phone}`);
        const ledgerRef = customerRef.collection("pointsLedger").doc();
        tx.update(customerRef, { pointsBalance: FieldValue.increment(pointsCost), updatedAt: FieldValue.serverTimestamp() });
        tx.set(ledgerRef, {
          type: "redeem_refund", points: pointsCost, amount: 0, storeId: "", storeName: "", sessionId: "",
          redemptionId: v.id, rewardId: v.rewardId, rewardName: v.rewardName, reason: "expired",
          createdAt: FieldValue.serverTimestamp(), createdByUid: "system",
        });
        tx.update(d.ref, { status: "expired", refundedAtMs: now, updatedAt: FieldValue.serverTimestamp() });
        tx.set(db.doc("loyaltyStats/global"), { totalPointsOutstanding: FieldValue.increment(pointsCost), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
    } catch (e) {
      console.warn("[expireStaleVouchers] failed for", d.id, e);
    }
  }
}

// Resolve the loyalty member's phone from either auth mode (session-linked
// customer or a loyalty-card login). Mirrors /me and transfer-points.
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
  const phone = await resolvePhone(db, decoded);
  if (!phone) return NextResponse.json({ ok: true, linked: false, rewards: [], vouchers: [], pointsBalance: 0 });

  try {
    let [rewardsSnap, vouchersSnap] = await Promise.all([
      db.collection("loyaltyRewards").get(),
      db.collection("loyaltyRedemptions").where("phone", "==", phone).where("status", "==", "active").get(),
    ]);

    // Refund + expire any stale vouchers, then re-read so balance/list are fresh.
    const hadStale = vouchersSnap.docs.some((d: any) => {
      const v = d.data();
      return typeof v.expiresAtMs === "number" && v.expiresAtMs < Date.now() && !v.appliedSessionId;
    });
    if (hadStale) {
      await expireStaleVouchers(db, vouchersSnap.docs);
      vouchersSnap = await db.collection("loyaltyRedemptions").where("phone", "==", phone).where("status", "==", "active").get();
    }

    const customerSnap = await db.doc(`customers/${phone}`).get();

    const rewards = rewardsSnap.docs
      .map((d: any) => ({ id: d.id, ...d.data() }))
      .filter((r: any) => r.isActive !== false)
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((r: any) => ({
        id: r.id, name: r.name, description: r.description ?? null,
        pointsCost: r.pointsCost, type: r.type, value: r.value, imageUrl: r.imageUrl ?? null,
      }));

    const now = Date.now();
    const vouchers = vouchersSnap.docs
      .map((d: any) => {
        const v = d.data();
        return {
          id: d.id, code: v.code, rewardName: v.rewardName, type: v.type, value: v.value,
          pointsCost: v.pointsCost, expiresAtMs: v.expiresAtMs ?? null, createdAtClientMs: v.createdAtClientMs ?? null,
          expired: typeof v.expiresAtMs === "number" && v.expiresAtMs < now,
        };
      })
      .sort((a: any, b: any) => (b.createdAtClientMs ?? 0) - (a.createdAtClientMs ?? 0));

    const pointsBalance = customerSnap.exists ? Number(customerSnap.data()?.pointsBalance ?? 0) : 0;
    return NextResponse.json({ ok: true, linked: true, pointsBalance, rewards, vouchers });
  } catch (e: any) {
    return bad(e?.message || "Failed to load rewards", 500);
  }
}
