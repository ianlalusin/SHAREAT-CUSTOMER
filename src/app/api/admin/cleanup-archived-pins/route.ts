import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

const MAX_BATCH = 500;
const ARCHIVE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
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

    const cutoffMs = Date.now() - ARCHIVE_MAX_AGE_MS;

    const qSnap = await db
      .collection("pinRegistry")
      .where("status", "==", "archived")
      .where("archivedAtMs", "<=", cutoffMs)
      .limit(MAX_BATCH)
      .get();

    if (qSnap.empty) {
      return NextResponse.json({ ok: true, deletedCount: 0, cutoffMs });
    }

    const batch = db.batch();
    for (const doc of qSnap.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();

    return NextResponse.json({
      ok: true,
      deletedCount: qSnap.size,
      cutoffMs,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
