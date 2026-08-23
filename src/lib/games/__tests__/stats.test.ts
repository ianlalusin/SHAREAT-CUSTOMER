import { describe, it, expect } from "vitest";
import {
  dayIdFor, isoDateFor, recentDayIds, dayIdToIso, buildSeries,
  totalsByGame, grandTotal, peakDay, MAX_STATS_DAYS,
} from "@/lib/games/stats";

describe("dayIdFor", () => {
  it("formats a Manila day as YYYYMMDD", () => {
    expect(dayIdFor(new Date("2026-08-23T04:00:00Z"))).toBe("20260823");
  });

  /**
   * The bug this guards. Manila is UTC+8, so 17:00 UTC is already tomorrow
   * there. Using the server's own date would put every evening's plays on the
   * previous day — and production runs in UTC.
   */
  it("rolls the day at Manila midnight, not UTC midnight", () => {
    expect(dayIdFor(new Date("2026-08-23T15:59:00Z"))).toBe("20260823"); // 23:59 Manila
    expect(dayIdFor(new Date("2026-08-23T16:00:00Z"))).toBe("20260824"); // 00:00 Manila
  });

  it("disagrees with a UTC reading of the same instant", () => {
    const evening = new Date("2026-08-23T16:30:00Z");
    expect(dayIdFor(evening)).toBe("20260824");
    expect(dayIdFor(evening, "UTC")).toBe("20260823");
  });

  it("pads single-digit months and days", () => {
    expect(dayIdFor(new Date("2026-01-05T04:00:00Z"))).toBe("20260105");
  });
});

describe("isoDateFor", () => {
  it("gives a sortable ISO date", () => {
    expect(isoDateFor(new Date("2026-08-23T04:00:00Z"))).toBe("2026-08-23");
  });
});

describe("recentDayIds", () => {
  const now = new Date("2026-08-23T04:00:00Z");

  it("ends on today and runs oldest first", () => {
    expect(recentDayIds(3, now)).toEqual(["20260821", "20260822", "20260823"]);
  });

  it("returns exactly the number of days asked for", () => {
    expect(recentDayIds(14, now)).toHaveLength(14);
    expect(recentDayIds(1, now)).toEqual(["20260823"]);
  });

  it("crosses a month boundary correctly", () => {
    expect(recentDayIds(3, new Date("2026-09-01T04:00:00Z"))).toEqual(["20260830", "20260831", "20260901"]);
  });

  it("clamps a silly window instead of reading the whole collection", () => {
    expect(recentDayIds(9999, now)).toHaveLength(MAX_STATS_DAYS);
    expect(recentDayIds(0, now)).toHaveLength(1);
    expect(recentDayIds(NaN, now)).toHaveLength(1);
  });

  it("produces no duplicates", () => {
    const ids = recentDayIds(30, now);
    expect(new Set(ids).size).toBe(30);
  });
});

describe("dayIdToIso", () => {
  it("converts and leaves anything else alone", () => {
    expect(dayIdToIso("20260823")).toBe("2026-08-23");
    expect(dayIdToIso("nonsense")).toBe("nonsense");
  });
});

describe("buildSeries", () => {
  const games = ["flipit", "samgyup-recipe"];

  it("fills a day with no document as zero, not as a gap", () => {
    const s = buildSeries(["20260821", "20260822"], { "20260822": { flipit: 4 } }, games);
    expect(s[0].counts).toEqual({ flipit: 0, "samgyup-recipe": 0 });
    expect(s[0].total).toBe(0);
    expect(s[1].total).toBe(4);
  });

  it("keeps the requested day order", () => {
    const s = buildSeries(["20260821", "20260822", "20260823"], {}, games);
    expect(s.map((d) => d.dayId)).toEqual(["20260821", "20260822", "20260823"]);
  });

  it("ignores a game that is not asked for", () => {
    const s = buildSeries(["20260823"], { "20260823": { flipit: 2, retired: 99 } }, games);
    expect(s[0].counts).not.toHaveProperty("retired");
    expect(s[0].total).toBe(2);
  });

  it("never yields a negative or fractional count from bad data", () => {
    const s = buildSeries(["20260823"], { "20260823": { flipit: -5, "samgyup-recipe": 2.6 } as any }, games);
    expect(s[0].counts.flipit).toBe(0);
    expect(s[0].counts["samgyup-recipe"]).toBe(3);
  });
});

describe("summaries", () => {
  const games = ["flipit", "samgyup-recipe"];
  const series = buildSeries(
    ["20260821", "20260822", "20260823"],
    { "20260821": { flipit: 3 }, "20260822": { flipit: 5, "samgyup-recipe": 2 }, "20260823": { "samgyup-recipe": 1 } },
    games
  );

  it("totals each game across the window", () => {
    expect(totalsByGame(series, games)).toEqual({ flipit: 8, "samgyup-recipe": 3 });
  });

  it("totals the window", () => {
    expect(grandTotal(series)).toBe(11);
  });

  it("finds the busiest day", () => {
    expect(peakDay(series)).toBe(7);
  });

  /** Bars divide by this, so it must never be zero. */
  it("never returns a zero peak for an empty window", () => {
    expect(peakDay(buildSeries(["20260823"], {}, games))).toBe(1);
    expect(peakDay([])).toBe(1);
  });
});
