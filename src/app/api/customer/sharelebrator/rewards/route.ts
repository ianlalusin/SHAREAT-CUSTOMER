import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { isRewardOfferedAtStore } from "@/lib/loyaltyRewardScope";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

// Grace window after expiry during which an expired voucher stays visible with a
// "Collect Points" button (manual reclaim). Auto-release only kicks in beyond
// this window as a safety net so held points are never permanently stuck.
const RELEASE_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Lazily expire any of this member's pending vouchers that have passed their
 * expiry PLUS the grace window. Points are only HELD at claim (not spent), so
 * expiry just RELEASES the hold — no refund, no ledger, no stats change.
 * Idempotent per voucher. Within the grace window the voucher is left active so
 * the customer can collect the points explicitly (see collect-voucher route).
 */
async function expireStaleVouchers(db: any, docs: any[]): Promise<void> {
  const now = Date.now();
  const stale = docs.filter((d) => {
    const v = d.data();
    return v.status === "active" && typeof v.expiresAtMs === "number" && v.expiresAtMs + RELEASE_GRACE_MS < now && !v.appliedSessionId;
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
      return v.status === "active" && typeof v.expiresAtMs === "number" && v.expiresAtMs + RELEASE_GRACE_MS < Date.now() && !v.appliedSessionId;
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

    /**
     * The branch this member is sitting in, from their own token — never from
     * the request body, which the client controls.
     *
     * A loyalty-card login carries no store: they are browsing their card, not
     * at a table, so there is no branch whose catalogue to apply and the
     * globally active list is the honest answer. Claiming still requires a
     * store (see the redeem route), which is where the manager's switch bites.
     */
    const storeId = decoded.customer === true ? String(decoded.storeId || "") : "";

    const rewards = rewardsSnap.docs
      .map((d: any) => ({ id: d.id, ...d.data() }))
      // Global switch, then the branch's own. A manager who switches a reward
      // off in Collections -> Loyalty means diners at that branch should not be
      // offered it at all.
      .filter((r: any) => (storeId ? isRewardOfferedAtStore(r, storeId) : r.isActive !== false))
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((r: any) => ({
        id: r.id, name: r.name, description: r.description ?? null,
        pointsCost: r.pointsCost, type: r.type, value: r.value, imageUrl: r.imageUrl ?? null,
      }));

    const now = Date.now();
    // Derive display state from existing fields: a paid voucher (appliedReceiptId
    // set) is "used"; an active voucher past expiry that still holds points is
    // "expired" (collectible — shows a Collect Points button); an unpaid, not-yet
    // -expired active/applied one is "pending". Released (expired/cancelled with no
    // hold) and beyond-grace vouchers drop off the list.
    // Note: "collectible" is a distinct display token (not the DB status string)
    // so a released voucher (DB status "expired", no hold) is NOT mistaken for a
    // collectible one and stays filtered out.
    const stateOrder: Record<string, number> = { pending: 0, collectible: 1, used: 2 };
    const vouchers = vouchersSnap.docs
      .map((d: any) => {
        const v = d.data();
        const collectibleExpired =
          v.status === "active" &&
          !v.appliedReceiptId &&
          typeof v.expiresAtMs === "number" &&
          v.expiresAtMs < now &&
          Number(v.reservedPoints || 0) > 0;
        const state = v.appliedReceiptId
          ? "used"
          : collectibleExpired
            ? "collectible"
            : v.status === "active" || v.status === "applied"
              ? "pending"
              : v.status; // released expired | cancelled → filtered out below
        return {
          id: d.id, code: v.code, rewardName: v.rewardName, type: v.type, value: v.value,
          pointsCost: v.pointsCost, expiresAtMs: v.expiresAtMs ?? null, createdAtClientMs: v.createdAtClientMs ?? null,
          state,
          appliedReceiptId: v.appliedReceiptId ?? null,
          appliedAtMs: v.appliedAtMs ?? null,
          expired: typeof v.expiresAtMs === "number" && v.expiresAtMs < now,
        };
      })
      .filter((x: any) => x.state === "pending" || x.state === "collectible" || x.state === "used")
      .sort((a: any, b: any) =>
        (stateOrder[a.state] - stateOrder[b.state]) ||
        ((b.createdAtClientMs ?? 0) - (a.createdAtClientMs ?? 0)),
      );

    return NextResponse.json({
      ok: true, linked: true, pointsBalance, pointsReserved, available, rewards, vouchers,
      // False when the list is the global catalogue rather than one branch's,
      // so the UI can say the rewards shown are not yet claimable here.
      storeScoped: !!storeId,
    });
  } catch (e: any) {
    return bad(e?.message || "Failed to load rewards", 500);
  }
}
