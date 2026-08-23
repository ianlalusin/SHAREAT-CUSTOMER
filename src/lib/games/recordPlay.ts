/**
 * Tell the server a game was played. Fire-and-forget by design.
 *
 * A play counter must never block, slow, or break the game it measures, so
 * every failure here is swallowed: a lost count is a worse metric, a thrown
 * error is a broken game.
 *
 * What counts as "a play" is each game's own decision, and the definitions have
 * to be written down or the numbers cannot be compared:
 *   - flipit         : one round begun (the first FLIP of five)
 *   - samgyup-recipe : the board opened
 */
export function recordPlay(gameId: string): void {
  try {
    const body = JSON.stringify({ gameId });
    // keepalive so the count survives the player immediately navigating away
    void fetch("/api/customer/games/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never surface */
  }
}
