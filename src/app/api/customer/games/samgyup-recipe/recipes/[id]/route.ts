import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolveGameCaller } from "@/lib/server/games/auth";
import { loadAndValidateSessionAccess } from "@/lib/server/customer-session-access";
import { getRecipe, hasVoted } from "@/lib/server/games/recipe-store";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const db = getAdminDb();
  const recipe = await getRecipe(db, id);
  if (!recipe || recipe.status !== "published") {
    return NextResponse.json({ ok: false, error: "That recipe is not available." }, { status: 404 });
  }

  const caller = await resolveGameCaller(req);

  /**
   * A token outlives the meal.
   *
   * Judging by the token's claims alone offered the verdict buttons to a diner
   * whose table session had since closed: they tapped "I tried this", picked a
   * verdict, and got "Customer access expired" back from the vote route, which
   * does revalidate. The rating gate exists so a Yummy means somebody was
   * actually eating here, so this answer has to come from the same check the
   * vote makes — one session read, and only when a token was sent at all.
   */
  let player = caller.tier === "player" ? caller : null;
  if (player) {
    try {
      await loadAndValidateSessionAccess(db, player.storeId, player.sessionId);
    } catch {
      player = null;
    }
  }

  // Why the verdict buttons are unavailable, resolved server-side so the UI
  // never has to guess — and so a disabled button can say something true.
  let alreadyVoted = false;
  let isOwn = false;
  let sameTable = false;
  if (player) {
    isOwn = recipe.authorKey === player.identityKey;
    sameTable = !!recipe.authorSessionId && recipe.authorSessionId === player.sessionId;
    alreadyVoted = isOwn ? false : await hasVoted(db, id, player.identityKey);
  }

  return NextResponse.json({
    ok: true,
    recipe: {
      id: recipe.id,
      title: recipe.title,
      displayName: recipe.displayName,
      storeName: recipe.authorStoreName,
      steps: recipe.steps,
      counts: recipe.counts,
      rankScore: recipe.rankScore,
      featured: recipe.featured,
      publishedAtMs: recipe.publishedAtMs,
    },
    canVote: !!player && !isOwn && !sameTable && !alreadyVoted,
    reason: !player ? "no_session" : isOwn ? "own" : sameTable ? "same_table" : alreadyVoted ? "voted" : null,
  });
}
