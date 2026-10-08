import { describe, it, expect } from "vitest";
import {
  dayIdFor, isoDateFor, recentDayIds, dayIdToIso, buildSeries, toMetricCounts,
  totalsByGame, grandTotal, peakDay, useRate, totalLegacyPlays, MAX_STATS_DAYS, storeLabel,
  type RawDay,
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

describe("toMetricCounts", () => {
  it("reads the two-metric shape", () => {
    expect(toMetricCounts({ view: 4, use: 1 })).toEqual({ view: 4, use: 1 });
  });

  /**
   * The counter used to be a plain number. `Number({view,use})` is NaN, and
   * `NaN || 0` is 0 — so reading either shape without checking gives a chart
   * that silently flatlines instead of one that throws.
   */
  it("refuses the retired number shape instead of coercing it", () => {
    expect(toMetricCounts(7 as any)).toEqual({ view: 0, use: 0 });
    expect(toMetricCounts(null)).toEqual({ view: 0, use: 0 });
    expect(toMetricCounts("12" as any)).toEqual({ view: 0, use: 0 });
  });

  it("never yields a negative or fractional count from bad data", () => {
    expect(toMetricCounts({ view: -5, use: 2.6 })).toEqual({ view: 0, use: 3 });
  });
});

/** A day document, as `readStats` would have coerced it. */
function day(unique: Record<string, { view?: number; use?: number }>, legacyPlays = 0): RawDay {
  const counts: any = {};
  for (const [g, c] of Object.entries(unique)) counts[g] = { view: c.view || 0, use: c.use || 0 };
  return { unique: counts, events: counts, legacyPlays };
}

describe("buildSeries", () => {
  const games = ["flipit", "samgyup-recipe"];

  it("fills a day with no document as zero, not as a gap", () => {
    const s = buildSeries(["20260821", "20260822"], { "20260822": day({ flipit: { view: 4, use: 1 } }) }, games);
    expect(s[0].unique).toEqual({ flipit: { view: 0, use: 0 }, "samgyup-recipe": { view: 0, use: 0 } });
    expect(s[0].totals).toEqual({ view: 0, use: 0 });
    expect(s[1].totals).toEqual({ view: 4, use: 1 });
  });

  it("keeps the requested day order", () => {
    const s = buildSeries(["20260821", "20260822", "20260823"], {}, games);
    expect(s.map((d) => d.dayId)).toEqual(["20260821", "20260822", "20260823"]);
  });

  it("ignores a game that is not asked for", () => {
    const s = buildSeries(["20260823"], { "20260823": day({ flipit: { view: 2 }, retired: { view: 99 } }) }, games);
    expect(s[0].unique).not.toHaveProperty("retired");
    expect(s[0].totals.view).toBe(2);
  });

  it("carries the retired plays figure so the chart does not step to zero", () => {
    const s = buildSeries(["20260823"], { "20260823": day({}, 12) }, games);
    expect(s[0].totals).toEqual({ view: 0, use: 0 });
    expect(s[0].legacyPlays).toBe(12);
  });
});

describe("summaries", () => {
  const games = ["flipit", "samgyup-recipe"];
  const series = buildSeries(
    ["20260821", "20260822", "20260823"],
    {
      "20260821": day({ flipit: { view: 3, use: 1 } }),
      "20260822": day({ flipit: { view: 5, use: 2 }, "samgyup-recipe": { view: 2, use: 2 } }),
      "20260823": day({ "samgyup-recipe": { view: 1, use: 0 } }, 4),
    },
    games
  );

  it("totals each game across the window", () => {
    expect(totalsByGame(series, games)).toEqual({
      flipit: { view: 8, use: 3 },
      "samgyup-recipe": { view: 3, use: 2 },
    });
  });

  it("totals the window", () => {
    expect(grandTotal(series)).toEqual({ view: 11, use: 5 });
  });

  it("finds the busiest day for the metric asked for", () => {
    expect(peakDay(series, "view")).toBe(7);
    expect(peakDay(series, "use")).toBe(4);
  });

  /** A day with only retired data still has to scale a bar. */
  it("lets a legacy-only day set the peak", () => {
    expect(peakDay(buildSeries(["20260823"], { "20260823": day({}, 9) }, games), "view")).toBe(9);
  });

  /** Bars divide by this, so it must never be zero. */
  it("never returns a zero peak for an empty window", () => {
    expect(peakDay(buildSeries(["20260823"], {}, games), "view")).toBe(1);
    expect(peakDay([], "use")).toBe(1);
  });

  it("sums the retired plays across the window", () => {
    expect(totalLegacyPlays(series)).toBe(4);
  });
});

describe("useRate", () => {
  it("is the share of viewers who went on to use it", () => {
    expect(useRate({ view: 10, use: 3 })).toBe(30);
  });

  /** Nobody viewed it, so nobody failed to use it — not a division by zero. */
  it("is zero when nobody has viewed it", () => {
    expect(useRate({ view: 0, use: 0 })).toBe(0);
  });
});

describe("storeLabel", () => {
  it("uses the store name when there is one", () => {
    expect(storeLabel("s-123", { "s-123": "SharEat Hub" })).toBe("SharEat Hub");
    expect(storeLabel("s-123", { "s-123": "  SharEat Hub " })).toBe("SharEat Hub");
  });
  it("falls back to the id when the name is missing, blank or the map is absent", () => {
    expect(storeLabel("s-123", {})).toBe("s-123");
    expect(storeLabel("s-123", { "s-123": "  " })).toBe("s-123");
    expect(storeLabel("s-123", undefined)).toBe("s-123");
    expect(storeLabel("s-123", null)).toBe("s-123");
  });
});
