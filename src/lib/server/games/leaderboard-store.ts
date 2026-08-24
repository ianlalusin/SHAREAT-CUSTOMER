import type { Firestore } from "firebase-admin/firestore";

import { dayIdFor } from "@/lib/games/stats";
import {
  applySubmission, qualifies, toLeaderboard,
  type Leaderboard, type LeaderboardEntry,
} from "@/lib/games/flipit/leaderboard";

/**
 * The Flip It board.
 *
 * ONE document, `gameLeaderboards/flipit`, holding two capped lists. That is
 * the whole storage design and it is chosen for the same reason as the recipe
 * feed: a document read needs no query, so no composite index, so nothing that
 * has to be deployed from the POS repo.
 */

const BOARDS = "gameLeaderboards";
const GAME_ID = "flipit";

/**
 * Short, because a board people are actively competing on is worth being
 * nearly-live. `maxInstances: 1` means one process, so a process-local cache
 * is a real cache rather than a coin flip.
 */
const BOARD_CACHE_TTL_MS = 20 * 1000;

let cache: { board: Leaderboard; readAtMs: number; dayId: string } | null = null;

function boardRef(db: Firestore) {
  return db.doc(`${BOARDS}/${GAME_ID}`);
}

/** The diner-facing read: one document, cached briefly. */
export async function getLeaderboard(db: Firestore, now: Date = new Date()): Promise<Leaderboard> {
  const dayId = dayIdFor(now);

  // A cache from yesterday would serve yesterday's "Today" board, which is the
  // one thing this screen must never do.
  if (cache && cache.dayId === dayId && now.getTime() - cache.readAtMs < BOARD_CACHE_TTL_MS) {
    return cache.board;
  }

  const snap = await boardRef(db).get();
  const board = toLeaderboard(snap.exists ? snap.data() : null, dayId);
  cache = { board, readAtMs: now.getTime(), dayId };
  return board;
}

export type SubmitArgs = {
  key: string;
  name: string;
  score: number;
  storeId: string | null;
  storeName: string | null;
  now?: Date;
};

/**
 * Put a score on the board.
 *
 * A transaction, unlike the metrics counters — "keep the best score, sorted,
 * capped at twenty" is a read-modify-write and cannot be expressed as a
 * commutative increment. Contention is bounded by human hands: a round takes
 * tens of seconds to play, so even a full restaurant submits at a pace a single
 * document absorbs comfortably.
 *
 * The cached board is checked first, so a score that cannot place does not open
 * a transaction at all.
 */
export async function submitScore(
  db: Firestore,
  args: SubmitArgs
): Promise<{ ok: true; board: Leaderboard; placed: boolean } | { ok: false; error: string; status: number }> {
  const now = args.now || new Date();
  const dayId = dayIdFor(now);

  const entry: LeaderboardEntry = {
    key: args.key,
    name: args.name,
    score: args.score,
    storeId: args.storeId,
    storeName: args.storeName,
    atMs: now.getTime(),
  };

  try {
    const current = await getLeaderboard(db, now);
    const couldPlace =
      qualifies(current.allTime, entry.score, entry.key) ||
      qualifies(current.today.entries, entry.score, entry.key);

    if (!couldPlace) return { ok: true, board: current, placed: false };

    const ref = boardRef(db);
    const next = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      // Re-read inside the transaction: the cached copy was only ever good
      // enough to decide whether to bother.
      const board = toLeaderboard(snap.exists ? snap.data() : null, dayId);
      const updated = applySubmission(board, entry, dayId);
      tx.set(ref, updated, { merge: false });
      return updated;
    });

    cache = { board: next, readAtMs: now.getTime(), dayId };
    return { ok: true, board: next, placed: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not save your score.", status: e?.httpStatus || 500 };
  }
}

/** Tests, and anything that writes the board outside `submitScore`. */
export function clearLeaderboardCache(): void {
  cache = null;
}
