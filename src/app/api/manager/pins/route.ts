import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireStoreAccess, MANAGER_ROLES } from "@/lib/server/admin/access";

export const runtime = "nodejs";

const PINS = "pinRegistry";
const MAX_ROWS = 300;

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export type PinRow = {
  pin: string;
  storeId: string;
  status: string;
  tableDisplayName: string;
  customerName: string;
  expiresAtMs: number;
  archivedAtMs: number;
};

function toRow(id: string, x: any): PinRow {
  return {
    pin: id,
    storeId: String(x?.storeId || ""),
    status: String(x?.status || ""),
    tableDisplayName: String(x?.tableDisplayName || x?.tableNumber || ""),
    customerName: String(x?.customerName || ""),
    expiresAtMs: Number(x?.expiresAtMs || 0),
    archivedAtMs: Number(x?.archivedAtMs || 0),
  };
}

/**
 * This branch's PINs.
 *
 * `pinRegistry` is a ROOT collection holding every branch's PINs, so the store
 * filter is what makes this a branch view — and it is enforced here, not on the
 * client. The old admin screen listed the newest 200 across the whole chain,
 * which showed one branch another branch's live table codes.
 *
 * TWO EQUALITY FILTERS AND NO orderBy, deliberately. Multiple equality filters
 * are served by the automatic single-field indexes; adding an `orderBy` on a
 * different field is the one shape that demands a composite index, and this
 * repo cannot deploy one (no firestore.indexes.json, and no "indexes" key in
 * firebase.json). Sorting happens in memory.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const storeId = String(url.searchParams.get("storeId") || "");
  const status = url.searchParams.get("status") === "archived" ? "archived" : "active";

  const gate = await requireStoreAccess(req, MANAGER_ROLES, storeId);
  if (!gate.ok) return bad(gate.error, gate.status);

  const snap = await getAdminDb()
    .collection(PINS)
    .where("storeId", "==", storeId)
    .where("status", "==", status)
    .get();

  const now = Date.now();
  const rows = snap.docs
    .map((d) => toRow(d.id, d.data()))
    .sort((a, b) =>
      status === "archived" ? b.archivedAtMs - a.archivedAtMs : b.expiresAtMs - a.expiresAtMs
    );

  return NextResponse.json({
    ok: true,
    storeId,
    status,
    rows: rows.slice(0, MAX_ROWS),
    total: rows.length,
    // "Active" is a stored status, not a promise that the PIN still works.
    liveCount: status === "active" ? rows.filter((r) => r.expiresAtMs > now).length : 0,
  });
}

/**
 * Delete one PIN, when it is finished with.
 *
 * A live, unexpired PIN is somebody's table right now — deleting it would drop
 * them out of their session mid-meal, so it is refused. Archived and expired
 * ones are fair game.
 */
export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const storeId = String(body?.storeId || "");
  const pin = String(body?.pin || "");

  const gate = await requireStoreAccess(req, MANAGER_ROLES, storeId);
  if (!gate.ok) return bad(gate.error, gate.status);
  if (!pin) return bad("Missing pin.", 400);

  const db = getAdminDb();
  const ref = db.doc(`${PINS}/${pin}`);
  const snap = await ref.get();
  if (!snap.exists) return bad("That PIN is already gone.", 404);

  const row = toRow(snap.id, snap.data());
  // Resolved from the DOCUMENT, never the request: otherwise a manager could
  // delete another branch's PIN by naming their own store.
  if (row.storeId !== storeId) return bad("That PIN belongs to another branch.", 403);

  if (row.status === "active" && row.expiresAtMs > Date.now()) {
    return bad("That table is still seated. Wait for it to expire or be reissued.", 409);
  }

  await ref.delete();
  return NextResponse.json({ ok: true, pin });
}
