"use client";

import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { Loader2, Gamepad2 } from "lucide-react";

import { PlayHeader } from "@/components/games/PlayHeader";
import { GameTile, type GameTileData } from "@/components/games/GameTile";

/**
 * The games shelf.
 *
 * Readable without a session on purpose — a diner can browse what other people
 * made after they have gone home, which is most of the reason to have content
 * worth coming back to. Playing still needs a table; the game screens say so.
 */
export default function PlayHubPage() {
  const [games, setGames] = useState<GameTileData[] | null>(null);
  const [canPlay, setCanPlay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Wait one auth tick: a signed-in diner's token decides whether their
    // store's switched-off games are filtered out. Firing before it resolves
    // would show the anonymous shelf and then flicker.
    const unsub = onAuthStateChanged(getAuth(), async (user) => {
      try {
        const headers: Record<string, string> = {};
        if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;

        const res = await fetch("/api/customer/games", { headers, cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load games.");
        setGames(json.games || []);
        setCanPlay(!!json.canPlay);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not load games.");
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return (
    <>
      <PlayHeader title="Fun & Games" subtitle="Something to do between servings" backHref="/dashboard" />

      <main className="max-w-3xl mx-auto px-4 py-6">
        {error ? (
          <p className="py-16 text-center text-sm text-destructive">{error}</p>
        ) : games === null ? (
          <div className="py-20 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : games.length === 0 ? (
          <div className="py-16 text-center">
            <Gamepad2 className="h-10 w-10 mx-auto text-zinc-300" />
            <p className="mt-3 font-bold">No games running right now</p>
            <p className="mt-1 text-sm text-muted-foreground">Check back on your next visit.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {!canPlay && (
              <p className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
                You are browsing. Join your table to publish and rate.
              </p>
            )}
            {games.map((g) => (
              <GameTile key={g.id} game={g} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
