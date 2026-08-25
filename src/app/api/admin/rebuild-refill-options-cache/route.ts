import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireStoreAccess, MANAGER_ROLES } from "@/lib/server/admin/access";
import { rebuildRefillOptionsCache } from "@/lib/server/refill-options-cache";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const storeId = String(url.searchParams.get("storeId") || "");
    if (!storeId) return bad("Missing storeId.", 400);

    // This route took a storeId and never checked it against the caller at all,
    // so any active staff member could rebuild any branch cache.
    const gate = await requireStoreAccess(req, MANAGER_ROLES, storeId);
    if (!gate.ok) return bad(gate.error, gate.status);

    const db = getAdminDb();

    const { updatedAtMs, storeRefills, refills, storeFlavors } = await rebuildRefillOptionsCache(db, storeId);

    return NextResponse.json({
      ok: true,
      storeId,
      storeRefillCount: storeRefills.length,
      refillCount: refills.length,
      storeFlavorCount: storeFlavors.length,
      updatedAtMs,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
