import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

type Body = { pin?: string };

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

async function loadSessionProjection(db: any, sessionId: string) {
  // Try common collection names (no breaking if you rename later)
  const candidates = [
    "activeSessionProjections",
    "activeSessionProjection",
    "activeSessionsProjection",
    "activeSessionsProjections",
    "sessionProjections",
    "activeSessions",
    "sessions",
  ];

  for (const col of candidates) {
    try {
      const snap = await db.doc(`${col}/${sessionId}`).get();
      if (snap.exists) return { id: snap.id, ...(snap.data() as any) };
    } catch {}
  }
  return null;
}

export async function POST(req: Request) {
  try {
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

  const storeId = String(data.storeId || "");
  const sessionId = String(data.sessionId || "");
  const status = String(data.status || "");
  const expiresAtMs = Number(data.expiresAtMs || 0);

  if (!storeId || !sessionId) return bad("PIN is misconfigured.", 500);
  if (status !== "active") return bad("PIN is not active.", 403);
  if (!expiresAtMs || expiresAtMs <= Date.now()) return bad("PIN expired.", 403);

  // Pull projection so the client has correct table/package/flavors immediately
  const projection = await loadSessionProjection(db, sessionId);

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

    // session projection fields (best-effort)
    customerName: projection?.customerName ?? null,
    tableId: projection?.tableId ?? null,
    tableNumber: projection?.tableNumber ?? null,
    tableDisplayName: projection?.tableDisplayName ?? null,
    packageOfferingId: projection?.packageOfferingId ?? null,
    packageName: projection?.packageName ?? projection?.packageSnapshot?.name ?? null,
    initialFlavorIds: Array.isArray(projection?.initialFlavorIds) ? projection.initialFlavorIds : [],
  });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
