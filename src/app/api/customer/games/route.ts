import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolveGameCaller, callerStoreId } from "@/lib/server/games/auth";
import { readGameConfigs, selectEnabledGames } from "@/lib/server/games/config";

export const runtime = "nodejs";

/**
 * The shelf. Deliberately open to anonymous callers — browsing the hub away
 * from a table is the point of having content worth coming back for; the
 * session check happens when someone tries to actually play.
 */
export async function GET(req: Request) {
  try {
    const caller = await resolveGameCaller(req);
    const db = getAdminDb();
    const configs = await readGameConfigs(db);
    const games = selectEnabledGames(configs, callerStoreId(caller));

    return NextResponse.json({ ok: true, games, canPlay: caller.tier === "player" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Could not load games." }, { status: 500 });
  }
}
