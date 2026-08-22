import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireStaff, canModerateStore } from "@/lib/server/games/admin-auth";
import { getRecipe, moderateRecipe, type ModerationAction } from "@/lib/server/games/recipe-store";

export const runtime = "nodejs";

const ACTIONS: ModerationAction[] = ["approve", "reject", "hide", "feature", "unfeature"];

export async function POST(req: Request) {
  const gate = await requireStaff(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const recipeId = String((body as any)?.recipeId || "");
  const action = String((body as any)?.action || "") as ModerationAction;

  if (!recipeId || !ACTIONS.includes(action)) {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  const db = getAdminDb();
  const recipe = await getRecipe(db, recipeId);
  if (!recipe) return NextResponse.json({ ok: false, error: "Recipe not found." }, { status: 404 });

  // Resolved from the RECIPE, never the request body — otherwise a manager at
  // one branch could moderate another branch's content by passing its id.
  if (!canModerateStore(gate.caller, recipe.authorStoreId)) {
    return NextResponse.json({ ok: false, error: "Not allowed for this store." }, { status: 403 });
  }

  const result = await moderateRecipe(db, recipeId, action, gate.caller.uid);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status || 500 });
  }
  return NextResponse.json({ ok: true, status: result.status });
}
