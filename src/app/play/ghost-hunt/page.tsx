"use client";

import { PlayHeader } from "@/components/games/PlayHeader";
import { GhostHuntGame } from "@/components/games/ghost-hunt/GhostHuntGame";
import { getGame } from "@/lib/games/registry";

/**
 * The seasonal AR hunt (Spot a Ghost, Catch the Christmas & Share, …).
 *
 * Unlike Flip It this one awards real food, so the server decides every
 * appearance and every win; this page is only the camera window onto it.
 */
export default function GhostHuntPage() {
  return (
    <>
      <PlayHeader title={getGame("ghost-hunt")?.title ?? ""} subtitle="Catch the right one, share, win a treat." backHref="/play" />
      <main className="mx-auto max-w-3xl px-4 py-5 pb-16">
        <GhostHuntGame />
      </main>
    </>
  );
}
