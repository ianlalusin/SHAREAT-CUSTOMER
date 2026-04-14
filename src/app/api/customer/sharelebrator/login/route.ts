import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { normalizePhone } from "@/lib/phone";
import bcrypt from "bcryptjs";
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
  if (!password) return bad("Password is required.");

  const db = getAdminDb();
  const snap = await db.doc(`customers/${phone}`).get();
  if (!snap.exists) {
    await writeLoyaltyLog({
      type: "login_failed",
      phone,
      customerName: "",
      actorUid: phone,
      source: "standalone",
    });
    return bad("Account not found.", 401);
  }

  const data = snap.data() as any;
  const match = await bcrypt.compare(password, data.passwordHash || "");
  if (!match) {
    await writeLoyaltyLog({
      type: "login_failed",
      phone,
      customerName: data.name || "",
      actorUid: phone,
      source: "standalone",
    });
    return bad("Incorrect phone or password.", 401);
  }

  const token = await getAdminAuth().createCustomToken(phone, {
    loyaltyCustomer: true,
    phone,
  });

  await writeLoyaltyLog({
    type: "login",
    phone,
    customerName: data.name || "",
    actorUid: phone,
    source: "standalone",
  });

  return NextResponse.json({ ok: true, token, name: data.name, phone });
}
