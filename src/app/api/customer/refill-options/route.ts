import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { validateActiveParticipant } from "@/lib/server/customer-participants";
import { getRefillOptionsMenu } from "@/lib/server/refill-options-cache";
import { REFILL_COOLDOWN_MS, toNextAllowedMap } from "@/lib/refill-cooldown";
import { outstandingRefillIds } from "@/lib/server/refill-outstanding";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  try {
    const authz = req.headers.get("authorization") || "";
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return bad("Missing Authorization Bearer token.", 401);

    const decoded = await getAdminAuth().verifyIdToken(m[1]);
    if (decoded.customer !== true) return bad("Not a customer token.", 403);

    const storeId = String((decoded as any).storeId || "");
    const sessionId = String((decoded as any).sessionId || "");
    const participantId = String((decoded as any).participantId || "");
    if (!storeId || !sessionId) return bad("Missing storeId/sessionId in token.", 403);
    if (!participantId) return bad("Missing participantId in token. Please re-enter your PIN.", 403);

    const db = getAdminDb();

    const sessSnap = await db.doc(`stores/${storeId}/activeSessions/${sessionId}`).get();
    if (!sessSnap.exists) return bad("Session not found.", 404);

    const sess = sessSnap.data() as any;
    if (sess.customerAccessEnabled !== true) return bad("Customer access disabled.", 403);
    if (Number(sess.customerAccessExpiresAtMs || 0) <= Date.now()) return bad("Customer access expired.", 403);

    let participantInfo;
    try {
      participantInfo = await validateActiveParticipant(db, storeId, sessionId, participantId);
    } catch (e: any) {
      return bad(e.message, e.httpStatus || 403);
    }

    const packageOfferingId = String(sess.packageOfferingId || "");
    const initialFlavorIds = Array.isArray(sess.initialFlavorIds) ? sess.initialFlavorIds : [];

    // Menu/catalog data (storeRefills, refills, storeFlavors) only changes when
    // an admin edits it — read from the per-store cache doc instead of scanning
    // three collections on every customer tap. See refill-options-cache.ts.
    const { storeRefills, refills, storeFlavors } = await getRefillOptionsMenu(db, storeId);

    let currentPackage: any = null;
    if (packageOfferingId) {
      const pkgSnap = await db.doc(`stores/${storeId}/storePackages/${packageOfferingId}`).get();
      if (pkgSnap.exists) currentPackage = pkgSnap.data();
    }

    return NextResponse.json({
      ok: true,
      session: { storeId, sessionId, packageOfferingId, initialFlavorIds },
      storeRefills,
      refills,
      storeFlavors,
      currentPackage,
      // Per-meat countdowns for this phone, off the participant read above —
      // no extra Firestore reads.
      refillCooldowns: {
        // Refills whose ticket is still with the kitchen. Distinct from a
        // countdown: there is no known arrival time, so the UI must not show a
        // timer for these.
        awaitingRefillIds: [...(await outstandingRefillIds(db, storeId, sessionId, participantId))],
        cooldownMs: REFILL_COOLDOWN_MS,
        nextAllowedAt: toNextAllowedMap(participantInfo.refillCooldowns, Date.now()),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
