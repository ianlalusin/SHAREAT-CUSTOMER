import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  try {
    const authz = req.headers.get("authorization") || "";
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return bad("Missing Authorization Bearer token.", 401);

    const decoded = await getAdminAuth().verifyIdToken(m[1]);
    if ((decoded as any).customer === true) return bad("Not allowed.", 403);

    const db = getAdminDb();

    const uid = decoded.uid;
    const staffSnap = await db.doc(`staff/${uid}`).get();
    const staff = staffSnap.exists ? (staffSnap.data() as any) : null;
    const isPlatformAdmin = (decoded as any).platformAdmin === true;
    const isActiveStaff = staff && staff.status === "active";
    if (!isPlatformAdmin && !isActiveStaff) return bad("Not allowed.", 403);

    const body = await req.json().catch(() => ({}));
    const catalogItemId = String(body?.catalogItemId || "");
    const posProductId = body?.posProductId ? String(body.posProductId) : null;
    const posProductName = body?.posProductName ? String(body.posProductName) : null;
    if (!catalogItemId) return bad("catalogItemId is required.", 400);

    const ref = db.doc(`catalogItems/${catalogItemId}`);
    const snap = await ref.get();
    if (!snap.exists) return bad("Catalog item not found.", 404);

    await ref.update({
      linkedPosProductId: posProductId,
      linkedPosProductName: posProductName,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      catalogItemId,
      linkedPosProductId: posProductId,
      linkedPosProductName: posProductName,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
