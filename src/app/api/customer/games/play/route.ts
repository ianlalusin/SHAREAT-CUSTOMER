import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolveGameCaller, callerStoreId } from "@/lib/server/games/auth";
import { readGameConfigs, selectEnabledGames } from "@/lib/server/games/config";
import { recordPlay } from "@/lib/server/games/stats-store";

export const runtime = "nodejs";

/**
 * "Someone played this."
 *
 * Deliberately open to anonymous callers — Flip It needs no session, so
 * requiring one would undercount exactly the players it is meant to measure.
 *
 * Only a game that is actually enabled for this caller can be counted, so a
 * crafted request cannot invent traffic for a game nobody is running. It can
 * still inflate a game that IS running: this is a client-reported metric, good
 * for trend and comparison between games, not an audited figure.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const gameId = String((body as any)?.gameId || "");
    if (!gameId) return NextResponse.json({ ok: false, error: "Missing gameId." }, { status: 400 });

    const caller = await resolveGameCaller(req);
    const storeId = callerStoreId(caller);

    const db = getAdminDb();
    const configs = await readGameConfigs(db);
    const enabled = selectEnabledGames(configs, storeId).some((g) => g.id === gameId);
    if (!enabled) return NextResponse.json({ ok: false, error: "Game is not running." }, { status: 404 });

    await recordPlay(db, gameId, storeId);
    return NextResponse.json({ ok: true });
  } catch {
    // A metric must never break the thing it measures.
    return NextResponse.json({ ok: true, recorded: false });
  }
}
