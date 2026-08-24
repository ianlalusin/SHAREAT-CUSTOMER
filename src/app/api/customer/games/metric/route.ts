import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolveGameCaller, callerStoreId } from "@/lib/server/games/auth";
import { readGameConfigs, selectEnabledGames } from "@/lib/server/games/config";
import { recordMetric } from "@/lib/server/games/stats-store";
import { hashDeviceId } from "@/lib/server/customer-participants";
import { isGameMetric, metricsDedupKey } from "@/lib/games/metrics";

export const runtime = "nodejs";

/**
 * "Someone viewed / used this game."
 *
 * Deliberately open to anonymous callers — Flip It needs no session, so
 * requiring one would undercount exactly the players it is meant to measure.
 *
 * Only a game that is actually enabled for this caller can be counted, so a
 * crafted request cannot invent traffic for a game nobody is running. It can
 * still inflate a game that IS running: this is a client-reported metric, good
 * for trend and comparison between games, not an audited figure. The dedup key
 * is client-supplied for the same reason — it buys accuracy, never authority.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const gameId = String(body?.gameId || "");
    const metric = body?.metric;

    if (!gameId) return NextResponse.json({ ok: false, error: "Missing gameId." }, { status: 400 });
    if (!isGameMetric(metric)) {
      return NextResponse.json({ ok: false, error: "Unknown metric." }, { status: 400 });
    }

    const caller = await resolveGameCaller(req);
    const storeId = callerStoreId(caller);

    const db = getAdminDb();
    const configs = await readGameConfigs(db);
    const enabled = selectEnabledGames(configs, storeId).some((g) => g.id === gameId);
    if (!enabled) return NextResponse.json({ ok: false, error: "Game is not running." }, { status: 404 });

    // Hashed with the same function that produces `participantId`, so a phone
    // that plays before joining a table and again after is one phone in both.
    const rawDeviceId = String(body?.deviceId || "");
    const deviceHash = rawDeviceId ? hashDeviceId(rawDeviceId) : "";
    const dedupKey = metricsDedupKey(body?.visitId, deviceHash);

    const result = await recordMetric(db, { gameId, metric, dedupKey, storeId });
    return NextResponse.json({ ok: true, counted: result.counted });
  } catch {
    // A metric must never break the thing it measures.
    return NextResponse.json({ ok: true, recorded: false });
  }
}
