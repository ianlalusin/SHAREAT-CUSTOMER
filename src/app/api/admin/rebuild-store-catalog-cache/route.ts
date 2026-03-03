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

    const items = qSnap.docs
      .map((d) => {
        const x = d.data() as any;

        // Global archive = removed everywhere (never show again in any store cache)
        if (x.isArchived === true) return null;

        const prevIt = prevById.get(d.id) || {};
        const globalDisabled = (x.isAvailable === false);
        const globalAvailable = !globalDisabled;

        // Store can only further hide items; cannot re-enable if global is disabled.
        const storeAvailable = globalAvailable && (prevIt.isAvailable !== false);

        return {
          id: d.id,
          name: String(x.name ?? ""),
          category: String(x.category ?? ""),
          imageUrl: x.imageUrl ?? null,

          // store-specific fields
          price: Number(prevIt.price ?? 0),
          isAvailable: storeAvailable,

          // metadata for UI/debug
          globalIsAvailable: globalAvailable,
          globalUpdatedAtMs: x.updatedAt?.toMillis ? Number(x.updatedAt.toMillis()) : null,
          storeUpdatedAtMs: prevIt.storeUpdatedAtMs ?? null,
        };
      })
      .filter(Boolean) as any[];

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
      updatedAtMs: nowMs,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
