import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  try {
    const authz = req.headers.get("authorization") || "";
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return bad("Missing Authorization Bearer token.", 401);

    const idToken = m[1];
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);

    // Disallow customer tokens
    if ((decoded as any).customer === true) return bad("Not allowed.", 403);

    const db = getAdminDb();

    // Basic staff check (active staff or platform admin)
    const uid = decoded.uid;
    const staffSnap = await db.doc(`staff/${uid}`).get();
    const staff = staffSnap.exists ? (staffSnap.data() as any) : null;

    const isPlatformAdmin = decoded.platformAdmin === true;
    const isActiveStaff = staff && staff.status === "active";
    if (!isPlatformAdmin && !isActiveStaff) return bad("Not allowed.", 403);

    const url = new URL(req.url);
    const storeId = String(url.searchParams.get("storeId") || "");
    if (!storeId) return bad("Missing storeId.", 400);

    // 1) global catalog "source of truth" (NO price here)
    const qSnap = await db.collection("catalogItems").orderBy("name", "asc").get();

    // 2) keep existing per-store overrides (price + store availability) if present
    const storeRef = db.doc(`stores/${storeId}/catalogCache/main`);
    const storeSnap = await storeRef.get();
    const prev = storeSnap.exists ? (storeSnap.data() as any) : null;
    const prevItems: any[] = Array.isArray(prev?.items) ? prev.items : [];

    const prevById = new Map<string, any>();
    for (const it of prevItems) {
      const id = String(it?.id || "");
      if (id) prevById.set(id, it);
    }

    // Index the global docs once so we can also refresh link metadata on items
    // already cached for this store (links are global, not store-overridden).
    const globalById = new Map<string, any>();
    for (const d of qSnap.docs) globalById.set(d.id, d.data() as any);

    // Per-store POS inventory keyed by productId. Used to resolve the live
    // sellingPrice for any linked customer item. When linked, POS price wins.
    const invSnap = await db.collection(`stores/${storeId}/inventory`).get();
    const invByProductId = new Map<string, any>();
    for (const d of invSnap.docs) {
      const x = d.data() as any;
      if (x?.isActive === false) continue;
      if (x?.isArchived === true) continue;
      const pid = String(x?.productId || "");
      if (pid) invByProductId.set(pid, x);
    }

    /**
     * Returns the price to write into the per-store cache for a given item.
     * - If linked to a POS product AND that product's inventory has a valid
     *   positive sellingPrice in this store, POS wins (overwrites customer price).
     * - Otherwise fall back to the customer-set price.
     */
    function resolvePrice(linkedPosProductId: any, fallback: number): number {
      if (!linkedPosProductId) return fallback;
      const inv = invByProductId.get(String(linkedPosProductId));
      if (!inv) return fallback;
      const sp = Number(inv.sellingPrice ?? 0);
      if (!Number.isFinite(sp) || sp <= 0) return fallback;
      return sp;
    }

    const refreshedPrevItems = prevItems.map((it: any) => {
      const g = globalById.get(String(it?.id || ""));
      if (!g) return it;
      const linkedId = g.linkedPosProductId ?? null;
      const fallbackPrice = Number(it?.price ?? g.price ?? 0);
      return {
        ...it,
        linkedPosProductId: linkedId,
        linkedPosProductName: g.linkedPosProductName ?? null,
        price: resolvePrice(linkedId, fallbackPrice),
      };
    });

    const missingItems = qSnap.docs
      .map((d) => {
        const x = d.data() as any;

        if (x.isArchived === true) return null;
        if (prevById.has(d.id)) return null;

        const globalDisabled = (x.isAvailable === false);
        const globalAvailable = !globalDisabled;
        const linkedId = x.linkedPosProductId ?? null;
        const fallbackPrice = Number(x.price ?? 0);

        return {
          id: d.id,
          name: String(x.name ?? ""),
          category: String(x.category ?? ""),
          imageUrl: x.imageUrl ?? null,
          price: resolvePrice(linkedId, fallbackPrice),
          isAvailable: globalAvailable,
          globalIsAvailable: globalAvailable,
          globalUpdatedAtMs: x.updatedAt?.toMillis ? Number(x.updatedAt.toMillis()) : null,
          storeUpdatedAtMs: null,
          linkedPosProductId: linkedId,
          linkedPosProductName: x.linkedPosProductName ?? null,
        };
      })
      .filter(Boolean) as any[];

    const items = [...refreshedPrevItems, ...missingItems].sort((a: any, b: any) =>
      String(a?.name || "").localeCompare(String(b?.name || ""))
    );

    const nowMs = Date.now();

    await storeRef.set(
      {
        updatedAtMs: nowMs,
        itemCount: items.filter((x: any) => x.isAvailable === true).length,
        items,
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      storeId,
      itemCount: items.filter((x: any) => x.isAvailable === true).length,
      importedCount: missingItems.length,
      updatedAtMs: nowMs,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
