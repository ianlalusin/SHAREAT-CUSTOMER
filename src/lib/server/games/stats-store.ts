import { createHash } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

import {
  dayIdFor, recentDayIds, buildSeries, toDayCounts,
  type DayCounts, type DayStat, type RawDay,
} from "@/lib/games/stats";
import type { GameMetric } from "@/lib/games/metrics";

/**
 * Recording and reading game metrics.
 *
 * One document per Manila day: `gameStats/{YYYYMMDD}`.
 *
 *   { dayId, unique: { flipit: { view: 12, use: 4 } },
 *            events: { flipit: { view: 30, use: 9 } },
 *            byStore: { TEST: { flipit: { view: 3, use: 1 } } }, updatedAtMs }
 *
 * Counters are NESTED OBJECTS with `set(..., { merge: true })`, never dotted
 * field paths. Under `merge` a key like `"unique.flipit.view"` is stored as a
 * field literally called that rather than nesting — the counter appears to
 * work, the number is written, and the read finds nothing.
 */

const STATS = "gameStats";

/**
 * The dedup lock. Its EXISTENCE is the whole "already counted" check — the same
 * idiom as a recipe's vote doc.
 *
 * Deliberately NOT stored under the day document. A single table session that
 * straddles Manila midnight would then write into two day docs and be counted
 * as two unique visitors, breaking the one rule this whole module exists to
 * enforce. Keyed by identity, it cannot.
 *
 * Grows without bound. At a few hundred events a day that is nothing, and every
 * doc carries `createdAtMs` so a native TTL policy can be attached later —
 * noting that a TTL policy is Firestore project config, like an index, and not
 * something this repo deploys.
 */
const SEEN = "gameSeen";

function lockId(gameId: string, metric: GameMetric, dedupKey: string): string {
  return createHash("sha1").update(`${gameId}::${metric}::${dedupKey}`).digest("hex");
}

/** Firestore says ALREADY_EXISTS as a gRPC code 6; the string form varies. */
function isAlreadyExists(e: any): boolean {
  return e?.code === 6 || e?.code === "already-exists" || /already exists/i.test(String(e?.message || ""));
}

export type RecordMetricResult = { counted: "unique" | "event" };

/**
 * Count one signal.
 *
 * Write ceiling: Firestore sustains ~1 write/sec on a single document, and
 * every event in the chain increments the same day doc. At a few hundred a day
 * that is ~0.005/sec, nowhere near the limit — but if a game ever goes properly
 * viral, shard by appending `_${0..3}` to the day id and sum the shards on
 * read. The read path already tolerates missing docs.
 *
 * NOT a transaction, on purpose. The day-doc write is a bare commutative
 * increment and is immune to contention; putting it inside a transaction whose
 * commit depends on the lock read would reintroduce read-modify-write
 * contention on a chain-wide hot document at exactly the busy moments this is
 * meant to measure. Lock first, increment second: a crash between the two
 * under-counts by one — which this metric already tolerates by design — and can
 * never over-count on a retry.
 */
export async function recordMetric(
  db: Firestore,
  args: {
    gameId: string;
    metric: GameMetric;
    dedupKey: string | null;
    storeId: string | null;
    now?: Date;
  }
): Promise<RecordMetricResult> {
  const { gameId, metric, dedupKey, storeId } = args;
  const now = args.now || new Date();
  const dayRef = db.doc(`${STATS}/${dayIdFor(now)}`);

  const base = { dayId: dayIdFor(now), updatedAtMs: now.getTime() };
  const one = FieldValue.increment(1);
  const eventOnly = { ...base, events: { [gameId]: { [metric]: one } } };

  // No usable identity means no way to tell a repeat from a new player. Count
  // the volume, claim no reach — better than inventing a unique visitor.
  if (!dedupKey) {
    await dayRef.set(eventOnly, { merge: true });
    return { counted: "event" };
  }

  const lockRef = db.doc(`${SEEN}/${lockId(gameId, metric, dedupKey)}`);
  try {
    await lockRef.create({ gameId, metric, createdAtMs: now.getTime() });
  } catch (e: any) {
    if (!isAlreadyExists(e)) throw e;
    await dayRef.set(eventOnly, { merge: true });
    return { counted: "event" };
  }

  const first: Record<string, any> = {
    ...base,
    unique: { [gameId]: { [metric]: one } },
    events: { [gameId]: { [metric]: one } },
  };
  // Branch attribution rides on unique only: "how many people at Lipa", not
  // "how many taps at Lipa", which is the question anyone actually asks.
  if (storeId) first.byStore = { [storeId]: { [gameId]: { [metric]: one } } };

  await dayRef.set(first, { merge: true });
  return { counted: "unique" };
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
 * nobody played. The `seen` locks live in their own collection, so they cost
 * nothing here.
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

  const found: Record<string, RawDay> = {};
  const byStore: Record<string, DayCounts> = {};

  snaps.forEach((snap, i) => {
    if (!snap.exists) return;
    const data = (snap.data() || {}) as Record<string, any>;

    found[dayIds[i]] = {
      unique: toDayCounts(data.unique, gameIds),
      events: toDayCounts(data.events, gameIds),
      // Days written before the two-metric cutover carry a single `total` and
      // no `unique`. Kept so the chart does not step to zero on the cutover
      // date, which reads as "the counter broke" rather than "it changed".
      legacyPlays: data.unique ? 0 : sumLegacyTotal(data.total),
    };

    for (const [storeId, counts] of Object.entries((data.byStore || {}) as Record<string, unknown>)) {
      const bucket = (byStore[storeId] ||= {});
      const day = toDayCounts(counts, gameIds);
      for (const g of gameIds) {
        const prev = bucket[g] || { view: 0, use: 0 };
        bucket[g] = { view: prev.view + day[g].view, use: prev.use + day[g].use };
      }
    }
  });

  return { series: buildSeries(dayIds, found, gameIds), byStore };
}

/** The retired `total: { gameId: plays }` shape. Never the new nested one. */
function sumLegacyTotal(total: unknown): number {
  if (!total || typeof total !== "object") return 0;
  return Object.values(total as Record<string, unknown>).reduce<number>(
    (sum, v) => sum + (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0),
    0
  );
}
