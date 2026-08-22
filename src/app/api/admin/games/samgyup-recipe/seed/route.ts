import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireStaff } from "@/lib/server/games/admin-auth";
import { seedHouseRecipes, removeHouseRecipes } from "@/lib/server/games/seed-house-recipes";

export const runtime = "nodejs";

/**
 * Put the house recipes on the board, or take them off again.
 *
 * Platform admins only. Seeding publishes content under the SharEat name
 * chain-wide, which is a different kind of act from approving one diner's
 * recipe at one branch — a store manager should not be able to do it.
 */
export async function POST(req: Request) {
  const gate = await requireStaff(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  if (!gate.caller.isPlatformAdmin) {
    return NextResponse.json({ ok: false, error: "Admins only." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const db = getAdminDb();

  if ((body as any)?.remove === true) {
    const { removed } = await removeHouseRecipes(db);
    return NextResponse.json({ ok: true, removed });
  }

  const { seeded } = await seedHouseRecipes(db);
  return NextResponse.json({ ok: true, seeded });
}
