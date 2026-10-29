import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { normalizePhone } from "@/lib/phone";
import bcrypt from "bcryptjs";
import { writeLoyaltyLog } from "@/lib/server/loyaltyLog";
import { readCustomerPasswordHash } from "@/lib/server/customer-secrets";
import {
  RATE_RULES,
  checkRateLimits,
  clientIp,
  recordRateLimitFailures,
  tooManyAttempts,
  type RateHit,
} from "@/lib/server/rate-limit";

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
  // Budgets count failures only, so a diner who types it right never pays.
  // Checked before bcrypt: a refused guess should cost us nothing.
  const limits: RateHit[] = [
    [RATE_RULES.loginPhone, phone],
    [RATE_RULES.loginIp, clientIp(req)],
  ];
  const gate = await checkRateLimits(db, limits);
  if (!gate.ok) return tooManyAttempts(gate.retryAfterMs);

  const snap = await db.doc(`customers/${phone}`).get();
  if (!snap.exists) {
    await recordRateLimitFailures(db, limits);
    await writeLoyaltyLog({
      type: "login_failed",
      phone,
      customerName: "",
      actorUid: phone,
      source: "standalone",
    });
    // Same message as a wrong password: a distinct one tells anyone which
    // phone numbers have accounts.
    return bad("Incorrect phone or password.", 401);
  }

  const data = snap.data() as any;
  const match = await bcrypt.compare(password, await readCustomerPasswordHash(db, phone, data));
  if (!match) {
    await recordRateLimitFailures(db, limits);
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
