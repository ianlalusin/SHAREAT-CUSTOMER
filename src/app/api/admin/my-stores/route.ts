import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolveStaff } from "@/lib/server/admin/access";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  try {
    const gate = await resolveStaff(req);
    if (!gate.ok) return bad(gate.error, gate.status);

    const db = getAdminDb();

    // The one place a caller learns which branches belong to them. Every scoped
    // route re-checks the storeId it is handed, so this list feeds the picker
    // and is never itself the gate.
    let storeIds = gate.caller.assignedStoreIds;
    if (gate.caller.isPlatformAdmin && storeIds.length === 0) {
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

    // Also the caller-context endpoint: the shell needs to know WHO is asking to
    // decide which tree to show them, and doing it here saves a second round
    // trip on every admin page load. Authorization still happens per route.
    return NextResponse.json({
      ok: true,
      stores: results,
      role: gate.caller.role,
      isPlatformAdmin: gate.caller.isPlatformAdmin,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
