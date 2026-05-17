import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { verifyJoinToken } from "@/lib/server/customer-join-token";
import { claimOrReuseParticipantSlot, hashDeviceId } from "@/lib/server/customer-participants";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

async function loadSessionProjection(db: any, sessionId: string) {
  const candidates = [
    "activeSessionProjections", "activeSessionProjection", "activeSessionsProjection",
    "activeSessionsProjections", "sessionProjections", "activeSessions", "sessions",
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
  let body: { token?: string; deviceId?: string };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body.");
  }

  const rawToken = String(body?.token || "").trim();
  if (!rawToken) return bad("Join token is required.");

  const rawDeviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : null;
  const deviceIdHash = rawDeviceId ? hashDeviceId(rawDeviceId) : null;

  let payload;
  try {
    payload = verifyJoinToken(rawToken);
  } catch (e: any) {
    return bad(e.message, 403);
  }

  const storeId = payload.s;
  const sessionId = payload.i;
  const joinVersion = payload.v;

  const db = getAdminDb();
  const auth = getAdminAuth();

  const sessSnap = await db.doc(`stores/${storeId}/activeSessions/${sessionId}`).get();
  if (!sessSnap.exists) return bad("Session not found.", 404);

  const sess = sessSnap.data() as any;

  if (sess.customerAccessEnabled !== true) return bad("Customer access has been disabled.", 403);
  if (Number(sess.customerAccessExpiresAtMs || 0) <= Date.now()) return bad("Customer access expired.", 403);

  const liveJoinVersion = Number(sess.customerJoinVersion || 0);
  if (joinVersion !== liveJoinVersion) {
    return bad("This QR code is no longer valid. Please use the latest printed slip.", 403);
  }

  let slot;
  try {
    slot = await claimOrReuseParticipantSlot(db, {
      storeId,
      sessionId,
      deviceIdHash,
      joinMethod: "qr",
      pinSnapshot: String(sess.customerPin || ""),
      customerNameSnapshot: sess.customerName ?? null,
      tableDisplayNameSnapshot: sess.tableDisplayName ?? null,
    });
  } catch (e: any) {
    return bad(e.message, (e as any).httpStatus || 400);
  }

  const token = await auth.createCustomToken(slot.claimedByUid, {
    customer: true,
    storeId,
    sessionId,
    participantId: slot.participantId,
  });

  const projection = await loadSessionProjection(db, sessionId);

  return NextResponse.json({
    ok: true,
    token,
    storeId,
    sessionId,
    expiresAtMs: Number(sess.customerAccessExpiresAtMs),
    participantId: slot.participantId,
    slotNumber: slot.slotNumber,
    customerName: sess.customerName ?? projection?.customerName ?? null,
    tableId: projection?.tableId ?? null,
    tableNumber: String(sess.tableNumber || projection?.tableNumber || ""),
    tableDisplayName: String(sess.tableDisplayName || projection?.tableDisplayName || ""),
    packageOfferingId: String(sess.packageOfferingId || projection?.packageOfferingId || ""),
    packageName: projection?.packageName ?? projection?.packageSnapshot?.name ?? null,
    initialFlavorIds: Array.isArray(sess.initialFlavorIds) ? sess.initialFlavorIds : [],
  });
}
