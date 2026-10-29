/**
 * Ghost Hunt — the rules, as pure functions.
 *
 * A seasonal AR game: diners point their camera around the restaurant, ghosts
 * appear, and a few of them carry a prize. Everything that decides WHO wins
 * lives on the server and is judged here, never on the phone — if each phone
 * rolled its own prize ghost, every diner in the room would win.
 *
 * Reusable across occasions: `theme` only picks the character pack the phone
 * draws (ghosts for Halloween, Santa and Rudolf for Christmas). The prizes,
 * hours and daily limits are the same machinery whatever is on screen.
 */

export type GhostTheme = "halloween" | "christmas";
export const GHOST_THEMES: GhostTheme[] = ["halloween", "christmas"];

/** A daily appearance window, Manila wall-clock, "HH:MM". */
export type GhostWindow = { start: string; end: string };

export type GhostPrize = {
  /** Stable key; the character pack draws a matching ghost for it. */
  id: string;
  name: string;
  /** How many of this prize each branch gives away per day. */
  perDay: number;
};

export type GhostHuntSettings = {
  theme: GhostTheme;
  startsAtMs: number;
  endsAtMs: number;
  windows: GhostWindow[];
  prizes: GhostPrize[];
  /** Chance that a scan finds anything at all (0–1). */
  appearChance: number;
  /** Of the scans that find something, the share that is a prize ghost (0–1). */
  prizeShare: number;
  /** Of the non-prize finds, the share that says hi (the rest fly by). */
  helloShare: number;
  hashtag: string;
  tagHandle: string;
};

export type SpawnKind = "none" | "hello" | "flyby" | "prize";

/** Manila is UTC+8 with no daylight saving. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Midnight Manila on a calendar date, as a UTC instant. */
export function manilaMidnightMs(year: number, month1: number, day: number): number {
  return Date.UTC(year, month1 - 1, day) - MANILA_OFFSET_MS;
}

