import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { normalizePhone } from "@/lib/phone";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return bad("Missing bearer token.", 401);

  let decoded: any;
  try {
    decoded = await getAdminAuth().verifyIdToken(match[1]);
  } catch {
    return bad("Invalid token.", 401);
  }

  if (decoded.customer !== true && decoded.loyaltyCustomer !== true) {
    return bad("Unauthorized.", 403);
  }

  const url = new URL(req.url);
  const phone = normalizePhone(url.searchParams.get("phone"));
  if (!phone) return bad("Invalid phone number format.");

  const db = getAdminDb();
  const snap = await db.doc(`customers/${phone}`).get();
  if (!snap.exists) return bad("No account found for this number.", 404);

  const data = snap.data() as any;
  return NextResponse.json({
    ok: true,
    name: String(data.name || ""),
  });
}
