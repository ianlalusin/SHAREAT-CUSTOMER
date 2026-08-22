import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requirePlayer } from "@/lib/server/games/auth";
import { voteOnRecipe } from "@/lib/server/games/recipe-store";
import type { Verdict } from "@/lib/games/recipe/types";

export const runtime = "nodejs";

const VERDICTS: Verdict[] = ["yuck", "good", "yummy"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const gate = await requirePlayer(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const verdict = String((body as any)?.verdict || "") as Verdict;
  if (!VERDICTS.includes(verdict)) {
    return NextResponse.json({ ok: false, error: "Pick Yuck, Good or Yummy." }, { status: 400 });
  }

  const result = await voteOnRecipe(getAdminDb(), {
    recipeId: id,
    voterKey: gate.player.identityKey,
    verdict,
    storeId: gate.player.storeId,
    sessionId: gate.player.sessionId,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status || 500 });
  }
  return NextResponse.json({ ok: true, counts: result.counts });
}
