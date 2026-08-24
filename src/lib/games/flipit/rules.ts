/**
 * "Flip It" — the whole game, as pure functions.
 *
 * A needle sweeps a heat bar; the player presses to turn one strip of pork. How
 * far they were from the centre of the green band decides BOTH the doneness
 * shown on the pan and the score, from one number — so the picture can never
 * disagree with what the score says.
 *
 * No Firestore, no React. The rules are testable without rendering anything.
 */

export type Doneness = "raw" | "under" | "good" | "perfect" | "burnt";

export type FlipResult = {
  doneness: Doneness;
  score: number;
  verdict: string;
  flavour: string;
};

/** Where the green band sits on the 0-100 bar, and how fast the needle moves. */
export const PERFECT_LO = 43;
export const PERFECT_HI = 57;
export const PERFECT_MID = (PERFECT_LO + PERFECT_HI) / 2;
/** Percent of the bar per animation frame. Lower = easier. */
export const NEEDLE_SPEED = 0.72;
/** How many strips are on the pan — one press each. */
export const STRIP_COUNT = 5;

/** Anything this close to the band still cooks acceptably. */
const NEAR_MISS = 18;
/** How steeply the score falls away from the centre. */
const FALLOFF = 1.8;

/**
 * The range a single press can possibly score.
 *
 * The leaderboard validates a submitted round against these: a client reports
 * its own scores, so the only cheap, meaningful guard is that every number is
 * one this game could actually have produced. Dead centre is 100, so the best
 * a fabricated round can claim is a tie with an honest grill master.
 */
export const MIN_FLIP_SCORE = 11;
export const MAX_FLIP_SCORE = 100;

/**
 * Judge one press.
 *
 * The band is deliberately generous. A diner plays this once, standing, while
 * waiting for food — a window they miss four times out of five is not a game
 * they play twice.
 */
/** In the band, nothing scores below this — the band IS the reward. */
const PERFECT_FLOOR = 92;

export function judgeFlip(position: number): FlipResult {
  const pos = clamp(position, 0, 100);
  const off = Math.abs(pos - PERFECT_MID);
  const score = Math.max(MIN_FLIP_SCORE, Math.round(MAX_FLIP_SCORE - off * FALLOFF));

  if (pos >= PERFECT_LO && pos <= PERFECT_HI) {
    return {
      doneness: "perfect",
      score: Math.max(PERFECT_FLOOR, score),
      verdict: "AWESOME!",
      flavour: "Delicious samgyupsal",
    };
  }
  if (off <= NEAR_MISS) {
    return {
      doneness: "good",
      score,
      verdict: "NICE ONE",
      flavour: pos < PERFECT_MID ? "A couple of seconds early" : "A couple of seconds late",
    };
  }
  if (pos < PERFECT_MID) {
    return { doneness: "under", score, verdict: "UNDERCOOKED", flavour: "Still pink in the middle" };
  }
  return { doneness: "burnt", score, verdict: "BURNT!", flavour: "Sunog, sayang." };
}

export type RoundVerdict = { verdict: string; flavour: string; doneness: Doneness };

/** The closing line for a finished round of five. */
export function judgeRound(average: number): RoundVerdict {
  if (average >= 90) return { verdict: "GRILL MASTER", flavour: "Five for five. Ikaw na.", doneness: "perfect" };
  if (average >= 70) return { verdict: "SOLID GRILLING", flavour: "You can be trusted with the tongs.", doneness: "good" };
  if (average >= 45) return { verdict: "NEEDS PRACTICE", flavour: "Watch the green band, not the meat.", doneness: "under" };
  return { verdict: "LET SOMEONE ELSE COOK", flavour: "The kitchen is worried.", doneness: "burnt" };
}

export function averageScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/**
 * Which strip turns next — a random one of those still raw.
 * Returns -1 when the round is over, so callers never index with undefined.
 */
export function pickRawStrip(states: Doneness[], random: () => number = Math.random): number {
  const raw = states.map((s, i) => (s === "raw" ? i : -1)).filter((i) => i >= 0);
  if (raw.length === 0) return -1;
  return raw[Math.min(raw.length - 1, Math.floor(random() * raw.length))];
}

/**
 * Where the needle starts a turn: outside the band, heading into it.
 *
 * Restarting at 0 every turn made the green arrive after a fixed beat, so the
 * game rewarded counting rather than watching.
 */
export function startingNeedle(random: () => number = Math.random): { position: number; direction: 1 | -1 } {
  const fromLeft = random() < 0.5;
  return fromLeft
    ? { position: random() * (PERFECT_LO - 20), direction: 1 }
    : { position: PERFECT_HI + 20 + random() * (80 - PERFECT_HI), direction: -1 };
}

/** Advance the needle one frame, bouncing at both ends. */
export function stepNeedle(
  position: number,
  direction: 1 | -1,
  speed = NEEDLE_SPEED
): { position: number; direction: 1 | -1 } {
  let next = position + direction * speed;
  let dir = direction;
  if (next >= 100) { next = 100; dir = -1; }
  if (next <= 0)   { next = 0;   dir = 1; }
  return { position: next, direction: dir };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}
