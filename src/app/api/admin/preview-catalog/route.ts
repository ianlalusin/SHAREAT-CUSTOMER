import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { projectCatalog } from "@/lib/catalog/project";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/**
 * Read-only catalog fetch for the admin/manager "Preview" page — same source
 * data as /api/customer/catalog-items (stores/{storeId}/catalogCache/main),
 * but authorized as staff/admin instead of a real customer session, since an
 * admin browsing the preview has no customer auth claims to satisfy that
 * route's session check.
 */
export async function GET(req: Request) {
  try {
    const authz = req.headers.get("authorization") || "";
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return bad("Missing Authorization Bearer token.", 401);

    const idToken = m[1];
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);

    if ((decoded as any).customer === true) return bad("Not allowed.", 403);

    const db = getAdminDb();
    const uid = decoded.uid;
    const staffSnap = await db.doc(`staff/${uid}`).get();
    const staff = staffSnap.exists ? (staffSnap.data() as any) : null;

    const isPlatformAdmin = decoded.platformAdmin === true;
    const isActiveStaff = staff && staff.status === "active";
    if (!isPlatformAdmin && !isActiveStaff) return bad("Not allowed.", 403);

    const { searchParams } = new URL(req.url);
    const storeId = String(searchParams.get("storeId") || "");
    if (!storeId) return bad("storeId required.", 400);

    const assigned: string[] = Array.isArray(staff?.assignedStoreIds)
      ? staff.assignedStoreIds.map((x: any) => String(x)).filter(Boolean)
      : [];
    if (!isPlatformAdmin && !assigned.includes(storeId)) return bad("No access to this store.", 403);

    const cacheSnap = await db.doc(`stores/${storeId}/catalogCache/main`).get();
    // An unconfigured store previews as an empty menu rather than an error —
    // the real customer route 404s here instead, deliberately.
    if (!cacheSnap.exists) return NextResponse.json({ ok: true, categories: [] });

    // Same projection the customer route uses, so preview cannot drift from
    // what a diner actually sees.
    const categories = projectCatalog(cacheSnap.data());

    return NextResponse.json({ ok: true, categories });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
