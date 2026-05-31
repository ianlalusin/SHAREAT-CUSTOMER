import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/**
 * Lazily expire any of this member's pending vouchers that have passed their
 * expiry. Points are only HELD at claim (not spent), so expiry just RELEASES
 * the hold — no refund, no ledger, no stats change. Idempotent per voucher.
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
        const reservedPoints = Math.floor(Number(v.reservedPoints) || 0);
        if (reservedPoints > 0) {
          tx.update(db.doc(`customers/${v.phone}`), {
            pointsReserved: FieldValue.increment(-reservedPoints),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        tx.update(d.ref, { status: "expired", reservedPoints: 0, updatedAt: FieldValue.serverTimestamp() });
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
    const rewardsSnap = await db.collection("loyaltyRewards").get();
    let vouchersSnap = await db.collection("loyaltyRedemptions").where("phone", "==", phone).get();

    // Expire any stale pending vouchers (releases the hold), then re-read so the
    // list + reserved/available are fresh.
    const hadStale = vouchersSnap.docs.some((d: any) => {
      const v = d.data();
      return v.status === "active" && typeof v.expiresAtMs === "number" && v.expiresAtMs < Date.now() && !v.appliedSessionId;
    });
    if (hadStale) {
      await expireStaleVouchers(db, vouchersSnap.docs);
      vouchersSnap = await db.collection("loyaltyRedemptions").where("phone", "==", phone).get();
    }

    const customerSnap = await db.doc(`customers/${phone}`).get();
    const cData = customerSnap.exists ? (customerSnap.data() as any) : {};
    const pointsBalance = Number(cData.pointsBalance ?? 0);
    const pointsReserved = Number(cData.pointsReserved ?? 0);
    const available = Math.max(0, pointsBalance - pointsReserved);

    const rewards = rewardsSnap.docs
      .map((d: any) => ({ id: d.id, ...d.data() }))
      .filter((r: any) => r.isActive !== false)
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((r: any) => ({
        id: r.id, name: r.name, description: r.description ?? null,
        pointsCost: r.pointsCost, type: r.type, value: r.value, imageUrl: r.imageUrl ?? null,
      }));

    const now = Date.now();
    // Derive display state from existing fields: a paid voucher (appliedReceiptId
    // set) is "used"; an unpaid active/applied one is "pending". Show only those
    // two — expired/cancelled drop off the list.
    const stateOrder: Record<string, number> = { pending: 0, used: 1 };
    const vouchers = vouchersSnap.docs
      .map((d: any) => {
        const v = d.data();
        const state = v.appliedReceiptId
          ? "used"
          : v.status === "active" || v.status === "applied"
            ? "pending"
            : v.status; // expired | cancelled
        return {
          id: d.id, code: v.code, rewardName: v.rewardName, type: v.type, value: v.value,
          pointsCost: v.pointsCost, expiresAtMs: v.expiresAtMs ?? null, createdAtClientMs: v.createdAtClientMs ?? null,
          state,
          appliedReceiptId: v.appliedReceiptId ?? null,
          appliedAtMs: v.appliedAtMs ?? null,
          expired: typeof v.expiresAtMs === "number" && v.expiresAtMs < now,
        };
      })
      .filter((x: any) => x.state === "pending" || x.state === "used")
      .sort((a: any, b: any) =>
        (stateOrder[a.state] - stateOrder[b.state]) ||
        ((b.createdAtClientMs ?? 0) - (a.createdAtClientMs ?? 0)),
      );

    return NextResponse.json({ ok: true, linked: true, pointsBalance, pointsReserved, available, rewards, vouchers });
  } catch (e: any) {
    return bad(e?.message || "Failed to load rewards", 500);
  }
}
