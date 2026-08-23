import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

import { dayIdFor, recentDayIds, buildSeries, type DayCounts, type DayStat } from "@/lib/games/stats";

/**
 * Recording and reading play counts.
 *
 * One document per Manila day: `gameStats/{YYYYMMDD}`.
 *
 *   { dayId, total: { flipit: 12 }, byStore: { TEST: { flipit: 3 } }, updatedAtMs }
 *
 * Counters are NESTED OBJECTS with `set(..., { merge: true })`, never dotted
 * field paths. Under `merge` a key like `"total.flipit"` is stored as a field
 * literally called "total.flipit" rather than nesting — the counter appears to
 * work, the number is written, and the read finds nothing.
 */

const STATS = "gameStats";

/** Write ceiling: Firestore sustains ~1 write/sec on a single document, and
 *  every play in the chain increments the same day doc. At a few hundred plays
 *  a day that is ~0.005/sec, so it is nowhere near the limit — but if a game
 *  ever goes properly viral, shard this by appending `_${0..3}` to the day id
 *  and sum the shards on read. The read path already tolerates missing docs. */
export async function recordPlay(
  db: Firestore,
  gameId: string,
  storeId: string | null,
  now: Date = new Date()
): Promise<void> {
  const dayId = dayIdFor(now);
  const payload: Record<string, any> = {
    dayId,
    updatedAtMs: now.getTime(),
    total: { [gameId]: FieldValue.increment(1) },
  };
  if (storeId) payload.byStore = { [storeId]: { [gameId]: FieldValue.increment(1) } };

  await db.doc(`${STATS}/${dayId}`).set(payload, { merge: true });
}

export type StatsWindow = {
  series: DayStat[];
  byStore: Record<string, DayCounts>;
};

/**
 * Read the last `days` days.
 *
 * Day ids are derivable, so this fetches documents BY NAME with getAll — no
 * query, no ordering, no composite index, and a missing day is simply a day
 * nobody played.
 */
export async function readStats(
  db: Firestore,
  days: number,
  gameIds: string[],
  now: Date = new Date()
): Promise<StatsWindow> {
  const dayIds = recentDayIds(days, now);
  const refs = dayIds.map((id) => db.doc(`${STATS}/${id}`));
  const snaps = await db.getAll(...refs);

  const found: Record<string, DayCounts> = {};
  const byStore: Record<string, DayCounts> = {};

  snaps.forEach((snap, i) => {
    if (!snap.exists) return;
    const data = snap.data() as any;
    found[dayIds[i]] = (data?.total || {}) as DayCounts;

    for (const [storeId, counts] of Object.entries((data?.byStore || {}) as Record<string, DayCounts>)) {
      const bucket = (byStore[storeId] ||= {});
      for (const g of gameIds) bucket[g] = (bucket[g] || 0) + (Number(counts?.[g]) || 0);
    }
  });

  return { series: buildSeries(dayIds, found, gameIds), byStore };
}
