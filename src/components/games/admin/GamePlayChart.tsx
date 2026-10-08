"use client";

import type { DayStat } from "@/lib/games/stats";
import type { GameMetric } from "@/lib/games/metrics";
import { areaPath, smoothPath, toPoints } from "@/lib/games/chart";

/** One colour per game, stable across the chart, the legend and the totals. */
export const GAME_COLORS = ["#16a34a", "#ef4444", "#f59e0b", "#0284c7"];
export const colorFor = (i: number) => GAME_COLORS[i % GAME_COLORS.length];

/** Chart drawing space. The SVG stretches to the card; strokes stay 2px (non-scaling). */
const CHART_W = 600;
const CHART_H = 150;

export function GamePlayChart({
  games,
  series,
  metric,
  legacyPlays,
}: {
  games: { id: string; title: string }[];
  series: DayStat[];
  metric: GameMetric;
  legacyPlays: number;
}) {
  // One shared scale across games, so the lines can be compared with each
  // other. Legacy "plays" days are scaled with them, not on their own axis.
  const chartMax = Math.max(
    1,
    ...series.map((d) =>
      Math.max(
        ...games.map((g) => d.unique[g.id]?.[metric] || 0),
        d.totals[metric] === 0 ? d.legacyPlays : 0
      )
    )
  );

  return (
    <div className="mt-5 overflow-x-auto">
              <div className="relative min-w-[420px]" style={{ height: CHART_H }}>
                <svg
                  viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                  preserveAspectRatio="none"
                  className="absolute inset-0 h-full w-full overflow-visible"
                  role="img"
                  aria-label={`${metric === "view" ? "Views" : "Uses"} per day, by game`}
                >
                  <defs>
                    {games.map((g, i) => (
                      <linearGradient key={g.id} id={`area-${g.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={colorFor(i)} stopOpacity="0.35" />
                        <stop offset="100%" stopColor={colorFor(i)} stopOpacity="0.03" />
                      </linearGradient>
                    ))}
                  </defs>

                  {/* baseline + half-way guide */}
                  <line x1="0" x2={CHART_W} y1={CHART_H} y2={CHART_H} stroke="#e4e4e7" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  <line x1="0" x2={CHART_W} y1={CHART_H / 2} y2={CHART_H / 2} stroke="#f4f4f5" strokeWidth="1" vectorEffect="non-scaling-stroke" />

                  {/* Days before the two-metric cutover only ever had a single
                      "plays" figure. Drawn grey rather than dropped: a chart
                      that steps to zero on the cutover date reads as a broken
                      counter. */}
                  {legacyPlays > 0 &&
                    (() => {
                      const pts = toPoints(series.map((d) => (d.totals[metric] === 0 ? d.legacyPlays : 0)), CHART_W, CHART_H, chartMax);
                      return (
                        <>
                          <path d={areaPath(pts, CHART_H)} fill="#a1a1aa" fillOpacity="0.18" />
                          <path d={smoothPath(pts)} fill="none" stroke="#a1a1aa" strokeWidth="2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
                        </>
                      );
                    })()}

                  {games.map((g, i) => {
                    const pts = toPoints(series.map((d) => d.unique[g.id]?.[metric] || 0), CHART_W, CHART_H, chartMax);
                    return (
                      <g key={g.id}>
                        <path d={areaPath(pts, CHART_H)} fill={`url(#area-${g.id})`} />
                        <path
                          d={smoothPath(pts)}
                          fill="none"
                          stroke={colorFor(i)}
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      </g>
                    );
                  })}
                </svg>

                {/* Hover targets: one column per day, naming what each game did. */}
                <div className="absolute inset-0 flex">
                  {series.map((d) => (
                    <div
                      key={d.dayId}
                      className="h-full flex-1 hover:bg-zinc-900/5"
                      title={
                        `${d.date}\n` +
                        games.map((g) => `${g.title}: ${d.unique[g.id]?.[metric] || 0}`).join("\n") +
                        (d.totals[metric] === 0 && d.legacyPlays > 0 ? `\n${d.legacyPlays} plays (old metric)` : "")
                      }
                    />
                  ))}
                </div>
                <span className="pointer-events-none absolute left-0 top-0 text-[10px] font-bold tabular-nums text-muted-foreground">
                  {chartMax}
                </span>
              </div>
              {/* Only the ends are labelled: a tick under every column is
                  unreadable at 30 days and tells nobody anything new. */}
              <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
                <span>{series[0]?.date}</span>
                <span>{series[series.length - 1]?.date}</span>
              </div>
              {legacyPlays > 0 && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  The grey dashed line is the retired single-play count, kept so the chart does not appear to break.
                </p>
              )}
            </div>
  );
}
