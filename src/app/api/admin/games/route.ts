import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireStaff } from "@/lib/server/games/admin-auth";
import { readGameConfigs } from "@/lib/server/games/config";
import { GAMES } from "@/lib/games/registry";
import { countPending } from "@/lib/server/games/recipe-store";

export const runtime = "nodejs";

/** Every registered game with its live config — including the ones switched off. */
export async function GET(req: Request) {
  const gate = await requireStaff(req);
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
  }));

  return NextResponse.json({ ok: true, games, pendingCount: await countPending(db) });
}

/** Flip a game on or off, chain-wide. */
export async function PUT(req: Request) {
  const gate = await requireStaff(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const gameId = String((body as any)?.gameId || "");
  const isActive = (body as any)?.isActive === true;

  if (!GAMES.some((g) => g.id === gameId)) {
    return NextResponse.json({ ok: false, error: "Unknown game." }, { status: 400 });
  }

  await getAdminDb().doc(`miniGames/${gameId}`).set(
    { isActive, updatedAtMs: Date.now(), updatedByUid: gate.caller.uid, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  return NextResponse.json({ ok: true, gameId, isActive });
}
