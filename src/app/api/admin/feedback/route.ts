import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

type Row = {
  id: string; // dayDocId + ":" + entryId
  storeId: string;
  dayDocId: string;
  createdAtClientMs: number;
  customerName?: string;
  rating: number;
  suggestion?: string;
};

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

    // Basic staff check (active staff or platform admin) — same as /api/admin/my-stores
    const uid = decoded.uid;
    const staffSnap = await db.doc(`staff/${uid}`).get();
    const staff = staffSnap.exists ? (staffSnap.data() as any) : null;

    const isPlatformAdmin = decoded.platformAdmin === true;
    const isActiveStaff = staff && staff.status === "active";
    if (!isPlatformAdmin && !isActiveStaff) return bad("Not allowed.", 403);

    const url = new URL(req.url);
    const storeId = String(url.searchParams.get("storeId") || "");
    const rating = String(url.searchParams.get("rating") || "all");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 300), 1), 2000);

    if (!storeId) return bad("Missing storeId.", 400);

    // Staff must be assigned to the store unless platform admin
    const assigned: string[] = Array.isArray(staff?.assignedStoreIds)
      ? staff.assignedStoreIds.map((x: any) => String(x)).filter(Boolean)
      : [];

    if (!isPlatformAdmin && assigned.length > 0 && !assigned.includes(storeId)) {
      return bad("Not allowed for this store.", 403);
    }

    const rows: Row[] = [];

    // Read latest 10 day docs (by updatedAt), then flatten feedbacks array
    const snap = await db
      .collection(`stores/${storeId}/customerFeedbackDays`)
      .orderBy("updatedAt", "desc")
      .limit(10)
      .get();

    for (const doc of snap.docs) {
      const x = doc.data() as any;
      const arr = Array.isArray(x.feedbacks) ? x.feedbacks : [];
      for (const it of arr) {
        const r: Row = {
          id: `${doc.id}:${String(it?.id || "")}`,
          storeId,
          dayDocId: doc.id,
          createdAtClientMs: Number(it?.createdAtClientMs || 0),
          customerName: it?.customerName ? String(it.customerName) : undefined,
          rating: Number(it?.rating || 0),
          suggestion: it?.suggestion ? String(it.suggestion) : undefined,
        };

        if (rating !== "all" && r.rating !== Number(rating)) continue;
        rows.push(r);
        if (rows.length >= limit) break;
      }
      if (rows.length >= limit) break;
    }

    rows.sort((a, b) => (b.createdAtClientMs || 0) - (a.createdAtClientMs || 0));

    return NextResponse.json({ ok: true, rows: rows.slice(0, limit) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
