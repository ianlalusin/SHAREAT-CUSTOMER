import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requirePlayer } from "@/lib/server/games/auth";
import { submitScore } from "@/lib/server/games/leaderboard-store";
import { validateName, validateScores } from "@/lib/games/flipit/leaderboard";

export const runtime = "nodejs";

/**
 * Put a name on the board.
 *
 * `requirePlayer` — a live table session — is the whole anti-cheat story, and
 * it has to be, because `deviceId` is client-asserted: without it a script
 * mints unlimited fresh identities and fills every slot with scores that pass
 * validation perfectly well. Bounding the numbers only stops bad NUMBERS; the
 * session gate is what stops fake PLAYERS. It is the same argument the recipe
 * game already makes for votes — a score is worth something because somebody
 * was actually here.
 */
export async function POST(req: Request) {
  const gate = await requirePlayer(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const name = validateName(body?.name);
  if (!name.ok) return NextResponse.json({ ok: false, error: name.error }, { status: 400 });

  // The average is recomputed here, never read from the request.
  const round = validateScores(body?.scores);
  if (!round.ok) return NextResponse.json({ ok: false, error: round.error }, { status: 400 });

  const result = await submitScore(getAdminDb(), {
    key: gate.player.identityKey,
    name: name.name,
    score: round.score,
    storeId: gate.player.storeId,
    storeName: gate.player.storeName,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, board: result.board, placed: result.placed, score: round.score });
}
