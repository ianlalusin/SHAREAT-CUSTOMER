import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/admin/access";

export const runtime = "nodejs";

const MAX_RESULTS = 50;

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  try {
    // The whole chain catalog, with no store dimension to scope it by, so it is
    // admin-only rather than open to every active staff member.
    const gate = await requireAdmin(req);
    if (!gate.ok) return bad(gate.error, gate.status);

    const db = getAdminDb();

    const url = new URL(req.url);
    const qRaw = String(url.searchParams.get("q") || "").trim().toLowerCase();

    // POS /products is the global catalog. Order by name so the results are stable;
    // filter client-side by substring because Firestore lacks a case-insensitive
    // contains operator and the catalog is small.
    const snap = await db.collection("products").orderBy("name", "asc").get();

    const all = snap.docs
      .map((d) => {
        const x = d.data() as any;
        const name = String(x?.name ?? "");
        const variant = x?.variantLabel || x?.variant || "";
        const displayName = variant ? `${name} (${variant})` : name;
        return {
          id: d.id,
          name,
          variant: variant ? String(variant) : "",
          displayName,
          category: String(x?.category ?? ""),
          subCategory: String(x?.subCategory ?? ""),
          isActive: x?.isActive !== false,
        };
      })
      .filter((p) => p.isActive);

    const filtered = qRaw
      ? all.filter((p) => p.displayName.toLowerCase().includes(qRaw))
      : all;

    return NextResponse.json({
      ok: true,
      products: filtered.slice(0, MAX_RESULTS).map(({ id, name, variant, displayName, category, subCategory }) => ({
        id, name, variant, displayName, category, subCategory,
      })),
      totalMatched: filtered.length,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
