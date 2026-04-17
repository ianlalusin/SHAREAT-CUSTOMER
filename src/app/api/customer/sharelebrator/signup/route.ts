import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { normalizePhone } from "@/lib/phone";
import bcrypt from "bcryptjs";
import { FieldValue } from "firebase-admin/firestore";
import { writeLoyaltyLog } from "@/lib/server/loyaltyLog";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body.");
  }

  const phone = normalizePhone(body.phone);
  if (!phone) return bad("Invalid phone number.");

  const password = String(body.password || "");
  if (password.length < 6) return bad("Password must be at least 6 characters.");

  const name = String(body.name || "").trim();
  if (!name) return bad("Name is required.");

  const address = String(body.address || "").trim();
  if (!address) return bad("Address is required.");

  const bday = String(body.bday || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bday)) return bad("Birthday must be YYYY-MM-DD.");
  const bdayDate = new Date(bday + "T00:00:00");
  if (isNaN(bdayDate.getTime()) || bdayDate.toISOString().slice(0, 10) !== bday) return bad("Invalid date.");

  const email = body.email ? String(body.email).trim() : undefined;

  const db = getAdminDb();
  const ref = db.doc(`customers/${phone}`);
  const existing = await ref.get();
  if (existing.exists) return bad("A Sharelebrator account with this phone already exists.", 409);

  const passwordHash = await bcrypt.hash(password, 10);

  await ref.set({
    phone,
    passwordHash,
    name,
    address,
    email: email ?? null,
    bday,
    pointsBalance: 0,
    visitCount: 0,
    storeVisits: {},
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Audit log (individual + daily projection)
  await writeLoyaltyLog({
    type: "account_created",
    phone,
    customerName: name,
    actorUid: phone, // self-serve signup
    source: "home_page",
  });

  // Global aggregate projection
  await db.doc("loyaltyStats/global").set(
    {
      totalAccounts: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const token = await getAdminAuth().createCustomToken(phone, {
    loyaltyCustomer: true,
    phone,
  });

  return NextResponse.json({ ok: true, token, name, phone });
}
