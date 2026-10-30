"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { Loader2, BarChart3 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { conversionRate, storeLabel, type DayStat, type MetricCounts } from "@/lib/games/stats";
import { GamePlayChart, colorFor } from "./GamePlayChart";
import type { GameMetric, GameMetricDefinitions } from "@/lib/games/metrics";

type GameRow = { id: string; title: string; metrics: GameMetricDefinitions };

type Payload = {
  days: number;
  games: GameRow[];
  series: DayStat[];
  totals: Record<string, MetricCounts>;
  grandTotal: MetricCounts;
  peak: Record<GameMetric, number>;
  legacyPlays: number;
  byStore: Record<string, Record<string, MetricCounts>>;
  /** storeId -> display name, for the branches in `byStore`. */
  storeNames?: Record<string, string>;
};


const WINDOWS = [7, 14, 30];
const METRICS: { key: GameMetric; label: string }[] = [
  { key: "view", label: "Views" },
  { key: "use", label: "Uses" },
];

const NO_COUNTS: MetricCounts = { view: 0, use: 0 };

export function GamePlayStats() {
  const [days, setDays] = useState(14);
  const [metric, setMetric] = useState<GameMetric>("view");
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (window: number, user = getAuth().currentUser) => {
    setData(null);
    setError(null);
    try {
      if (!user) throw new Error("Not signed in.");
      const res = await fetch(`/api/admin/games/stats?days=${window}`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load game stats.");
      setData(json);
    } catch (e: any) {
      setError(e?.message || "Could not load game stats.");
    }
  }, []);

  /* Wait for Firebase to resolve the session before asking.
     Reading currentUser straight after mount returns null on any hard refresh —
     the token has not been restored yet — and the card showed "Not signed in"
     to an admin who plainly was. The rest of this page already listens for the
     same event. */
  useEffect(() => {
    const unsub = onAuthStateChanged(getAuth(), (user) => {
      if (user) load(days, user);
      else setError("Not signed in.");
    });
    return () => unsub();
  }, [days, load]);

  const stores = data
    ? Object.entries(data.byStore).sort((a, b) => sum(b[1], metric) - sum(a[1], metric))
    : [];
  const nothingYet =
    data && data.grandTotal.view === 0 && data.grandTotal.use === 0 && data.legacyPlays === 0;

  return (
    <Card className="rounded-[2rem] border-none bg-white shadow-xl">
      <CardHeader className="space-y-3">
        <div className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl font-black">Views and uses</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              One view and one use per phone, per session — so these count people, not taps.
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            {WINDOWS.map((w) => (
              <Button
                key={w}
                size="sm"
                variant={w === days ? "default" : "outline"}
                className="rounded-xl px-2.5"
                onClick={() => setDays(w)}
              >
                {w}d
              </Button>
            ))}
          </div>
        </div>

        <div className="flex gap-1">
          {METRICS.map((m) => (
            <Button
              key={m.key}
              size="sm"
              variant={m.key === metric ? "default" : "outline"}
              className="rounded-xl px-3"
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </Button>
          ))}
        </div>

        {/* A number nobody can define is a number nobody can act on, so each
            game says what it counted, right beside the chart. */}
        {data && (
          <ul className="space-y-0.5 text-[11px] text-muted-foreground">
            {data.games.map((g) => (
              <li key={g.id}>
                <span className="font-semibold">{g.title}</span> — {g.metrics[metric].label.toLowerCase()}
              </li>
            ))}
          </ul>
        )}
      </CardHeader>

      <CardContent>
        {error ? (
          <p className="py-8 text-center text-sm text-destructive">{error}</p>
        ) : !data ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : nothingYet ? (
          <div className="py-10 text-center">
            <BarChart3 className="mx-auto h-9 w-9 text-zinc-300" />
            <p className="mt-3 font-bold">Nothing recorded yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Counting starts from when a game is switched on.
            </p>
          </div>
        ) : (
          <>
            {/* ---- totals ---- */}
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <div>
                <p className="text-3xl font-black tabular-nums leading-none">{data.grandTotal[metric]}</p>
                <p className="text-xs text-muted-foreground">
                  {metric === "view" ? "views" : "uses"} in {data.days} days
                </p>
              </div>
              <div>
                <p className="text-3xl font-black tabular-nums leading-none">{conversionRate(data.grandTotal)}%</p>
                {/* Views say people found it. This says they did the thing it
                    exists for, which is the only one worth acting on. */}
                <p className="text-xs text-muted-foreground">went on to use it</p>
              </div>
              {data.games.map((g, i) => (
                <div key={g.id} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorFor(i) }} />
                  <span className="text-sm">
                    <span className="font-bold tabular-nums">{data.totals[g.id]?.[metric] ?? 0}</span>{" "}
                    <span className="text-muted-foreground">
                      {g.title} · {conversionRate(data.totals[g.id] || NO_COUNTS)}%
                    </span>
                  </span>
                </div>
              ))}
            </div>

            {/* ---- the chart: one smooth line per game, shaded underneath ---- */}
            <GamePlayChart games={data.games} series={data.series} metric={metric} legacyPlays={data.legacyPlays} />

            {/* ---- by branch ---- */}
            {stores.length > 0 && (
              <div className="mt-6 border-t pt-4">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  By branch
                </p>
                <div className="space-y-1.5">
                  {stores.map(([storeId, counts]) => (
                    <div key={storeId} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{storeLabel(storeId, data.storeNames)}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {data.games
                          .filter((g) => (counts[g.id]?.[metric] || 0) > 0)
                          .map((g) => `${g.title.split(" ")[0]} ${counts[g.id][metric]}`)
                          .join("  ·  ")}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Flip It needs no table, so anyone playing away from the
                    restaurant has no branch to attribute. Say so rather than
                    letting the branch numbers look like they should add up. */}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Plays away from a table have no branch, so these can total less than the figure above.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function sum(counts: Record<string, MetricCounts>, metric: GameMetric): number {
  return Object.values(counts).reduce((a, b) => a + (b?.[metric] || 0), 0);
}
