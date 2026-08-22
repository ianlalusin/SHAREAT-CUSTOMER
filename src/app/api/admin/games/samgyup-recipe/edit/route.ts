import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireStaff, canModerateStore } from "@/lib/server/games/admin-auth";
import { getRecipe, editRecipe } from "@/lib/server/games/recipe-store";
import { validateRecipeDraft } from "@/lib/games/recipe/validate";

export const runtime = "nodejs";

/**
 * Edit a recipe's content. Staff only — an author cannot rewrite their own.
 *
 * The same validation a diner's submission goes through still applies: the
 * length caps and the word guard are about what ends up on a public board, not
 * about who typed it, and an unbounded step would break the diner's layout
 * whoever wrote it.
 */
export async function POST(req: Request) {
  const gate = await requireStaff(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const recipeId = String((body as any)?.recipeId || "");
  if (!recipeId) return NextResponse.json({ ok: false, error: "Missing recipeId." }, { status: 400 });

  const db = getAdminDb();
  const recipe = await getRecipe(db, recipeId);
  if (!recipe) return NextResponse.json({ ok: false, error: "Recipe not found." }, { status: 404 });

  // Scope resolved from the RECIPE, never the body — same as moderation.
  if (!canModerateStore(gate.caller, recipe.authorStoreId)) {
    return NextResponse.json({ ok: false, error: "Not allowed for this store." }, { status: 403 });
  }

  const parsed = validateRecipeDraft({
    title: (body as any)?.title,
    // An admin blanking the name must not silently re-credit the recipe, so the
    // existing one is the fallback rather than the "Guest" default.
    displayName: (body as any)?.displayName ?? recipe.displayName,
    steps: (body as any)?.steps,
  });
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  const result = await editRecipe(db, recipeId, parsed.draft, gate.caller.uid);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status || 500 });
  }
  return NextResponse.json({ ok: true, resetRatings: result.resetRatings, reason: result.reason });
}
