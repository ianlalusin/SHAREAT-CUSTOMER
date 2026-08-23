import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireStaff } from "@/lib/server/games/admin-auth";
import { readStats } from "@/lib/server/games/stats-store";
import { totalsByGame, grandTotal, peakDay, MAX_STATS_DAYS } from "@/lib/games/stats";
import { GAMES } from "@/lib/games/registry";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const gate = await requireStaff(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const url = new URL(req.url);
  const days = Math.min(MAX_STATS_DAYS, Math.max(1, Number(url.searchParams.get("days") || 14)));

  // Retired games still have history worth showing, so the id list is whatever
  // the window actually contains plus everything currently registered.
  const gameIds = GAMES.map((g) => g.id);
  const { series, byStore } = await readStats(getAdminDb(), days, gameIds);

  return NextResponse.json({
    ok: true,
    days,
    games: GAMES.map((g) => ({ id: g.id, title: g.title })),
    series,
    totals: totalsByGame(series, gameIds),
    grandTotal: grandTotal(series),
    peak: peakDay(series),
    byStore,
  });
}
