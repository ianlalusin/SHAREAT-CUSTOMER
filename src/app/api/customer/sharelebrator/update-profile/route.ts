import { NextResponse } from "next/server";
import { birthdayError } from "@/lib/server/signup-fields";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { readCustomerPasswordHash, stageCustomerPasswordHash } from "@/lib/server/customer-secrets";
import bcrypt from "bcryptjs";
import { FieldValue } from "firebase-admin/firestore";
import { resolveSessionCard } from "@/lib/server/session-link";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return bad("Missing bearer token.", 401);

  let decoded: any;
  try {
    decoded = await getAdminAuth().verifyIdToken(match[1]);
  } catch {
    return bad("Invalid token.", 401);
  }

  const db = getAdminDb();

  // Resolve phone + session context from either auth mode
  let phone: string | null = null;
  let storeId = "";
  let sessionId = "";

  if (decoded.customer === true) {
    storeId = String(decoded.storeId || "");
    sessionId = String(decoded.sessionId || "");
    if (!storeId || !sessionId) return bad("Session claims missing storeId/sessionId.", 403);

    const activeSnap = await db.doc(`stores/${storeId}/activeSessions/${sessionId}`).get();
    // Only the participant that linked the card may edit it (password is also
    // required below); a cashier link is earn-only.
    const card = resolveSessionCard(activeSnap.data(), String(decoded.participantId || ""));
    if (!card.ok) {
      return card.reason === "none"
        ? bad("No linked Sharelebrator account on this session.", 404)
        : bad(card.message, 403);
    }
    phone = card.phone;
  } else if (decoded.loyaltyCustomer === true) {
    phone = String(decoded.phone || "");
    if (!phone) return bad("Loyalty token missing phone claim.", 403);
  } else {
    return bad("Unauthorized token type.", 403);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body.");
  }

  const currentPassword = String(body.currentPassword || "");
  if (!currentPassword) return bad("Current password is required.");

  const customerRef = db.doc(`customers/${phone}`);
  const customerSnap = await customerRef.get();
  if (!customerSnap.exists) return bad("Customer not found.", 404);

  const customerData = customerSnap.data() as any;
  const pwMatch = await bcrypt.compare(currentPassword, await readCustomerPasswordHash(db, phone, customerData));
  if (!pwMatch) return bad("Current password is incorrect.", 401);

  const patch: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() };

  // Profile fields
  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim();
  }
  // Address is optional, so an empty value clears it — a diner can take it off
  // their card, as the privacy notice says they can.
  if (typeof body.address === "string") {
    patch.address = body.address.trim().slice(0, 200);
  }
  if (body.email !== undefined) {
    const email = typeof body.email === "string" ? body.email.trim() : "";
    patch.email = email || null;
  }
  if (typeof body.bday === "string" && body.bday.trim()) {
    const bdayErr = birthdayError(body.bday.trim());
    if (bdayErr) return bad(bdayErr);
    patch.bday = body.bday.trim();
  }

  // Optional password change: secret doc and profile in one batch.
  const profileBatch = db.batch();
  if (body.newPassword !== undefined && body.newPassword !== "") {
    const newPassword = String(body.newPassword);
    if (newPassword.length < 6) return bad("New password must be at least 6 characters.");
    Object.assign(patch, stageCustomerPasswordHash(profileBatch, db, phone, await bcrypt.hash(newPassword, 10)));
  }

  profileBatch.update(customerRef, patch);
  await profileBatch.commit();

  // If name changed AND we're in a session, sync denormalized linkedCustomerName
  if (patch.name && storeId && sessionId) {
    const nameUpdate = { linkedCustomerName: patch.name };
    const batch = db.batch();
    batch.update(db.doc(`stores/${storeId}/activeSessions/${sessionId}`), nameUpdate);
    const sessionRef = db.doc(`stores/${storeId}/sessions/${sessionId}`);
    const sessionSnap = await sessionRef.get();
    if (sessionSnap.exists) batch.update(sessionRef, nameUpdate);
    await batch.commit();
  }

  return NextResponse.json({ ok: true });
}
