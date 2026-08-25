import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireStoreAccess, MANAGER_ROLES } from "@/lib/server/admin/access";

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
    const url = new URL(req.url);
    const storeId = String(url.searchParams.get("storeId") || "");
    const rating = String(url.searchParams.get("rating") || "all");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 300), 1), 2000);

    // The membership check used to be skipped entirely when the caller had no
    // assignments, which let an unassigned staffer read ANY branch by passing
    // its id. The shared gate carries no such exemption.
    const gate = await requireStoreAccess(req, MANAGER_ROLES, storeId);
    if (!gate.ok) return bad(gate.error, gate.status);

    const db = getAdminDb();

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
