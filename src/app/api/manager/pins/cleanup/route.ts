import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireStoreAccess, MANAGER_ROLES } from "@/lib/server/admin/access";

export const runtime = "nodejs";

const PINS = "pinRegistry";
const MAX_BATCH = 400;
/** Matches the chain-wide admin sweep, so both agree on what "finished" means. */
const ARCHIVE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/**
 * Clear this branch's finished PINs.
 *
 * The chain-wide version of this (`/api/admin/cleanup-archived-pins`) is
 * admin-only, because its query carries no store and purges every branch at
 * once. This one is bounded to the caller's own branch.
 *
 * Two equality filters and the age cutoff applied IN MEMORY: adding
 * `archivedAtMs <= cutoff` to the query alongside two equality filters is a
 * range on a third field, which needs a composite index this repo cannot
 * deploy.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const storeId = String(body?.storeId || "");

  const gate = await requireStoreAccess(req, MANAGER_ROLES, storeId);
  if (!gate.ok) return bad(gate.error, gate.status);

  const db = getAdminDb();
  const snap = await db
    .collection(PINS)
    .where("storeId", "==", storeId)
    .where("status", "==", "archived")
    .get();

  const cutoffMs = Date.now() - ARCHIVE_MAX_AGE_MS;
  const stale = snap.docs
    .filter((d) => Number((d.data() as any)?.archivedAtMs || 0) <= cutoffMs)
    .slice(0, MAX_BATCH);

  if (stale.length === 0) {
    return NextResponse.json({ ok: true, deletedCount: 0, remaining: snap.size });
  }

  const batch = db.batch();
  for (const d of stale) batch.delete(d.ref);
  await batch.commit();

  return NextResponse.json({ ok: true, deletedCount: stale.length, remaining: snap.size - stale.length });
}
