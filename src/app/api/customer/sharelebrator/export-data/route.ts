import { NextResponse } from "next/server";
import { maskDisplayName } from "@/lib/server/mask-name";
import { authorizeSelfService } from "@/lib/server/self-service";

export const runtime = "nodejs";

const HISTORY_LIMIT = 1000;

type Millis = { toMillis?: () => number } | undefined;
const iso = (ts: Millis, ms?: unknown): string | null => {
  const v = ts?.toMillis ? ts.toMillis() : Number(ms) || null;
  return v ? new Date(v).toISOString() : null;
};

/**
 * "Download my data" (audit PRV-02a): everything we hold about the cardholder
 * that is theirs, as JSON for the app to save as a file. Fields are picked one
 * by one, so a secret (the password hash) or a staff-only note can never ride
 * along by accident. Other people in the points history appear masked, with no
 * phone number.
 */
export async function POST(req: Request) {
  const auth = await authorizeSelfService(req);
  if (!auth.ok) return auth.response;
  const { db, phone, profile: c } = auth;

  const [ledgerSnap, voucherSnap] = await Promise.all([
    db.collection(`customers/${phone}/pointsLedger`).orderBy("createdAt", "desc").limit(HISTORY_LIMIT).get(),
    db.collection("loyaltyRedemptions").where("phone", "==", phone).get(),
  ]);

  const data = {
    exportedAt: new Date().toISOString(),
    about: "Everything the SharEat app holds about your Sharelebrator card.",
    profile: {
      phone,
      name: c.name ?? "",
      email: c.email ?? null,
      address: c.address ?? "",
      birthday: c.bday ?? "",
      cardCreatedAt: iso(c.createdAt as Millis),
      privacyNoticeAgreed: c.privacyNoticeVersion ?? null,
    },
    points: { balance: Number(c.pointsBalance || 0), heldForRewards: Number(c.pointsReserved || 0) },
    history: ledgerSnap.docs.map((d) => {
      const e = d.data();
      const other = e.recipientName || e.senderName;
      return {
        when: iso(e.createdAt, e.createdAtMs),
        type: e.type ?? "",
        points: Number(e.points || 0),
        counterparty: other ? maskDisplayName(String(other)) : null,
      };
    }),
    vouchers: voucherSnap.docs.map((d) => {
      const v = d.data();
      return {
        code: v.code ?? "",
        rewardName: v.rewardName ?? "",
        pointsCost: Number(v.pointsCost || 0),
        status: v.status ?? "",
        claimedAt: iso(undefined, v.createdAtClientMs),
        expiresAt: iso(undefined, v.expiresAtMs),
      };
    }),
  };
  return NextResponse.json({ ok: true, data });
}
