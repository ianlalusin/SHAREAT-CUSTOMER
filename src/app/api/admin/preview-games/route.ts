import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { readGameConfigs, selectEnabledGames } from "@/lib/server/games/config";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/**
 * Read-only games-shelf fetch for the admin/manager "Preview" page.
 *
 * /api/customer/games scopes the shelf with `callerStoreId(caller)`, which is
 * only non-null for a live table session — so an admin hitting it would get the
 * unscoped shelf ("live somewhere") rather than the shelf for the store they
 * picked, and the preview would show games that branch has not switched on.
 * This route takes the previewed storeId explicitly and runs it through the
 * same `selectEnabledGames` selector, so the preview cannot drift from what a
 * diner at that table actually sees.
 *
 * Auth mirrors /api/admin/preview-catalog: staff or platform admin, and a
 * non-admin may only preview a store they are assigned to.
 */
export async function GET(req: Request) {
  try {
    const authz = req.headers.get("authorization") || "";
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return bad("Missing Authorization Bearer token.", 401);

    const decoded = await getAdminAuth().verifyIdToken(m[1]);
    if ((decoded as any).customer === true) return bad("Not allowed.", 403);

    const db = getAdminDb();
    const staffSnap = await db.doc(`staff/${decoded.uid}`).get();
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

    const configs = await readGameConfigs(db);
    const games = selectEnabledGames(configs, storeId);

    return NextResponse.json({ ok: true, games });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
