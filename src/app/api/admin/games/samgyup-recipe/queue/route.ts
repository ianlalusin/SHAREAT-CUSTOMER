import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireRole, hasStoreAccess, MANAGER_ROLES } from "@/lib/server/admin/access";
import { listByStatus } from "@/lib/server/games/recipe-store";
import type { RecipeStatus } from "@/lib/games/recipe/types";

export const runtime = "nodejs";

/**
 * What the admin screen can ask for.
 *
 * "archived" is not a stored status — it is the shelf that holds everything
 * taken off the board, whether it was rejected at review or pulled after going
 * live. Reject and hide both write `hidden` now, but recipes rejected before
 * that change still carry `rejected`, so the shelf reads both. Two equality
 * queries, no orderBy, so still no composite index.
 */
const VIEWS: Record<string, RecipeStatus[]> = {
  pending: ["pending"],
  published: ["published"],
  archived: ["hidden", "rejected"],
};

export async function GET(req: Request) {
  const gate = await requireRole(req, MANAGER_ROLES);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const url = new URL(req.url);
  const view = String(url.searchParams.get("status") || "pending");
  const statuses = VIEWS[view];
  if (!statuses) {
    return NextResponse.json({ ok: false, error: "Unknown status." }, { status: 400 });
  }

  const db = getAdminDb();
  const groups = await Promise.all(statuses.map((s) => listByStatus(db, s)));
  const all = groups.flat();

  // Store scoping in memory — a `storeId` equality alongside the status one
  // would still be index-free, but the queue is small and filtering here keeps
  // the query shape identical for every caller.
  const recipes = all
    .filter((r) => hasStoreAccess(gate.caller, r.authorStoreId))
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .map((r) => ({
      id: r.id,
      title: r.title,
      displayName: r.displayName,
      storeName: r.authorStoreName,
      storeId: r.authorStoreId,
      steps: r.steps,
      hasFreeText: r.hasFreeText,
      status: r.status,
      counts: r.counts,
      rankScore: r.rankScore,
      featured: r.featured,
      createdAtMs: r.createdAtMs,
    }));

  return NextResponse.json({ ok: true, recipes });
}
