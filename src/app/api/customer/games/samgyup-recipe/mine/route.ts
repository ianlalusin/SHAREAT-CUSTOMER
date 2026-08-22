import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requirePlayer } from "@/lib/server/games/auth";

export const runtime = "nodejs";

/**
 * The author's own recipes, whatever their status.
 *
 * Equality filter with NO orderBy — sorted in memory. Adding `.orderBy()` here
 * turns this into a composite-index query, and indexes for this project can
 * only be deployed from the POS repo. An author has a handful of recipes; the
 * sort is free.
 */
export async function GET(req: Request) {
  const gate = await requirePlayer(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const db = getAdminDb();
  const snap = await db
    .collection("gameRecipes")
    .where("authorKey", "==", gate.player.identityKey)
    .limit(50)
    .get();

  const recipes = snap.docs
    .map((d) => {
      const x = d.data() as any;
      return {
        id: d.id,
        title: String(x.title || ""),
        status: String(x.status || "pending"),
        counts: x.counts || { yuck: 0, good: 0, yummy: 0, total: 0 },
        stepCount: Array.isArray(x.steps) ? x.steps.length : 0,
        createdAtMs: Number(x.createdAtMs || 0),
      };
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  return NextResponse.json({ ok: true, recipes });
}
