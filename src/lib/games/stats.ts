/**
 * Play counts, by game, by day.
 *
 * The whole design turns on one choice: **the day is the document id**. Day ids
 * are derivable from a date, so the admin screen fetches exactly the documents
 * it wants by name — no query, therefore no composite index, therefore nothing
 * that has to be deployed from the POS repo. Thirty days is thirty `getAll`
 * reads and nothing else.
 */

/** The chain trades in the Philippines; a "day" is a Manila day, not a UTC one. */
export const STATS_TIMEZONE = "Asia/Manila";

/** Longest window the admin screen will ask for. Keeps the read bounded. */
export const MAX_STATS_DAYS = 60;

export type DayCounts = Record<string, number>;

export type DayStat = {
  /** YYYYMMDD in Manila time. */
  dayId: string;
  /** ISO date (YYYY-MM-DD), for axis labels. */
  date: string;
  /** gameId -> plays that day. */
  counts: DayCounts;
  total: number;
};

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

/**
 * Build the full series the chart draws, including days nobody played.
 *
 * A missing document means zero plays, not a missing bar — a gap in the line
 * reads as "we lost the data" rather than "nobody played", which is the wrong
 * story to tell about a quiet Tuesday.
 */
export function buildSeries(
  dayIds: string[],
  found: Record<string, DayCounts>,
  gameIds: string[]
): DayStat[] {
  return dayIds.map((dayId) => {
    const raw = found[dayId] || {};
    const counts: DayCounts = {};
    let total = 0;
    for (const g of gameIds) {
      const n = Math.max(0, Math.round(Number(raw[g]) || 0));
      counts[g] = n;
      total += n;
    }
    return { dayId, date: dayIdToIso(dayId), counts, total };
  });
}

/** Plays per game across the whole window. */
export function totalsByGame(series: DayStat[], gameIds: string[]): DayCounts {
  const out: DayCounts = {};
  for (const g of gameIds) out[g] = series.reduce((sum, d) => sum + (d.counts[g] || 0), 0);
  return out;
}

export function grandTotal(series: DayStat[]): number {
  return series.reduce((sum, d) => sum + d.total, 0);
}

/** Busiest day in the window, for scaling the bars. Never returns 0. */
export function peakDay(series: DayStat[]): number {
  return Math.max(1, ...series.map((d) => d.total));
}
