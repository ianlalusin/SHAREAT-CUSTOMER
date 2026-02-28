import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const db = adminDb();
  const snap = await db
    .collection("publicCustomerRequests")
    .orderBy("createdAt", "desc")
    .limit(10)
    .get();

  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return NextResponse.json(
    { ok: true, items },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
