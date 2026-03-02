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

    const qSnap = await db.collection("catalogItems").orderBy("name", "asc").get();

    const items = qSnap.docs.map((d) => {
      const x = d.data() as any;
      return {
        id: d.id,
        name: String(x.name ?? ""),
        category: String(x.category ?? ""),
        price: Number(x.price ?? 0),
        imageUrl: x.imageUrl ?? null,
        isAvailable: x.isAvailable !== false,
        // metadata for diffing (kept in cache; customer API can ignore if needed)
        updatedAtMs: x.updatedAt?.toMillis ? Number(x.updatedAt.toMillis()) : null,
      };
    });

    const nowMs = Date.now();

    await db.doc("catalogCache/main").set(
      {
        updatedAtMs: nowMs,
        itemCount: items.length,
        items,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, itemCount: items.length, updatedAtMs: nowMs });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
