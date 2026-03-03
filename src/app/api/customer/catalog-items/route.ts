import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

type CatalogItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  imageUrl: string | null;
  isAvailable?: boolean;
};

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

    // store-scoped catalog cache (single doc)
    const cacheSnap = await db.doc(`stores/${storeId}/catalogCache/main`).get();
    if (!cacheSnap.exists) return bad("Catalog cache not found for store.", 404);

    const cache = cacheSnap.data() as any;
    const rawItems = Array.isArray(cache.items) ? (cache.items as any[]) : [];

    const items: CatalogItem[] = rawItems
      .map((x) => ({
        id: String(x.id ?? ""),
        name: String(x.name ?? ""),
        category: String(x.category ?? ""),
        price: Number(x.price ?? 0),
        imageUrl: x.imageUrl ?? null,
        isAvailable: x.isAvailable,
      }))
      .filter((x) => !!x.id && (!!x.isAvailable || x.isAvailable === undefined));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
