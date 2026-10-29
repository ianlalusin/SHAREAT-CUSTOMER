import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { normalizePhone } from "@/lib/phone";
import bcrypt from "bcryptjs";
import { writeLoyaltyLog } from "@/lib/server/loyaltyLog";
import { RATE_RULES, clientIp, consumeRateLimits, tooManyAttempts } from "@/lib/server/rate-limit";
import { birthdayError } from "@/lib/server/signup-fields";
import { createCustomerAccount } from "@/lib/server/create-customer";

export const runtime = "nodejs";

const ALREADY_EXISTS = "A Sharelebrator account with this phone already exists.";

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

  // Optional: only printed on official receipts (privacy notice, data minimisation).
  const address = String(body.address || "").trim().slice(0, 200);
  // Consent to the privacy notice comes before any account exists; the notice
  // version is stamped on the account by createCustomerAccount.
  if ((body as any).acceptPrivacy !== true) {
    return bad("Please agree to the Privacy Notice to create a card. If you do not see it, refresh the page.");
  }

  const bday = String(body.bday || "").trim();
  const bdayErr = birthdayError(bday);
  if (bdayErr) return bad(bdayErr);

  const email = body.email ? String(body.email).trim() : undefined;

  const db = getAdminDb();
  // Every attempt counts, not just failures: each one costs a bcrypt hash and,
  // when it succeeds, a permanent account.
  const gate = await consumeRateLimits(db, [[RATE_RULES.signupIp, clientIp(req)]]);
  if (!gate.ok) return tooManyAttempts(gate.retryAfterMs);

  const ref = db.doc(`customers/${phone}`);
  const existing = await ref.get();
  if (existing.exists) return bad(ALREADY_EXISTS, 409);

  const passwordHash = await bcrypt.hash(password, 10);

  // The read above is only an early exit — two signups for one phone can both
  // pass it while bcrypt runs. The create is the real check.
  const created = await createCustomerAccount(db, ref, {
    phone,
    passwordHash,
    name,
    address,
    email: email ?? null,
    bday,
  });
  if (!created) return bad(ALREADY_EXISTS, 409);

  // Audit log (individual + daily projection)
  await writeLoyaltyLog({
    type: "account_created",
    phone,
    customerName: name,
    actorUid: phone, // self-serve signup
    source: "home_page",
  });

  const token = await getAdminAuth().createCustomToken(phone, {
    loyaltyCustomer: true,
    phone,
  });

  return NextResponse.json({ ok: true, token, name, phone });
}
