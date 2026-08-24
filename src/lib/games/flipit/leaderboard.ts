import { averageScore, MAX_FLIP_SCORE, MIN_FLIP_SCORE, STRIP_COUNT } from "./rules";
import { findBlockedWords } from "@/lib/games/recipe/text-guard";

/**
 * The Flip It board, as pure functions.
 *
 * No Firestore and no React, so every rule below — who places, who is replaced,
 * how a day rolls over — is testable without touching a database.
 *
 * The board is ONE document holding two capped lists, which is what keeps it
 * index-free: no query, no orderBy, one read. Twenty is small enough that
 * sorting in memory on every write costs nothing.
 */

export const BOARD_SIZE = 20;
export const NAME_MAX = 12;

export type LeaderboardEntry = {
  /** The phone identity. One row per player, so nobody fills the board alone. */
  key: string;
  name: string;
  score: number;
  storeId: string | null;
  storeName: string | null;
  atMs: number;
};

export type Leaderboard = {
  allTime: LeaderboardEntry[];
  today: { dayId: string; entries: LeaderboardEntry[] };
  updatedAtMs: number;
};

export const EMPTY_BOARD: Leaderboard = {
  allTime: [],
  today: { dayId: "", entries: [] },
  updatedAtMs: 0,
};

/**
 * Best score first; the earliest to reach it holds the tie.
 *
 * Arcade convention, and the fair one: two people on 96 are not equal — one of
 * them got there first and has been defending it.
 */
export function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return b.score - a.score || a.atMs - b.atMs;
}

/** Trim, collapse runs of whitespace, and cap. Never throws. */
export function normaliseName(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX);
}

export function validateName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const name = normaliseName(raw);
  if (name.length < 2) return { ok: false, error: "Give us at least two letters." };
  // Same coarse list the recipe composer uses. Not a profanity solution — but a
  // board is read by everyone in the restaurant, so the obvious stays out.
  if (findBlockedWords(name).length > 0) return { ok: false, error: "Pick a different name." };
  return { ok: true, name };
}

/**
 * Check a submitted round against what the game could actually have produced.
 *
 * The client reports its own scores, so this cannot prove honesty — it bounds
 * the lie. Five presses, each a number `judgeFlip` can return, and the average
 * recomputed here rather than trusted from the request.
 */
export function validateScores(
  raw: unknown
): { ok: true; scores: number[]; score: number } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length !== STRIP_COUNT) {
    return { ok: false, error: "Finish a full round first." };
  }

  const scores: number[] = [];
  for (const value of raw) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < MIN_FLIP_SCORE || n > MAX_FLIP_SCORE) {
      return { ok: false, error: "That round does not add up." };
    }
    scores.push(n);
  }

  return { ok: true, scores, score: averageScore(scores) };
}

/**
 * Whether a score is worth opening a transaction for.
 *
 * A player already on the board is always worth checking — they may be
 * improving their own row. Everyone else has to beat the last place, and only
 * once the board is full.
 */
export function qualifies(
  entries: LeaderboardEntry[],
  score: number,
  key: string,
  size = BOARD_SIZE
): boolean {
  if (entries.length < size) return true;
  if (entries.some((e) => e.key === key)) return true;
  return score > entries[entries.length - 1].score;
}

/**
 * Place one entry in one list.
 *
 * A player holds a single row: a better score replaces it, a worse one leaves
 * it alone. Without that, one diner with twenty attempts is the whole board.
 */
export function insertEntry(
  entries: LeaderboardEntry[],
  entry: LeaderboardEntry,
  size = BOARD_SIZE
): LeaderboardEntry[] {
  const existing = entries.find((e) => e.key === entry.key);
  if (existing && existing.score >= entry.score) {
    // Keep the standing row, but let them rename it — the score is the record,
    // the name is just how they signed it.
    return entries.map((e) => (e.key === entry.key ? { ...e, name: entry.name } : e));
  }

  return [...entries.filter((e) => e.key !== entry.key), entry]
    .sort(compareEntries)
    .slice(0, size);
}

/**
 * Apply a submission to the whole board.
 *
 * Today rolls over by comparing the day id rather than by a scheduled job:
 * there is no cron in this repo, and a board that resets on first write after
 * midnight is indistinguishable from one that resets at midnight to anybody
 * looking at it.
 */
export function applySubmission(
  board: Leaderboard,
  entry: LeaderboardEntry,
  dayId: string,
  size = BOARD_SIZE
): Leaderboard {
  const todayEntries = board.today?.dayId === dayId ? board.today.entries : [];

  return {
    allTime: insertEntry(board.allTime || [], entry, size),
    today: { dayId, entries: insertEntry(todayEntries, entry, size) },
    updatedAtMs: entry.atMs,
  };
}

/** Coerce whatever Firestore returned into a board, so a read can never throw. */
export function toLeaderboard(raw: unknown, dayId: string): Leaderboard {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const today = (data.today && typeof data.today === "object" ? data.today : {}) as Record<string, any>;

  return {
    allTime: toEntries(data.allTime),
    // A stale day is an empty day, not yesterday's board wearing today's date.
    today: {
      dayId,
      entries: String(today.dayId || "") === dayId ? toEntries(today.entries) : [],
    },
    updatedAtMs: Number(data.updatedAtMs) || 0,
  };
}

function toEntries(raw: unknown): LeaderboardEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e === "object")
    .map((e: any) => ({
      key: String(e.key || ""),
      name: normaliseName(e.name),
      score: Math.max(0, Math.round(Number(e.score) || 0)),
      storeId: e.storeId ? String(e.storeId) : null,
      storeName: e.storeName ? String(e.storeName) : null,
      atMs: Number(e.atMs) || 0,
    }))
    .filter((e) => e.key && e.name)
    .sort(compareEntries);
}
