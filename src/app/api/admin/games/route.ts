import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireRole, requireAdmin, hasStoreAccess, MANAGER_ROLES } from "@/lib/server/admin/access";
import { readGameConfigs } from "@/lib/server/games/config";
import { GAMES } from "@/lib/games/registry";
import { countPending } from "@/lib/server/games/recipe-store";

export const runtime = "nodejs";

/** Every registered game with its live config — including the ones switched off. */
export async function GET(req: Request) {
  const gate = await requireRole(req, MANAGER_ROLES);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const db = getAdminDb();
  const configs = await readGameConfigs(db);

  const games = GAMES.map((g) => ({
    id: g.id,
    title: g.title,
    tagline: g.tagline,
    // A game with no config doc has never been switched on. Say so explicitly
    // rather than rendering it as "off", which reads as a deliberate choice.
    configured: !!configs[g.id],
    isActive: configs[g.id]?.isActive !== false && !!configs[g.id],
    // For the per-branch switches; written only through PUT /api/manager/games.
    disabledStoreIds: Array.isArray(configs[g.id]?.disabledStoreIds) ? configs[g.id]?.disabledStoreIds : [],
    // Capture & Share only: cashier printing, switched separately from the game. Absent = on.
    ...(g.id === "capture-share"
      ? {
          printingEnabled: (configs[g.id] as { printingEnabled?: boolean } | undefined)?.printingEnabled !== false,
          printingDisabledStoreIds: Array.isArray((configs[g.id] as { printingDisabledStoreIds?: unknown } | undefined)?.printingDisabledStoreIds)
            ? (configs[g.id] as { printingDisabledStoreIds: string[] }).printingDisabledStoreIds
            : [],
        }
      : {}),
  }));

  return NextResponse.json({ ok: true, games, pendingCount: await countPending(db) });
}

/**
 * Flip a game on or off, CHAIN-WIDE.
 *
 * Admin-only, and that is the whole point: this writes `isActive` on the single
 * shared `miniGames/{gameId}` document, so one branch acting on it takes the
 * game away from every other branch. A manager who wants it off at their own
 * store uses PUT /api/manager/games, which can only touch `disabledStoreIds`
 * for the store they are assigned to.
 */
export async function PUT(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const gameId = String((body as any)?.gameId || "");
  const isActive = (body as any)?.isActive === true;

  // Capture & Share's printing switch: only that one field, the game's on/off untouched.
  // Capture & Share printing at ONE branch: add/remove it in printingDisabledStoreIds (atomic array ops).
  const b = body as { printingStoreId?: unknown; printingOnAtStore?: unknown };
  if (gameId === "capture-share" && typeof b.printingStoreId === "string" && b.printingStoreId && typeof b.printingOnAtStore === "boolean") {
    await getAdminDb().doc(`miniGames/${gameId}`).set(
      {
        printingDisabledStoreIds: b.printingOnAtStore ? FieldValue.arrayRemove(b.printingStoreId) : FieldValue.arrayUnion(b.printingStoreId),
        updatedAtMs: Date.now(),
        updatedByUid: gate.caller.uid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return NextResponse.json({ ok: true, gameId, storeId: b.printingStoreId, printingOnAtStore: b.printingOnAtStore });
  }

  const printingEnabled = (body as { printingEnabled?: unknown }).printingEnabled;
  if (gameId === "capture-share" && typeof printingEnabled === "boolean") {
    await getAdminDb().doc(`miniGames/${gameId}`).set(
      { printingEnabled, updatedAtMs: Date.now(), updatedByUid: gate.caller.uid, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    return NextResponse.json({ ok: true, gameId, printingEnabled });
  }

  // Ghost Hunt's on/off is per branch (Admin → Games → Spot a Ghost); its
  // summary doc is recomputed from the branches, so a chain-wide flip here
  // would be silently undone on the next branch save.
  if (gameId === "ghost-hunt") {
    return NextResponse.json({ ok: false, error: "Spot a Ghost is switched on or off per branch." }, { status: 400 });
  }
  if (!GAMES.some((g) => g.id === gameId)) {
    return NextResponse.json({ ok: false, error: "Unknown game." }, { status: 400 });
  }

  await getAdminDb().doc(`miniGames/${gameId}`).set(
    { isActive, updatedAtMs: Date.now(), updatedByUid: gate.caller.uid, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  return NextResponse.json({ ok: true, gameId, isActive });
}