/** The Manila calendar day an instant falls on, "YYYY-MM-DD". Day counters key off it. */
export function manilaDayKey(nowMs: number): string {
  return new Date(nowMs + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Minutes since Manila midnight. */
export function manilaMinuteOfDay(nowMs: number): number {
  const d = new Date(nowMs + MANILA_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function parseHHMM(s: unknown): number | null {
  const m = String(s ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

/**
 * Whether ghosts are out right now. No windows means all day.
 * A window whose end is before its start runs past midnight (e.g. 20:00–01:00).
 */
export function isInsideWindow(windows: GhostWindow[], nowMs: number): boolean {
  if (!windows.length) return true;
  const t = manilaMinuteOfDay(nowMs);
  return windows.some((w) => {
    const a = parseHHMM(w.start);
    const b = parseHHMM(w.end);
    if (a === null || b === null) return false;
    return a <= b ? t >= a && t < b : t >= a || t < b;
  });
}

export type EventState =
  | { live: true }
  | { live: false; reason: "not-started" | "ended" | "off-hours"; message: string };

export function eventState(s: GhostHuntSettings, nowMs: number): EventState {
  if (nowMs < s.startsAtMs) return { live: false, reason: "not-started", message: "The hunt has not started yet." };
  if (nowMs > s.endsAtMs) return { live: false, reason: "ended", message: "The hunt is over. Thanks for playing!" };
  if (!isInsideWindow(s.windows, nowMs)) {
    return { live: false, reason: "off-hours", message: `Ghosts only come out ${describeWindows(s.windows)}.` };
  }
  return { live: true };
}

function fmt12(mins: number): string {
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return m ? `${h}:${String(m).padStart(2, "0")} ${suffix}` : `${h} ${suffix}`;
}

/** "from 5 PM to 10 PM", for diners. */
export function describeWindows(windows: GhostWindow[]): string {
  const parts = windows
    .map((w) => [parseHHMM(w.start), parseHHMM(w.end)] as const)
    .filter(([a, b]) => a !== null && b !== null)
    .map(([a, b]) => `${fmt12(a!)} to ${fmt12(b!)}`);
  return parts.length ? `from ${parts.join(" and ")}` : "all day";
}

/**
 * How far through today's ghost hours we are, 0–1. Drives prize pacing.
 * No windows means the whole day counts.
 */
export function dayProgress(windows: GhostWindow[], nowMs: number): number {
  const t = manilaMinuteOfDay(nowMs);
  const spans: [number, number][] = [];
  for (const w of windows) {
    const a = parseHHMM(w.start);
    const b = parseHHMM(w.end);
    if (a === null || b === null) continue;
    if (a <= b) spans.push([a, b]);
    else spans.push([a, 1440], [0, b]);
  }
  if (!spans.length) return t / 1440;
  let total = 0;
  let done = 0;
  for (const [a, b] of spans) {
    total += b - a;
    done += Math.max(0, Math.min(t, b) - a);
  }
  return total > 0 ? Math.min(1, done / total) : 1;
}

/**
 * How many of a prize may have been won by now. Prizes unlock gradually across
 * the day's hours, so the lunch crowd cannot clear out what dinner was meant to
 * get — with 30 phones hunting, an unpaced day would be gone in minutes. The
 * first one is always available as soon as the hours open.
 */
export function releasedSoFar(perDay: number, progress: number): number {
  if (perDay <= 0) return 0;
  return Math.min(perDay, Math.max(1, Math.ceil(perDay * progress)));
}

/** Prizes that can still be won right now at a branch, given what has already been won. */
export function prizesLeft(prizes: GhostPrize[], issued: Record<string, number>, progress = 1): GhostPrize[] {
  return prizes.filter((p) => (Number(issued[p.id]) || 0) < releasedSoFar(p.perDay, progress));
}

/**
 * What one scan finds.
 *
 * `rand` is injected so the odds are testable. A prize ghost is only possible
 * when the table has not already won this visit and some prize is still in
 * stock today; otherwise that share of the roll falls through to the free
 * ghosts, so the game keeps feeling alive after the prizes run out.
 */
export function rollSpawn(args: {
  settings: GhostHuntSettings;
  issued: Record<string, number>;
  tableHasWon: boolean;
  rand: () => number;
  /** From `dayProgress`. Defaults to the end of the day, i.e. unpaced. */
  progress?: number;
}): { kind: SpawnKind; prize?: GhostPrize } {
  const { settings, issued, tableHasWon, rand, progress = 1 } = args;
  if (rand() >= settings.appearChance) return { kind: "none" };

  const stock = tableHasWon ? [] : prizesLeft(settings.prizes, issued, progress);
  if (stock.length && rand() < settings.prizeShare) {
    // Weight by what is left, so a prize with more stock turns up more often
    // and the day does not run out of one while another sits untouched.
    const weights = stock.map((p) => p.perDay - (Number(issued[p.id]) || 0));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    for (let i = 0; i < stock.length; i++) {
      r -= weights[i];
      if (r < 0) return { kind: "prize", prize: stock[i] };
    }
    return { kind: "prize", prize: stock[stock.length - 1] };
  }

  return { kind: rand() < settings.helloShare ? "hello" : "flyby" };
}

/** Halloween 2026 defaults: Oct 30 to the end of Nov 15, Manila. */
export const DEFAULT_SETTINGS: GhostHuntSettings = {
  theme: "halloween",
  startsAtMs: manilaMidnightMs(2026, 10, 30),
  endsAtMs: manilaMidnightMs(2026, 11, 16) - 1,
  windows: [
    { start: "11:00", end: "14:00" },
    { start: "17:00", end: "22:00" },
  ],
  prizes: [
    { id: "melona", name: "2 Melona ice cream", perDay: 3 },
    { id: "coke", name: "1.5L Coke", perDay: 2 },
    { id: "kimbap", name: "1 serving Kimbap", perDay: 2 },
    { id: "enoki", name: "1 serving Enoki Rolls", perDay: 2 },
  ],
  appearChance: 0.45,
  prizeShare: 0.12,
  helloShare: 0.55,
  hashtag: "#SharEatGhostHunt",
  tagHandle: "@shareat",
};

function clamp01(n: unknown, fallback: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
}

/**
 * Whatever is stored, as settings the game can run on. Anything missing or
 * malformed falls back to the default rather than breaking the hunt mid-event.
 */
export function normalizeSettings(raw: unknown): GhostHuntSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const d = DEFAULT_SETTINGS;

  const windows = Array.isArray(r.windows)
    ? r.windows
        .map((w: any) => ({ start: String(w?.start ?? "").trim(), end: String(w?.end ?? "").trim() }))
        .filter((w: GhostWindow) => parseHHMM(w.start) !== null && parseHHMM(w.end) !== null)
        .slice(0, 6)
    : d.windows;

  const seen = new Set<string>();
  const prizes = Array.isArray(r.prizes)
    ? r.prizes
        .map((p: any) => {
          const name = String(p?.name ?? "").trim().slice(0, 60);
          const id = slug(String(p?.id || name));
          return { id, name, perDay: Math.max(0, Math.min(99, Math.floor(Number(p?.perDay) || 0))) };
        })
        .filter((p: GhostPrize) => p.id && p.name && !seen.has(p.id) && seen.add(p.id))
        .slice(0, 8)
    : d.prizes;

  const startsAtMs = Number(r.startsAtMs);
  const endsAtMs = Number(r.endsAtMs);

  return {
    theme: GHOST_THEMES.includes(r.theme) ? r.theme : d.theme,
    startsAtMs: Number.isFinite(startsAtMs) && startsAtMs > 0 ? startsAtMs : d.startsAtMs,
    endsAtMs: Number.isFinite(endsAtMs) && endsAtMs > 0 ? endsAtMs : d.endsAtMs,
    windows,
    prizes,
    appearChance: clamp01(r.appearChance, d.appearChance),
    prizeShare: clamp01(r.prizeShare, d.prizeShare),
    helloShare: clamp01(r.helloShare, d.helloShare),
    hashtag: String(r.hashtag ?? d.hashtag).trim().slice(0, 40) || d.hashtag,
    tagHandle: String(r.tagHandle ?? d.tagHandle).trim().slice(0, 40) || d.tagHandle,
  };
}

/** Minimum gap between two scans from one diner. Stops a script hammering the roll. */
export const MIN_SCAN_GAP_MS = 8_000;
/** How long a prize ghost stays catchable after it appears. */
export const PRIZE_GHOST_TTL_MS = 12_000;
/** Slack for the round trip between the tap and the server. */
export const CATCH_GRACE_MS = 2_500;
/** Wrong cashier PINs before a ticket locks and needs the manager. */
export const MAX_PIN_FAILS = 5;

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function genClaimCode(rand: () => number = Math.random, len = 5): string {
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}
