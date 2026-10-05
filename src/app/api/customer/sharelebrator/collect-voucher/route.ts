import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { resolveTokenCard } from "@/lib/server/session-link";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/**
 * Manually release the held points of an expired, unused voucher (the customer's
 * "Collect Points" action). Points were only HELD at claim — never spent — so
 * this just frees the hold (pointsReserved -= reservedPoints) and flips the
 * voucher to "expired". Mirrors expireStaleVouchers for a single doc; idempotent.
 */
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
  const voucherId = String(body.voucherId || "");
  if (!voucherId) return bad("Missing voucherId.");

  const db = getAdminDb();
  const card = await resolveTokenCard(db, decoded);
  if (!card.ok) return bad(card.message, 403);
  const phone = card.phone;

  const voucherRef = db.doc(`loyaltyRedemptions/${voucherId}`);

  try {
    const pointsReturned = await db.runTransaction(async (tx: any) => {
      const vSnap = await tx.get(voucherRef);
      if (!vSnap.exists) throw new Error("Voucher not found");
      const v = vSnap.data();
      if (v.phone !== phone) throw new Error("Voucher does not belong to this account");
      if (v.appliedReceiptId) throw new Error("Voucher has already been used");
      // Already released (auto-expired or a concurrent collect) — idempotent no-op.
      if (v.status !== "active") return 0;
      if (typeof v.expiresAtMs !== "number" || v.expiresAtMs >= Date.now()) {
        throw new Error("Voucher hasn't expired yet");
      }

      const reservedPoints = Math.floor(Number(v.reservedPoints) || 0);
      if (reservedPoints > 0) {
        tx.update(db.doc(`customers/${phone}`), {
          pointsReserved: FieldValue.increment(-reservedPoints),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      tx.update(voucherRef, { status: "expired", reservedPoints: 0, updatedAt: FieldValue.serverTimestamp() });
      return reservedPoints;
    });

    return NextResponse.json({ ok: true, pointsReturned });
  } catch (err: any) {
    const msg = err?.message || "Failed to collect points.";
    const status = /not found|belong|already|hasn't expired/i.test(msg) ? 400 : 500;
    return bad(msg, status);
  }
}
