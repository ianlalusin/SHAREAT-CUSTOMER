import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requirePlayer } from "@/lib/server/games/auth";
import { getLeaderboard } from "@/lib/server/games/leaderboard-store";
import { EMPTY_BOARD } from "@/lib/games/flipit/leaderboard";

export const runtime = "nodejs";

/**
 * The board. One document read on the warm path.
 *
 * Readable by anyone — the game itself plays away from a table, and a board you
 * cannot see is no reason to come back. Only POSTING needs a table.
 *
 * `canPost` is decided by `requirePlayer`, the SAME gate the submit runs, and
 * not by the token's claims. A token outlives the meal: judging by claims alone
 * said yes to a diner whose session had since closed, so the game offered a
 * name field and then refused the score with "Customer access expired". One
 * rule, one implementation, one answer.
 */
export async function GET(req: Request) {
  try {
    const gate = await requirePlayer(req);
    const board = await getLeaderboard(getAdminDb());
    return NextResponse.json({ ok: true, board, canPost: gate.ok });
  } catch {
    // A board that fails to load must not take the game down with it.
    return NextResponse.json({ ok: true, board: EMPTY_BOARD, canPost: false });
  }
}
