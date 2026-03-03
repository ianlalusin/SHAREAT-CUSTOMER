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

    // Disallow customer tokens
    if ((decoded as any).customer === true) return bad("Not allowed.", 403);

    const db = getAdminDb();

    // Basic staff check (active staff or platform admin)
    const uid = decoded.uid;
    const staffSnap = await db.doc(`staff/${uid}`).get();
    const staff = staffSnap.exists ? (staffSnap.data() as any) : null;

    const isPlatformAdmin = decoded.platformAdmin === true;
    const isActiveStaff = staff && staff.status === "active";
    if (!isPlatformAdmin && !isActiveStaff) return bad("Not allowed.", 403);

    // Load assignedStoreIds from staff/{uid} (matches firestore.rules)
    const assigned: string[] = Array.isArray(staff?.assignedStoreIds)
      ? staff.assignedStoreIds.map((x: any) => String(x)).filter(Boolean)
      : [];

    // Platform admins can optionally see all stores if assignedStoreIds is empty
    let storeIds = assigned;
    if (isPlatformAdmin && storeIds.length === 0) {
      // best-effort: list first 200 stores
      const allSnap = await db.collection("stores").limit(200).get();
      storeIds = allSnap.docs.map((d) => d.id);
    }

    const results = await Promise.all(
      storeIds.map(async (storeId) => {
        try {
          const sSnap = await db.doc(`stores/${storeId}`).get();
          const s = sSnap.exists ? (sSnap.data() as any) : null;
          const name = String(s?.name || s?.storeName || "");
          return { storeId, name: name || storeId };
        } catch {
          return { storeId, name: storeId };
        }
      })
    );

    results.sort((a, b) => (a.name || a.storeId).localeCompare(b.name || b.storeId));

    return NextResponse.json({ ok: true, stores: results });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
