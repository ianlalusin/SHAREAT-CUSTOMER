import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireStoreAccess, MANAGER_ROLES } from "@/lib/server/admin/access";
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
    const { searchParams } = new URL(req.url);
    const storeId = String(searchParams.get("storeId") || "");
    if (!storeId) return bad("storeId required.", 400);

    const gate = await requireStoreAccess(req, MANAGER_ROLES, storeId);
    if (!gate.ok) return bad(gate.error, gate.status);

    const db = getAdminDb();

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
