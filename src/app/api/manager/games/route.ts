import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireStoreAccess, MANAGER_ROLES } from "@/lib/server/admin/access";
import { readGameConfigs } from "@/lib/server/games/config";
import { GAMES } from "@/lib/games/registry";
import { managerGameState, setStoreEnabled } from "@/lib/games/gameStoreToggle";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/** Every registered game, with what it is doing at THIS branch. */
export async function GET(req: Request) {
  const storeId = String(new URL(req.url).searchParams.get("storeId") || "");

  const gate = await requireStoreAccess(req, MANAGER_ROLES, storeId);
  if (!gate.ok) return bad(gate.error, gate.status);

  const configs = await readGameConfigs(getAdminDb());

  const games = GAMES.map((g) => ({
    id: g.id,
    title: g.title,
    tagline: g.tagline,
    ...managerGameState(configs[g.id], storeId),
  }));

  return NextResponse.json({ ok: true, storeId, games });
}

/**
 * Switch a game on or off FOR ONE BRANCH.
 *
 * A separate endpoint from the admin PUT rather than that route with a widened
 * role list. POS has the landmine written down: a multi-op route gated once
 * before the dispatch hands a newly admitted role every other op on it. Here
 * the only edit this route can express is add-or-remove-my-own-storeId in
 * `disabledStoreIds` — it cannot write `isActive` or `applicableStoreIds`, so
 * there is no chain-wide lever to reach even by accident.
 */
export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const storeId = String(body?.storeId || "");
  const gameId = String(body?.gameId || "");
  const enabled = body?.enabled === true;

  const gate = await requireStoreAccess(req, MANAGER_ROLES, storeId);
  if (!gate.ok) return bad(gate.error, gate.status);

  if (!GAMES.some((g) => g.id === gameId)) return bad("Unknown game.", 400);

  const db = getAdminDb();
  const ref = db.doc(`miniGames/${gameId}`);

  // Read-modify-write inside a transaction: `disabledStoreIds` is an array, and
  // an array is replaced wholesale under merge, so two branches flipping their
  // own switch at the same moment would otherwise erase each other.
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cfg = snap.exists ? (snap.data() as any) : null;

    // A game head office never switched on, killed chain-wide, or did not offer
    // here is not this manager's to flip.
    const state = managerGameState(cfg, storeId);
    if (state.lockedReason) return { locked: state.lockedReason };

    tx.set(
      ref,
      {
        disabledStoreIds: setStoreEnabled(cfg, storeId, enabled),
        updatedAtMs: Date.now(),
        updatedByUid: gate.caller.uid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { locked: null };
  });

  if (result.locked) return bad(result.locked, 409);
  return NextResponse.json({ ok: true, gameId, storeId, runningHere: enabled });
}
