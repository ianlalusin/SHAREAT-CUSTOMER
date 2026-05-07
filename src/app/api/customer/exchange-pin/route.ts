import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { loadAndValidateSessionAccess } from "@/lib/server/customer-session-access";
import { claimOrReuseParticipantSlot, hashDeviceId } from "@/lib/server/customer-participants";

export const runtime = "nodejs";

type Body = { pin?: string; deviceId?: string };

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
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad("Invalid JSON body.");
  }

  const pinRaw = (body.pin || "").trim().toUpperCase();
  if (!pinRaw) return bad("PIN is required.");

  const rawDeviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : null;
  const deviceIdHash = rawDeviceId ? hashDeviceId(rawDeviceId) : null;

  const db = getAdminDb();
  const auth = getAdminAuth();

  const pinSnap = await db.doc(`pinRegistry/${pinRaw}`).get();
  if (!pinSnap.exists) return bad("Invalid PIN.", 404);

  const pinData = pinSnap.data() as any;
  const storeId = String(pinData.storeId || "");
  const sessionId = String(pinData.sessionId || "");
  const pinStatus = String(pinData.status || "");
  const expiresAtMs = Number(pinData.expiresAtMs || 0);

  if (!storeId || !sessionId) return bad("Invalid or expired PIN.", 400);
  if (pinStatus !== "active") return bad("Invalid or expired PIN.", 400);
  if (!expiresAtMs || expiresAtMs <= Date.now()) return bad("Invalid or expired PIN.", 400);

  let sessionAccess;
  try {
    sessionAccess = await loadAndValidateSessionAccess(db, storeId, sessionId);
  } catch (e: any) {
    return bad(e.message, e.httpStatus || 400);
  }

  let slot;
  try {
    slot = await claimOrReuseParticipantSlot(db, {
      storeId,
      sessionId,
      deviceIdHash,
      joinMethod: "pin",
      pinSnapshot: pinRaw,
      customerNameSnapshot: sessionAccess.customerName,
      tableDisplayNameSnapshot: sessionAccess.tableDisplayName,
    });
  } catch (e: any) {
    return bad(e.message, e.httpStatus || 400);
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
    expiresAtMs: sessionAccess.customerAccessExpiresAtMs,
    participantId: slot.participantId,
    slotNumber: slot.slotNumber,
    customerName: sessionAccess.customerName ?? projection?.customerName ?? null,
    tableId: projection?.tableId ?? null,
    tableNumber: sessionAccess.tableNumber || projection?.tableNumber || null,
    tableDisplayName: sessionAccess.tableDisplayName || projection?.tableDisplayName || null,
    packageOfferingId: sessionAccess.packageOfferingId || projection?.packageOfferingId || null,
    packageName: projection?.packageName ?? projection?.packageSnapshot?.name ?? null,
    initialFlavorIds: sessionAccess.initialFlavorIds,
  });
}
