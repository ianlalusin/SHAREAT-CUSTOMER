import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
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

/**
 * Delete the Firebase Auth users behind a PIN's participants.
 *
 * Every PIN sign-in mints a custom token for `cust_part_<deviceHash>`, and
 * `signInWithCustomToken` creates an Auth user for it that nothing removes —
 * the pool passed 7,000 before this was noticed. Retiring a PIN on the POS
 * side now deletes them; this covers the other exit, a manager deleting the
 * PIN row here. Best-effort: a failure must never block the row delete, and
 * only `cust_` uids are ever touched so a mis-set field cannot reach a staff
 * or loyalty account. A 48h idle sweep in POS catches anything missed.
 */
async function deleteParticipantAuthUsers(
  db: Firestore,
  storeId: string,
  sessionId: string,
  pin: string
): Promise<number> {
  if (!sessionId) return 0;
  const snap = await db
    .collection(`stores/${storeId}/activeSessions/${sessionId}/customerParticipants`)
    .where("pinSnapshot", "==", pin)
    .get();
  const uids = Array.from(
    new Set(
      snap.docs
        .map((d) => String(d.data()?.claimedByUid || ""))
        .filter((uid) => uid.startsWith("cust_"))
    )
  );
  if (uids.length === 0) return 0;
  const auth = getAdminAuth();
  const results = await Promise.allSettled(uids.map((uid) => auth.deleteUser(uid)));
  let deleted = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled" || (r.reason as any)?.code === "auth/user-not-found") deleted++;
    else console.warn("[manager/pins] auth user delete failed", uids[i], (r.reason as any)?.message);
  });
  return deleted;
}

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

  const sessionId = String((snap.data() as any)?.sessionId || "");
  await ref.delete();
  const authDeleted = await deleteParticipantAuthUsers(db, storeId, sessionId, pin).catch((e) => {
    console.warn("[manager/pins] participant auth cleanup failed", pin, e?.message);
    return 0;
  });
  return NextResponse.json({ ok: true, pin, authDeleted });
}
