"use client";

import { PlayHeader } from "@/components/games/PlayHeader";
import { FlipItGame } from "@/components/games/flipit/FlipItGame";

/**
 * Flip It.
 *
 * Unlike the recipe game this needs no session and writes nothing: there is no
 * content to moderate and no score to defend, so a diner can play it at the
 * table or at home. That also means no anti-farm rule is needed — there is
 * nothing to farm until it awards something.
 */
export default function FlipItPage() {
  return (
    <>
      <PlayHeader title="Flip It" subtitle="Press when the heat hits green." backHref="/play" />
      <main className="mx-auto max-w-3xl px-4 py-5 pb-16">
        <FlipItGame />
        <p className="mx-auto mt-6 max-w-md text-center text-xs text-muted-foreground">
          Five strips, one press each. Flip too early and it&apos;s raw, too late and it&apos;s sunog.
        </p>
      </main>
    </>
  );
}
