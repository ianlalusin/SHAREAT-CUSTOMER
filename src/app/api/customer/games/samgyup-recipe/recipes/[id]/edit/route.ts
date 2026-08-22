import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requirePlayer } from "@/lib/server/games/auth";
import { validateRecipeDraft } from "@/lib/games/recipe/validate";
import { authorEditRecipe } from "@/lib/server/games/recipe-store";

export const runtime = "nodejs";

/** An author fixing their own recipe while it waits for review. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const gate = await requirePlayer(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const parsed = validateRecipeDraft(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  const result = await authorEditRecipe(getAdminDb(), id, gate.player.identityKey, parsed.draft);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status || 500 });
  }
  return NextResponse.json({ ok: true });
}
