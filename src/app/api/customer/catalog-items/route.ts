import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { projectCatalog } from "@/lib/catalog/project";

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

    // must be a customer token
    if ((decoded as any).customer !== true) return bad("Not a customer token.", 403);

    const storeId = String((decoded as any).storeId || "");
    const sessionId = String((decoded as any).sessionId || "");
    if (!storeId || !sessionId) return bad("Missing storeId/sessionId in token.", 403);

    const db = getAdminDb();

    // enforce access window via active session projection
    const snap = await db.doc(`stores/${storeId}/activeSessions/${sessionId}`).get();
    if (!snap.exists) return bad("Session not found.", 404);

    const s = snap.data() as any;
    if (s.customerAccessEnabled !== true) return bad("Customer access disabled.", 403);
    if (Number(s.customerAccessExpiresAtMs || 0) <= Date.now()) return bad("Customer access expired.", 403);

    // store-scoped catalog cache (single doc), written by POS's
    // rebuildCustomerCatalog. The customer path here reads ONLY the cache doc —
    // one Firestore read per dashboard load regardless of inventory size. Price
    // changes require a cache rebuild, which already fires on every manager
    // inventory edit (POS: lib/customer-catalog/auto-publish.ts).
    const cacheSnap = await db.doc(`stores/${storeId}/catalogCache/main`).get();
    if (!cacheSnap.exists) return bad("Catalog cache not found for store.", 404);

    // `projectCatalog` whitelists every field on the way out — the snapshot
    // also carries internal kitchen routing that the browser must not receive.
    const cache = cacheSnap.data() as any;
    const categories = projectCatalog(cache);
    // The store-level self-ordering switch. The client needs BOTH this and an
    // item's own `orderable` before it offers an Add button.
    const orderingEnabled = cache?.orderingEnabled === true;

    return NextResponse.json({ ok: true, categories, orderingEnabled });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
