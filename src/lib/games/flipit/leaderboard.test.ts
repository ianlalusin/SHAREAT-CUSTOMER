import { describe, it, expect } from "vitest";
import {
  BOARD_SIZE, NAME_MAX, EMPTY_BOARD,
  normaliseName, validateName, validateScores,
  qualifies, insertEntry, applySubmission, toLeaderboard, compareEntries,
  type LeaderboardEntry,
} from "./leaderboard";
import { judgeFlip, MIN_FLIP_SCORE, MAX_FLIP_SCORE, STRIP_COUNT } from "./rules";

function entry(key: string, score: number, atMs = 1_000): LeaderboardEntry {
  return { key, name: key.toUpperCase(), score, storeId: "TEST", storeName: "SharEat Test", atMs };
}

describe("normaliseName", () => {
  it("trims, collapses runs of space, and caps", () => {
    expect(normaliseName("  ana   marie  ")).toBe("ana marie");
    expect(normaliseName("x".repeat(40))).toHaveLength(NAME_MAX);
  });

  it("never throws on junk", () => {
    expect(normaliseName(null)).toBe("");
    expect(normaliseName(42)).toBe("42");
  });
});

describe("validateName", () => {
  it("accepts an ordinary name", () => {
    expect(validateName("Ana")).toEqual({ ok: true, name: "Ana" });
  });

  it("refuses one nobody could read", () => {
    expect(validateName(" a ").ok).toBe(false);
    expect(validateName("").ok).toBe(false);
  });

  /** The board is read by the whole restaurant, so the obvious stays off it. */
  it("refuses a blocked word", () => {
    expect(validateName("gago").ok).toBe(false);
  });

  it("does not trip on a word that merely contains one", () => {
    expect(validateName("Gagalinga").ok).toBe(true);
  });
});

describe("validateScores", () => {
  it("accepts a full round and recomputes the average", () => {
    const r = validateScores([100, 90, 80, 70, 60]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.score).toBe(80);
  });

  it("refuses a round that is not five presses", () => {
    expect(validateScores([100, 100]).ok).toBe(false);
    expect(validateScores([]).ok).toBe(false);
    expect(validateScores("100,100,100,100,100").ok).toBe(false);
  });

  /**
   * The client reports its own scores. This cannot prove honesty — it bounds
   * the lie to what the game could actually have produced, and a perfect round
   * is 100, so the best a fabricated one can claim is a tie.
   */
  it("refuses a score the game could never produce", () => {
    expect(validateScores([9999, 100, 100, 100, 100]).ok).toBe(false);
    expect(validateScores([0, 100, 100, 100, 100]).ok).toBe(false);
    expect(validateScores([100, 100, 100, 100, 95.5]).ok).toBe(false);
    expect(validateScores([100, 100, 100, 100, -20]).ok).toBe(false);
  });

  it("guards the bounds it validates against", () => {
    for (let pos = 0; pos <= 100; pos += 0.25) {
      const { score } = judgeFlip(pos);
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(MIN_FLIP_SCORE);
      expect(score).toBeLessThanOrEqual(MAX_FLIP_SCORE);
    }
  });

  it("accepts a genuinely played round", () => {
    const scores = Array.from({ length: STRIP_COUNT }, (_, i) => judgeFlip(40 + i * 3).score);
    expect(validateScores(scores).ok).toBe(true);
  });
});

describe("insertEntry", () => {
  const board = [entry("a", 95), entry("b", 90), entry("c", 85)];

  it("places by score, earliest wins a tie", () => {
    const out = insertEntry(board, entry("d", 90, 500));
    expect(out.map((e) => e.key)).toEqual(["a", "d", "b", "c"]);
  });

  /** One diner with twenty attempts must not be the whole board. */
  it("keeps one row per player, upgrading their best", () => {
    const out = insertEntry(board, entry("b", 99, 2_000));
    expect(out.filter((e) => e.key === "b")).toHaveLength(1);
    expect(out[0].key).toBe("b");
    expect(out[0].score).toBe(99);
  });

  it("leaves a standing row alone when the new round is worse", () => {
    const out = insertEntry(board, { ...entry("a", 10, 2_000), name: "ANA" });
    expect(out.find((e) => e.key === "a")!.score).toBe(95);
    // The score is the record; the name is only how they signed it.
    expect(out.find((e) => e.key === "a")!.name).toBe("ANA");
  });

  it("caps the board", () => {
    let out: LeaderboardEntry[] = [];
    for (let i = 0; i < BOARD_SIZE + 10; i++) out = insertEntry(out, entry(`p${i}`, 50 + i, i));
    expect(out).toHaveLength(BOARD_SIZE);
    expect(out[0].score).toBe(50 + BOARD_SIZE + 9);
  });
});

describe("qualifies", () => {
  const full = Array.from({ length: BOARD_SIZE }, (_, i) => entry(`p${i}`, 100 - i, i));

  it("lets anyone onto a board with room", () => {
    expect(qualifies([entry("a", 99)], 12, "new")).toBe(true);
  });

  it("refuses a score that cannot beat last place on a full board", () => {
    expect(qualifies(full, 11, "new")).toBe(false);
  });

  it("always lets a player already on the board try to improve", () => {
    expect(qualifies(full, 11, "p0")).toBe(true);
  });
});

describe("applySubmission", () => {
  it("writes both lists", () => {
    const out = applySubmission(EMPTY_BOARD, entry("a", 90), "20260825");
    expect(out.allTime).toHaveLength(1);
    expect(out.today.entries).toHaveLength(1);
    expect(out.today.dayId).toBe("20260825");
  });

  /** Today resets on the first write of the new day; all-time never does. */
  it("clears yesterday from Today but keeps it for all time", () => {
    const day1 = applySubmission(EMPTY_BOARD, entry("a", 90), "20260824");
    const day2 = applySubmission(day1, entry("b", 40), "20260825");

    expect(day2.today.entries.map((e) => e.key)).toEqual(["b"]);
    expect(day2.allTime.map((e) => e.key)).toEqual(["a", "b"]);
  });
});

describe("toLeaderboard", () => {
  it("survives a missing document", () => {
    expect(toLeaderboard(null, "20260825")).toEqual({
      allTime: [],
      today: { dayId: "20260825", entries: [] },
      updatedAtMs: 0,
    });
  });

  it("drops a stale Today rather than dating it today", () => {
    const stored = { allTime: [entry("a", 90)], today: { dayId: "20260824", entries: [entry("a", 90)] } };
    const out = toLeaderboard(stored, "20260825");
    expect(out.today.entries).toEqual([]);
    expect(out.allTime).toHaveLength(1);
  });

  it("throws away rows it cannot render", () => {
    const stored = { allTime: [{ key: "", name: "x" }, { key: "a", name: "" }, entry("b", 70)] };
    expect(toLeaderboard(stored, "20260825").allTime.map((e) => e.key)).toEqual(["b"]);
  });

  it("returns rows already sorted", () => {
    const stored = { allTime: [entry("a", 10), entry("b", 90), entry("c", 50)] };
    expect(toLeaderboard(stored, "20260825").allTime.map((e) => e.key)).toEqual(["b", "c", "a"]);
  });
});

describe("compareEntries", () => {
  it("puts the higher score first", () => {
    expect(compareEntries(entry("a", 90), entry("b", 80))).toBeLessThan(0);
  });

  it("gives a tie to whoever got there first", () => {
    expect(compareEntries(entry("a", 90, 200), entry("b", 90, 100))).toBeGreaterThan(0);
  });
});
