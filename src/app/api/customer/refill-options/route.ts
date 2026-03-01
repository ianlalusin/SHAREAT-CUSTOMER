import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  try {
    const authz = req.headers.get("authorization") || "";
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return bad("Missing Authorization Bearer token.", 401);

    const idToken = m[1];
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);

    if ((decoded as any).customer !== true) return bad("Not a customer token.", 403);

    const storeId = String((decoded as any).storeId || "");
    const sessionId = String((decoded as any).sessionId || "");
    if (!storeId || !sessionId) return bad("Missing storeId/sessionId in token.", 403);

    const db = getAdminDb();

    // load active session for packageOfferingId + initial flavors
    const sessSnap = await db.doc(`stores/${storeId}/activeSessions/${sessionId}`).get();
    if (!sessSnap.exists) return bad("Session not found.", 404);

    const sess = sessSnap.data() as any;
    if (sess.customerAccessEnabled !== true) return bad("Customer access disabled.", 403);
    if (Number(sess.customerAccessExpiresAtMs || 0) <= Date.now()) return bad("Customer access expired.", 403);

    const packageOfferingId = String(sess.packageOfferingId || "");
    const initialFlavorIds = Array.isArray(sess.initialFlavorIds) ? sess.initialFlavorIds : [];

    // storeRefills
    const storeRefillsSnap = await db
      .collection(`stores/${storeId}/storeRefills`)
      .where("isEnabled", "==", true)
      .orderBy("sortOrder", "asc")
      .get();

    const storeRefills = storeRefillsSnap.docs.map((d) => {
      const x = d.data() as any;
      return {
        id: d.id,
        refillId: d.id,
        refillName: String(x.refillName || x.name || ""),
        kitchenLocationId: x.kitchenLocationId ?? null,
        kitchenLocationName: x.kitchenLocationName ?? null,
        isEnabled: x.isEnabled !== false,
        sortOrder: Number(x.sortOrder || 0),
      };
    });

    // global refills
    const refillsSnap = await db.collection("refills").where("isActive", "==", true).get();
    const refills = refillsSnap.docs.map((d) => {
      const x = d.data() as any;
      return {
        id: d.id,
        isActive: x.isActive !== false,
        requiresFlavor: !!x.requiresFlavor,
        allowedFlavorIds: Array.isArray(x.allowedFlavorIds) ? x.allowedFlavorIds : [],
      };
    });

    // store flavors
    const flavorsSnap = await db
      .collection(`stores/${storeId}/storeFlavors`)
      .where("isEnabled", "==", true)
      .get();

    const storeFlavors = flavorsSnap.docs.map((d) => {
      const x = d.data() as any;
      return {
        id: d.id,
        flavorId: d.id,
        flavorName: String(x.flavorName || x.name || ""),
        isEnabled: x.isEnabled !== false,
      };
    });

    // package (optional)
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
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
