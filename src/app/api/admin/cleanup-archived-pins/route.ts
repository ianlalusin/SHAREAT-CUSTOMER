import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/admin/access";

export const runtime = "nodejs";

const MAX_BATCH = 500;
const ARCHIVE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  try {
    // Chain-wide by construction: the query carries no storeId, so this purges
    // every branch at once. Admin-only. A manager cleans up their own branch
    // through POST /api/manager/pins/cleanup.
    const gate = await requireAdmin(req);
    if (!gate.ok) return bad(gate.error, gate.status);

    const db = getAdminDb();

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
