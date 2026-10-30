/**
 * Game metrics, by game, by day.
 *
 * The whole storage design turns on one choice: **the day is the document id**.
 * Day ids are derivable from a date, so the admin screen fetches exactly the
 * documents it wants by name — no query, therefore no composite index,
 * therefore nothing that has to be deployed from the POS repo. Thirty days is
 * thirty `getAll` reads and nothing else.
 *
 * Each day carries TWO tallies per game, and the difference between them is the
 * point:
 *   unique — one per phone per session. Reach: how many people.
 *   events — every signal. Volume: how much they played.
 * See `lib/games/metrics.ts` for what a view and a use mean per game.
 */

import type { GameMetric } from "./metrics";

/** The chain trades in the Philippines; a "day" is a Manila day, not a UTC one. */
export const STATS_TIMEZONE = "Asia/Manila";

/** Longest window the admin screen will ask for. Keeps the read bounded. */
export const MAX_STATS_DAYS = 60;

export type MetricCounts = { view: number; use: number };

/** gameId -> counts. */
export type DayCounts = Record<string, MetricCounts>;

/** What one day document holds, once coerced. */
export type RawDay = {
  unique: DayCounts;
  events: DayCounts;
  /**
   * The retired single "plays" figure, from `total` on days written before the
   * two-metric cutover. Carried so the chart does not step to zero on the
   * cutover date, which reads as "the counter broke" rather than "the counter
   * changed".
   */
  legacyPlays: number;
};

export type DayStat = {
  /** YYYYMMDD in Manila time. */
  dayId: string;
  /** ISO date (YYYY-MM-DD), for axis labels. */
  date: string;
  unique: DayCounts;
  events: DayCounts;
  totals: MetricCounts;
  legacyPlays: number;
};

export const ZERO_COUNTS: MetricCounts = { view: 0, use: 0 };

/**
 * YYYYMMDD for an instant, in Manila.
 *
 * en-CA formats as YYYY-MM-DD, which is the one locale that gives a sortable
 * date without hand-assembling parts. Doing this with getFullYear()/getMonth()
 * would silently use the SERVER's timezone — which is UTC in production, so
 * everything after 4pm Manila would land on the wrong day.
 */
export function dayIdFor(date: Date = new Date(), timeZone: string = STATS_TIMEZONE): string {
  return isoDateFor(date, timeZone).replace(/-/g, "");
}

export function isoDateFor(date: Date = new Date(), timeZone: string = STATS_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * The last `days` day-ids ending today, oldest first.
 * Walks back in 24h steps from "now", so DST-free Manila needs nothing cleverer.
 */
export function recentDayIds(days: number, now: Date = new Date(), timeZone: string = STATS_TIMEZONE): string[] {
  const n = Math.max(1, Math.min(MAX_STATS_DAYS, Math.floor(days) || 1));
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(dayIdFor(new Date(now.getTime() - i * 86_400_000), timeZone));
  }
  return out;
}

/** YYYYMMDD -> YYYY-MM-DD. Returns the input unchanged if it is not a day id. */
export function dayIdToIso(dayId: string): string {
  return /^\d{8}$/.test(dayId)
    ? `${dayId.slice(0, 4)}-${dayId.slice(4, 6)}-${dayId.slice(6, 8)}`
    : dayId;
}

/** A whole number >= 0, whatever Firestore handed back. */
function count(value: unknown): number {
  return Math.max(0, Math.round(Number(value) || 0));
}

/**
 * Coerce one game's counts.
 *
 * Guards the shape change deliberately: before the cutover a game's counter was
 * a plain NUMBER, and `Number({view,use})` is NaN. Reading either shape without
 * checking gives zeros with no error anywhere — a chart that silently flatlines
 * is worse than one that throws.
 */
export function toMetricCounts(raw: unknown): MetricCounts {
  if (!raw || typeof raw !== "object") return { ...ZERO_COUNTS };
  const r = raw as Record<string, unknown>;
  return { view: count(r.view), use: count(r.use) };
}

export function toDayCounts(raw: unknown, gameIds: string[]): DayCounts {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: DayCounts = {};
  for (const g of gameIds) out[g] = toMetricCounts(source[g]);
  return out;
}

function sumCounts(counts: DayCounts, gameIds: string[]): MetricCounts {
  let view = 0;
  let use = 0;
  for (const g of gameIds) {
    view += counts[g]?.view || 0;
    use += counts[g]?.use || 0;
  }
  return { view, use };
}

/**
 * Build the full series the chart draws, including days nobody played.
 *
 * A missing document means zero, not a missing bar — a gap in the line reads as
 * "we lost the data" rather than "nobody played", which is the wrong story to
 * tell about a quiet Tuesday.
 */
export function buildSeries(
  dayIds: string[],
  found: Record<string, RawDay>,
  gameIds: string[]
): DayStat[] {
  return dayIds.map((dayId) => {
    const raw = found[dayId];
    const unique = toDayCounts(raw?.unique, gameIds);
    const events = toDayCounts(raw?.events, gameIds);
    return {
      dayId,
      date: dayIdToIso(dayId),
      unique,
      events,
      totals: sumCounts(unique, gameIds),
      legacyPlays: count(raw?.legacyPlays),
    };
  });
}

/** Unique counts per game across the whole window. */
export function totalsByGame(series: DayStat[], gameIds: string[]): DayCounts {
  const out: DayCounts = {};
  for (const g of gameIds) {
    out[g] = series.reduce(
      (acc, d) => ({ view: acc.view + (d.unique[g]?.view || 0), use: acc.use + (d.unique[g]?.use || 0) }),
      { ...ZERO_COUNTS }
    );
  }
  return out;
}

export function grandTotal(series: DayStat[]): MetricCounts {
  return series.reduce(
    (acc, d) => ({ view: acc.view + d.totals.view, use: acc.use + d.totals.use }),
    { ...ZERO_COUNTS }
  );
}

/** Busiest day in the window for one metric, for scaling the bars. Never 0. */
export function peakDay(series: DayStat[], metric: GameMetric = "view"): number {
  return Math.max(1, ...series.map((d) => Math.max(d.totals[metric], d.legacyPlays)));
}

/**
 * Uses per view, as a percentage.
 *
 * This is the number that actually answers "is this game working": views say
 * people found it, this says they did the thing it exists for.
 */
export function conversionRate(counts: MetricCounts): number {
  return counts.view > 0 ? Math.round((counts.use / counts.view) * 100) : 0;
}

export function totalLegacyPlays(series: DayStat[]): number {
  return series.reduce((sum, d) => sum + d.legacyPlays, 0);
}

/**
 * What to call a branch on screen. The day documents are keyed by store ID,
 * which means nothing to a person; the name is looked up separately and may be
 * missing (a deleted store, a store with no name), so fall back to the ID
 * rather than printing a blank.
 */
export function storeLabel(storeId: string, names?: Record<string, string> | null): string {
  const name = names?.[storeId];
  return typeof name === "string" && name.trim() ? name.trim() : storeId;
}
