import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

type Body = { pin?: string };

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad("Invalid JSON body.");
  }

  const pinRaw = (body.pin || "").trim().toUpperCase();
  if (!pinRaw) return bad("PIN is required.");

  const db = getAdminDb();
  const auth = getAdminAuth();

  const pinRef = db.doc(`pinRegistry/${pinRaw}`);
  const pinSnap = await pinRef.get();

  if (!pinSnap.exists) return bad("Invalid PIN.", 404);

  const data = pinSnap.data() as any;

  // Required fields
  const storeId = String(data.storeId || "");
  const sessionId = String(data.sessionId || "");
  const status = String(data.status || "");
  const expiresAtMs = Number(data.expiresAtMs || 0);

  if (!storeId || !sessionId) return bad("PIN is misconfigured.", 500);
  if (status !== "active") return bad("PIN is not active.", 403);
  if (!expiresAtMs || expiresAtMs <= Date.now()) return bad("PIN expired.", 403);

  // Mint custom token with claims
  // We use a "synthetic uid" so customers are isolated from staff accounts.
  const customerUid = `cust_${pinRaw}_${sessionId}`;

  const token = await auth.createCustomToken(customerUid, {
    customer: true,
    storeId,
    sessionId,
    pin: pinRaw,
  });

  return NextResponse.json({
    ok: true,
    token,
    storeId,
    sessionId,
    expiresAtMs,
  });
}