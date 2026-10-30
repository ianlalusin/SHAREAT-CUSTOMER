import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { DecodedIdToken } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { resolveCardholder } from "@/lib/server/cardholder";
import { readCustomerPasswordHash } from "@/lib/server/customer-secrets";
import { RATE_RULES, checkRateLimits, clientIp, recordRateLimitFailures, tooManyAttempts } from "@/lib/server/rate-limit";

/**
 * Door for "do something to my own account" routes (download my data, delete my
 * card; audit PRV-02a). The caller must be the card's owner AND type the card's
 * password again, so a borrowed phone or a table-mate cannot take or erase
 * someone's data. Wrong passwords are budgeted exactly like logins, so the
 * password cannot be guessed here either.
 */
export type SelfServiceAuth =
  | {
      ok: true;
      db: Firestore;
      decoded: DecodedIdToken;
      phone: string;
      profile: Record<string, unknown>;
      body: Record<string, unknown>;
    }
  | { ok: false; response: NextResponse };

function fail(msg: string, status: number): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ ok: false, error: msg }, { status }) };
}

export async function authorizeSelfService(req: Request): Promise<SelfServiceAuth> {
  const match = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return fail("Missing bearer token.", 401);

  let decoded: DecodedIdToken;
  try {
    decoded = await getAdminAuth().verifyIdToken(match[1]);
  } catch {
    return fail("Invalid token.", 401);
  }

  const db = getAdminDb();
  const who = await resolveCardholder(db, decoded);
  if (!who.ok) return fail(who.message, who.status);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail("Invalid JSON body.", 400);
  }
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password) return fail("Enter your password to continue.", 400);

  const limits: [typeof RATE_RULES.loginPhone, string][] = [
    [RATE_RULES.loginPhone, who.phone],
    [RATE_RULES.loginIp, clientIp(req)],
  ];
  const gate = await checkRateLimits(db, limits);
  if (!gate.ok) return { ok: false, response: tooManyAttempts(gate.retryAfterMs) };

  const snap = await db.doc(`customers/${who.phone}`).get();
  if (!snap.exists) return fail("Account not found.", 404);
  const profile = snap.data() as Record<string, unknown>;

  const ok = await bcrypt.compare(password, await readCustomerPasswordHash(db, who.phone, profile));
  if (!ok) {
    await recordRateLimitFailures(db, limits);
    return fail("Incorrect password.", 401);
  }
  return { ok: true, db, decoded, phone: who.phone, profile, body };
}
