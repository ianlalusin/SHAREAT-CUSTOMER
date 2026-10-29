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
export type GhostWindow = {
  start: string;
  end: string;
  /**
   * Share of the day's prizes this time slot unlocks (0–1). Lets a branch save
   * most prizes for the dinner rush. Unset on every slot = spread by the clock,
   * as before; unset on some = those split whatever share is left, by length.
   */
  share?: number;
  /** This slot's own prize-ghost chance (0–1), overriding the branch's `prizeShare`. */
  prizeShare?: number;
};

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

/** A window's minutes as spans within one day (one past midnight splits in two). */
function windowSpans(w: GhostWindow): [number, number][] {
  const a = parseHHMM(w.start);
  const b = parseHHMM(w.end);
  if (a === null || b === null) return [];
  return a <= b ? [[a, b]] : [[a, 1440], [0, b]];
}

/**
 * Each window's weight in prize pacing. With no shares set it is the window's
 * length — prizes unlock evenly by the clock, as before. Set shares are used as
 * given; windows without one split whatever share is left, by length.
 */
export function windowWeights(windows: GhostWindow[]): number[] {
  const mins = windows.map((w) => windowSpans(w).reduce((s, [a, b]) => s + (b - a), 0));
  const set = windows.map((w) => (typeof w.share === "number" ? Math.max(0, w.share) : null));
  if (set.every((x) => x === null)) return mins;
  const given = set.reduce<number>((s, x) => s + (x ?? 0), 0);
  const left = Math.max(0, 1 - given);
  const unsetMins = mins.reduce((s, m, i) => s + (set[i] === null ? m : 0), 0);
  return set.map((x, i) => (x !== null ? x : unsetMins > 0 ? (left * mins[i]) / unsetMins : 0));
}

/**
 * How much of today's prize release has happened, 0–1. Drives prize pacing.
 * Within a window prizes unlock evenly; across windows, by each window's
 * weight — so a branch can save most of its prizes for the dinner rush.
 * No windows means the whole day counts.
 */
export function dayProgress(windows: GhostWindow[], nowMs: number): number {
  const t = manilaMinuteOfDay(nowMs);
  const valid = windows.filter((w) => windowSpans(w).length);
  if (!valid.length) return t / 1440;
  const weights = windowWeights(valid);
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return 1;
  let done = 0;
  valid.forEach((w, i) => {
    const spans = windowSpans(w);
    const len = spans.reduce((s, [a, b]) => s + (b - a), 0);
    const elapsed = spans.reduce((s, [a, b]) => s + Math.max(0, Math.min(t, b) - a), 0);
    if (len > 0) done += weights[i] * (elapsed / len);
  });
  return Math.min(1, done / total);
}

/** The prize-ghost chance right now: the current window's own, else the branch's. */
export function activePrizeShare(settings: GhostHuntSettings, nowMs: number): number {
  const t = manilaMinuteOfDay(nowMs);
  const w = settings.windows.find(
    (x) => typeof x.prizeShare === "number" && windowSpans(x).some(([a, b]) => t >= a && t < b)
  );
  return w ? (w.prizeShare as number) : settings.prizeShare;
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
  /** From `activePrizeShare` — the current time slot's chance. Defaults to the branch's. */
  prizeShare?: number;
}): { kind: SpawnKind; prize?: GhostPrize } {
  const { settings, issued, tableHasWon, rand, progress = 1, prizeShare = settings.prizeShare } = args;
  if (rand() >= settings.appearChance) return { kind: "none" };

  const stock = tableHasWon ? [] : prizesLeft(settings.prizes, issued, progress);
  if (stock.length && rand() < prizeShare) {
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
        .map((w: any) => {
          const win: GhostWindow = { start: String(w?.start ?? "").trim(), end: String(w?.end ?? "").trim() };
          // Blank (null/undefined/"") means "not set" — the slot follows the defaults.
          const opt = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : clamp01(v, 0));
          const share = opt(w?.share);
          const prizeShare = opt(w?.prizeShare);
          if (share !== null) win.share = share;
          if (prizeShare !== null) win.prizeShare = prizeShare;
          return win;
        })
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

/**
 * What one branch may set differently from the chain-wide settings. Each field
 * is optional: absent means "use the chain's". Dates, theme and odds stay
 * chain-wide — it is one event, run with local prizes and local socials.
 */
export type BranchOverrides = {
  prizes?: GhostPrize[];
  windows?: GhostWindow[];
  hashtag?: string;
  tagHandle?: string;
};

export const OVERRIDE_FIELDS = ["prizes", "windows", "hashtag", "tagHandle"] as const;

/** Keep only well-formed override fields, normalised the same way as the chain settings. */
export function normalizeOverrides(raw: unknown): BranchOverrides {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = normalizeSettings({ ...r });
  const out: BranchOverrides = {};
  if (Array.isArray(r.prizes)) out.prizes = n.prizes;
  if (Array.isArray(r.windows)) out.windows = n.windows;
  if (typeof r.hashtag === "string" && r.hashtag.trim()) out.hashtag = n.hashtag;
  if (typeof r.tagHandle === "string" && r.tagHandle.trim()) out.tagHandle = n.tagHandle;
  return out;
}

/** The settings a branch actually runs on. */
export function settingsForBranch(base: GhostHuntSettings, overrides: unknown): GhostHuntSettings {
  return { ...base, ...normalizeOverrides(overrides) };
}

/** Total of each prize not yet caught today — caught counts, claimed or not. */
export function prizesRemaining(prizes: GhostPrize[], issued: Record<string, number>) {
  return prizes
    .filter((p) => p.perDay > 0)
    .map((p) => ({ id: p.id, name: p.name, left: Math.max(0, p.perDay - (Number(issued[p.id]) || 0)) }));
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

/**
 * Whether a prize ticket the PHONE saved earlier should still be shown.
 *
 * The phone keeps the last ticket so a diner can claim it at the counter
 * after their table session has closed. It must not follow them around:
 * once claimed, on another day (prizes are good for the day won), or at
 * another branch, it is stale and only confuses — "See your prize" from last
 * week's visit at a branch that is not even running the hunt.
 * `storeId` is the branch the diner is at now, or null when away from a table.
 */
export function savedTicketStillValid(
  ticket: { status: string; day: string; storeId?: string },
  storeId: string | null,
  nowMs: number
): boolean {
  if (ticket.status !== "won") return false;
  if (ticket.day !== manilaDayKey(nowMs)) return false;
  return !storeId || ticket.storeId === storeId;
}
