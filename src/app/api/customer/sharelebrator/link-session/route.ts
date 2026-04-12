import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { normalizePhone } from "@/lib/phone";
import bcrypt from "bcryptjs";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

type LoginBody = {
  mode: "login";
  phone: string;
  password: string;
};

type SignupBody = {
  mode: "signup";
  phone: string;
  password: string;
  name: string;
  address: string;
  email?: string;
  bday: string;
};

type Body = LoginBody | SignupBody;

export async function POST(req: Request) {
  // Verify the session token (customer:true with storeId + sessionId)
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return bad("Missing session token.", 401);

  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(match[1]);
  } catch {
    return bad("Invalid session token.", 401);
  }

  if (decoded.customer !== true) return bad("Not a customer session.", 403);
  const storeId = String(decoded.storeId || "");
  const sessionId = String(decoded.sessionId || "");
  if (!storeId || !sessionId) return bad("Session claims missing storeId/sessionId.", 403);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad("Invalid JSON body.");
  }

  const phone = normalizePhone(body.phone);
  if (!phone) return bad("Invalid phone number.");

  const password = String(body.password || "");
  if (password.length < 6) return bad("Password must be at least 6 characters.");

  const db = getAdminDb();
  const customerRef = db.doc(`customers/${phone}`);

  // Resolve customer (login or signup)
  let customerName: string;

  if (body.mode === "login") {
    const snap = await customerRef.get();
    if (!snap.exists) return bad("Account not found.", 401);
    const data = snap.data() as any;
    const matchPw = await bcrypt.compare(password, data.passwordHash || "");
    if (!matchPw) return bad("Incorrect phone or password.", 401);
    customerName = data.name;
  } else if (body.mode === "signup") {
    const existing = await customerRef.get();
    if (existing.exists) return bad("Account with this phone already exists. Try Log In.", 409);

    const name = String(body.name || "").trim();
    if (!name) return bad("Name is required.");
    const address = String(body.address || "").trim();
    if (!address) return bad("Address is required.");
    const bday = String(body.bday || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bday)) return bad("Birthday must be YYYY-MM-DD.");
    const email = body.email ? String(body.email).trim() : undefined;

    const passwordHash = await bcrypt.hash(password, 10);
    await customerRef.set({
      phone,
      passwordHash,
      name,
      address,
      email: email ?? null,
      bday,
      pointsBalance: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    customerName = name;
  } else {
    return bad("Unknown mode.");
  }

  // Write link to session — reject if already locked
  const activeRef = db.doc(`stores/${storeId}/activeSessions/${sessionId}`);
  const sessionRef = db.doc(`stores/${storeId}/sessions/${sessionId}`);

  const activeSnap = await activeRef.get();
  if (activeSnap.exists) {
    const sData = activeSnap.data() as any;
    if (sData.linkedCustomerLockedAt) {
      return bad("This session has already been paid; link is locked.", 409);
    }
  }

  const linkData = {
    linkedCustomerPhone: phone,
    linkedCustomerName: customerName,
  };

  const batch = db.batch();
  if (activeSnap.exists) batch.update(activeRef, linkData);
  const sessionSnap = await sessionRef.get();
  if (sessionSnap.exists) batch.update(sessionRef, linkData);
  await batch.commit();

  return NextResponse.json({ ok: true, phone, name: customerName });
}
