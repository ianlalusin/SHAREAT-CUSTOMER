import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requirePlayer } from "@/lib/server/games/auth";
import { validateRecipeDraft } from "@/lib/games/recipe/validate";
import { publishRecipe } from "@/lib/server/games/recipe-store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const gate = await requirePlayer(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const parsed = validateRecipeDraft(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  const { player } = gate;
  const result = await publishRecipe(getAdminDb(), {
    draft: parsed.draft,
    authorKey: player.identityKey,
    storeId: player.storeId,
    storeName: player.storeName,
    sessionId: player.sessionId,
    // Never the session's booking name — that is the whole table's, not this
    // diner's, and it must not be published chain-wide. See the composer.
    fallbackDisplayName: `Guest • ${player.storeName}`,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status || 500 });
  }

  // Every recipe waits for review, so there is nothing to branch on — the
  // composer always shows the same "we will check it" message.
  return NextResponse.json({ ok: true, recipeId: result.recipeId, status: result.status });
}
