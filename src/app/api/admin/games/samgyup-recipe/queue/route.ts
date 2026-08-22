import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireStaff, canModerateStore } from "@/lib/server/games/admin-auth";
import { listByStatus } from "@/lib/server/games/recipe-store";
import type { RecipeStatus } from "@/lib/games/recipe/types";

export const runtime = "nodejs";

const READABLE: RecipeStatus[] = ["pending", "published", "rejected", "hidden"];

export async function GET(req: Request) {
  const gate = await requireStaff(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const url = new URL(req.url);
  const status = String(url.searchParams.get("status") || "pending") as RecipeStatus;
  if (!READABLE.includes(status)) {
    return NextResponse.json({ ok: false, error: "Unknown status." }, { status: 400 });
  }

  const all = await listByStatus(getAdminDb(), status);
  // Store scoping in memory — a `storeId` equality alongside the status one
  // would still be index-free, but the queue is small and filtering here keeps
  // the query shape identical for every caller.
  const recipes = all
    .filter((r) => canModerateStore(gate.caller, r.authorStoreId))
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
      featured: r.featured,
      createdAtMs: r.createdAtMs,
    }));

  return NextResponse.json({ ok: true, recipes });
}
