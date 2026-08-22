import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolveGameCaller } from "@/lib/server/games/auth";
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
  const isPlayer = caller.tier === "player";

  // Why the verdict buttons are unavailable, resolved server-side so the UI
  // never has to guess — and so a disabled button can say something true.
  let alreadyVoted = false;
  let isOwn = false;
  let sameTable = false;
  if (isPlayer) {
    isOwn = recipe.authorKey === caller.identityKey;
    sameTable = !!recipe.authorSessionId && recipe.authorSessionId === caller.sessionId;
    alreadyVoted = isOwn ? false : await hasVoted(db, id, caller.identityKey);
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
    canVote: isPlayer && !isOwn && !sameTable && !alreadyVoted,
    reason: !isPlayer ? "no_session" : isOwn ? "own" : sameTable ? "same_table" : alreadyVoted ? "voted" : null,
  });
}
