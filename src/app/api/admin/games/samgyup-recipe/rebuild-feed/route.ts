import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/admin/access";
import { rebuildFeed } from "@/lib/server/games/recipe-store";

export const runtime = "nodejs";

/**
 * Force a projection rebuild regardless of TTL. The manual repair valve.
 *
 * Admin-only: the board is one chain-wide document, so this is not an action
 * scoped to any single branch.
 */
export async function POST(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const feed = await rebuildFeed(getAdminDb());
  return NextResponse.json({
    ok: true,
    counts: { top: feed.top.length, fresh: feed.fresh.length, featured: feed.featured.length },
    updatedAtMs: feed.updatedAtMs,
  });
}
