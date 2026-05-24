import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
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
    const [rewardsSnap, customerSnap, vouchersSnap] = await Promise.all([
      db.collection("loyaltyRewards").get(),
      db.doc(`customers/${phone}`).get(),
      db.collection("loyaltyRedemptions").where("phone", "==", phone).where("status", "==", "active").get(),
    ]);

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
